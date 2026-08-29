import { Router } from "express";
import { z } from "zod";
import { AccessToken } from "livekit-server-sdk";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { generateCloudflareIceServers } from "../services/turn.js";
import { notifyUser } from "../services/push.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

export const calls = Router();

// Shared Call Status State Machine Definition
export type CallStatus =
  | "initiating"
  | "ringing"
  | "accepted"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "declined"
  | "busy"
  | "missed"
  | "failed"
  | "ended";

const VALID_TRANSITIONS: Record<CallStatus, CallStatus[]> = {
  initiating: ["ringing", "failed"],
  ringing: ["accepted", "declined", "busy", "missed", "failed", "ended"],
  accepted: ["connecting", "failed", "ended"],
  connecting: ["connected", "failed", "ended"],
  connected: ["reconnecting", "ended", "failed"],
  reconnecting: ["connected", "failed", "ended"],
  declined: [],
  busy: [],
  missed: [],
  failed: [],
  ended: [],
};

export function isValidTransition(from: CallStatus, to: CallStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------------------------------------------------------------------------
// In-Memory Safe Aggregate Call Metrics (Never logs SDP or private IPs)
// ---------------------------------------------------------------------------
export const callMetrics = {
  totalAttempts: 0,
  successfulCalls: 0,
  p2pCount: 0,
  turnCount: 0,
  reconnectCount: 0,
  totalDurationSeconds: 0,
  totalSetupTimeMs: 0,
  setupSamples: 0,
  failureReasons: {} as Record<string, number>,

  recordAttempt() {
    this.totalAttempts++;
  },
  recordSuccess(relayUsed: boolean, setupTimeMs?: number) {
    this.successfulCalls++;
    if (relayUsed) {
      this.turnCount++;
    } else {
      this.p2pCount++;
    }
    if (setupTimeMs && setupTimeMs > 0) {
      this.totalSetupTimeMs += setupTimeMs;
      this.setupSamples++;
    }
  },
  recordEnd(reason: string, durationSeconds: number, reconnects = 0) {
    this.totalDurationSeconds += durationSeconds;
    this.reconnectCount += reconnects;
    if (reason && reason !== "hangup" && reason !== "normal_hangup") {
      this.failureReasons[reason] = (this.failureReasons[reason] || 0) + 1;
    }
  },
  getSummary() {
    return {
      totalAttempts: this.totalAttempts,
      successfulCalls: this.successfulCalls,
      p2pCount: this.p2pCount,
      turnCount: this.turnCount,
      p2pRatio: this.successfulCalls > 0 ? Number((this.p2pCount / this.successfulCalls).toFixed(2)) : 1,
      turnRatio: this.successfulCalls > 0 ? Number((this.turnCount / this.successfulCalls).toFixed(2)) : 0,
      reconnectCount: this.reconnectCount,
      avgDurationSeconds: this.successfulCalls > 0 ? Math.round(this.totalDurationSeconds / this.successfulCalls) : 0,
      avgSetupTimeMs: this.setupSamples > 0 ? Math.round(this.totalSetupTimeMs / this.setupSamples) : 0,
      failureReasons: this.failureReasons,
    };
  },
};

/**
 * Server-authoritative Provider Selection
 */
export async function getProviderForCall(callId: string, userId: string, userName: string) {
  if (env.P2P_CALLS_ENABLED) {
    return {
      provider: "webrtc" as const,
      providerConfig: {},
    };
  }

  // Fallback to LiveKit SFU Cloud
  const livekitKey = env.LIVEKIT_API_KEY || process.env.LIVEKIT_API_KEY;
  const livekitSecret = env.LIVEKIT_API_SECRET || process.env.LIVEKIT_API_SECRET;
  const livekitUrl = env.LIVEKIT_URL || process.env.LIVEKIT_URL || "wss://livekit.skillbridge.app";

  if (livekitKey && livekitSecret) {
    const at = new AccessToken(livekitKey, livekitSecret, {
      identity: userId,
      name: userName,
      ttl: "1h",
      metadata: JSON.stringify({ callId }),
    });
    at.addGrant({
      roomJoin: true,
      room: `skillbridge-call-${callId}`,
      canSubscribe: true,
      canPublish: true,
      canPublishData: true,
    });
    return {
      provider: "livekit" as const,
      providerConfig: {
        url: livekitUrl,
        roomName: `skillbridge-call-${callId}`,
        token: await at.toJwt(),
      },
    };
  }

  return {
    provider: "livekit" as const,
    providerConfig: {
      url: livekitUrl,
      roomName: `skillbridge-call-${callId}`,
      token: "mock_livekit_token",
    },
  };
}

// 1. GET /api/v1/calls/ice-servers
calls.get(
  "/ice-servers",
  wrap(async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
    const iceConfig = await generateCloudflareIceServers();
    res.json(iceConfig);
  }),
);

// 2. GET /api/v1/calls/metrics
calls.get(
  "/metrics",
  wrap(async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
    res.json({ metrics: callMetrics.getSummary() });
  }),
);

// 3. GET /api/v1/calls/history
calls.get(
  "/history",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const limit = Math.min(Number(req.query.limit) || 30, 100);

    const { data: callRecords, error } = await admin
      .from("calls")
      .select("*, caller:caller_id(full_name, username, avatar_url), callee:callee_id(full_name, username, avatar_url)")
      .or(`caller_id.eq.${userId},callee_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return res.json({ calls: [] });
    }

    res.json({ calls: callRecords || [] });
  }),
);

// 4. POST /api/v1/calls (Initiate Call)
calls.post(
  "/",
  wrap(async (req, res) => {
    const callerId = req.userId!;
    const body = z
      .object({
        calleeId: z.string().uuid(),
        type: z.enum(["audio", "video"]).default("video"),
      })
      .parse(req.body);

    const { calleeId, type } = body;

    if (callerId === calleeId) {
      return res.status(400).json({ error: "Cannot initiate call to yourself." });
    }

    // Check if callee exists and is active
    const { data: calleeProfile } = await admin
      .from("profiles")
      .select("id, full_name, username, avatar_url, account_status")
      .eq("id", calleeId)
      .maybeSingle();

    if (!calleeProfile) {
      return res.status(404).json({ error: "Callee not found." });
    }

    if (calleeProfile.account_status === "suspended" || calleeProfile.account_status === "banned") {
      return res.status(403).json({ error: "Cannot call suspended user." });
    }

    // Check block relationship
    const { data: blockRecord } = await admin
      .from("user_blocks")
      .select("id")
      .or(
        `and(blocker_id.eq.${callerId},blocked_id.eq.${calleeId}),and(blocker_id.eq.${calleeId},blocked_id.eq.${callerId})`,
      )
      .maybeSingle();

    if (blockRecord) {
      return res.status(403).json({ error: "Cannot connect call due to privacy settings." });
    }

    // Check if callee is in an active call
    const { data: activeCall } = await admin
      .from("calls")
      .select("id")
      .or(`caller_id.eq.${calleeId},callee_id.eq.${calleeId}`)
      .in("status", ["ringing", "accepted", "connecting", "connected", "reconnecting"])
      .maybeSingle();

    if (activeCall) {
      callMetrics.failureReasons["callee_busy"] = (callMetrics.failureReasons["callee_busy"] || 0) + 1;
      return res.status(409).json({ error: "User is currently busy on another call.", status: "busy" });
    }

    // Get caller profile for push notification
    const { data: callerProfile } = await admin
      .from("profiles")
      .select("full_name, username, avatar_url")
      .eq("id", callerId)
      .maybeSingle();

    const callerName = callerProfile?.full_name || callerProfile?.username || "SkillBridge User";

    callMetrics.recordAttempt();

    // Insert call record
    const { data: callRecord, error: insertErr } = await admin
      .from("calls")
      .insert({
        caller_id: callerId,
        callee_id: calleeId,
        type,
        status: "ringing",
        ringing_at: new Date().toISOString(),
        metadata: {
          callerName,
          callerAvatar: callerProfile?.avatar_url || null,
        },
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    // Server-authoritative provider selection
    const { provider, providerConfig } = await getProviderForCall(callRecord.id, callerId, callerName);

    // Send push notification to callee for background/offline alert
    try {
      await notifyUser(
        calleeId,
        `Incoming ${type === "video" ? "Video" : "Audio"} Call`,
        `${callerName} is calling you on SkillBridge…`,
        "call",
        {
          callId: callRecord.id,
          callerId,
          callerName,
          callerAvatar: callerProfile?.avatar_url || "",
          callType: type,
          provider,
        },
      );
    } catch (err) {
      logger.warn(
        {
          event: "call_push_dispatch_failed",
          callerId,
          calleeId,
          err: err instanceof Error ? err.message : err,
        },
        "Failed to dispatch call push notification",
      );
    }

    res.status(201).json({
      call: callRecord,
      provider,
      providerConfig,
    });
  }),
);

// 5. GET /api/v1/calls/:id
calls.get(
  "/:id",
  wrap(async (req, res) => {
    const callId = z.string().uuid().parse(req.params.id);
    const userId = req.userId!;

    const { data: callRecord, error } = await admin
      .from("calls")
      .select("*, caller:caller_id(full_name, username, avatar_url), callee:callee_id(full_name, username, avatar_url)")
      .eq("id", callId)
      .maybeSingle();

    if (error || !callRecord) {
      return res.status(404).json({ error: "Call record not found." });
    }

    if (callRecord.caller_id !== userId && callRecord.callee_id !== userId) {
      return res.status(403).json({ error: "Unauthorized access to call record." });
    }

    res.json({ call: callRecord });
  }),
);

// 6. POST /api/v1/calls/:id/accept (Idempotent & Race-Condition Safe)
calls.post(
  "/:id/accept",
  wrap(async (req, res) => {
    const callId = z.string().uuid().parse(req.params.id);
    const userId = req.userId!;

    const { data: callRecord } = await admin
      .from("calls")
      .select("*")
      .eq("id", callId)
      .maybeSingle();

    if (!callRecord) return res.status(404).json({ error: "Call not found." });
    if (callRecord.callee_id !== userId) {
      return res.status(403).json({ error: "Only the callee can accept this call." });
    }

    // Idempotent return if already accepted or active
    if (callRecord.status === "accepted" || callRecord.status === "connecting" || callRecord.status === "connected") {
      const { data: calleeProfile } = await admin.from("profiles").select("full_name").eq("id", userId).maybeSingle();
      const { provider, providerConfig } = await getProviderForCall(callId, userId, calleeProfile?.full_name || "Callee");
      return res.json({ call: callRecord, provider, providerConfig });
    }

    if (!isValidTransition(callRecord.status, "accepted")) {
      return res.status(400).json({ error: `Call is no longer active (current status: ${callRecord.status}).` });
    }

    const { data: updated, error } = await admin
      .from("calls")
      .update({
        status: "accepted",
        answered_at: new Date().toISOString(),
      })
      .eq("id", callId)
      .eq("status", "ringing") // Atomic race-condition guard
      .select()
      .single();

    if (error) {
      return res.status(409).json({ error: "Call state conflict. Call was already answered or cancelled." });
    }

    const { data: calleeProfile } = await admin.from("profiles").select("full_name").eq("id", userId).maybeSingle();
    const { provider, providerConfig } = await getProviderForCall(callId, userId, calleeProfile?.full_name || "Callee");

    res.json({
      call: updated,
      provider,
      providerConfig,
    });
  }),
);

// 7. POST /api/v1/calls/:id/reject (Idempotent)
calls.post(
  "/:id/reject",
  wrap(async (req, res) => {
    const callId = z.string().uuid().parse(req.params.id);
    const userId = req.userId!;
    const { reason = "declined" } = z
      .object({ reason: z.enum(["declined", "busy"]).default("declined") })
      .parse(req.body);

    const { data: callRecord } = await admin
      .from("calls")
      .select("*")
      .eq("id", callId)
      .maybeSingle();

    if (!callRecord) return res.status(404).json({ error: "Call not found." });
    if (callRecord.callee_id !== userId && callRecord.caller_id !== userId) {
      return res.status(403).json({ error: "Unauthorized." });
    }

    const targetStatus: CallStatus = reason === "busy" ? "busy" : "declined";

    // Idempotent return if already in target status or ended
    if (callRecord.status === targetStatus || callRecord.status === "ended") {
      return res.json({ call: callRecord });
    }

    if (!isValidTransition(callRecord.status, targetStatus)) {
      return res.status(400).json({ error: `Cannot reject call in ${callRecord.status} status.` });
    }

    const { data: updated, error } = await admin
      .from("calls")
      .update({
        status: targetStatus,
        ended_at: new Date().toISOString(),
        end_reason: reason,
      })
      .eq("id", callId)
      .select()
      .single();

    if (error) throw error;
    callMetrics.recordEnd(reason, 0);

    res.json({ call: updated });
  }),
);

// 8. POST /api/v1/calls/:id/end (Idempotent with Safe Telemetry)
calls.post(
  "/:id/end",
  wrap(async (req, res) => {
    const callId = z.string().uuid().parse(req.params.id);
    const userId = req.userId!;
    const body = z
      .object({
        reason: z.string().max(50).default("hangup"),
        durationSeconds: z.number().int().min(0).max(86400).default(0),
        relayUsed: z.boolean().optional(),
        setupTimeMs: z.number().int().min(0).max(60000).optional(),
        reconnectCount: z.number().int().min(0).max(50).optional(),
      })
      .parse(req.body);

    const { reason, durationSeconds, relayUsed = false, setupTimeMs, reconnectCount = 0 } = body;

    const { data: callRecord } = await admin
      .from("calls")
      .select("*")
      .eq("id", callId)
      .maybeSingle();

    if (!callRecord) return res.status(404).json({ error: "Call not found." });
    if (callRecord.caller_id !== userId && callRecord.callee_id !== userId) {
      return res.status(403).json({ error: "Unauthorized." });
    }

    // Idempotent return if already ended
    if (callRecord.status === "ended" || callRecord.status === "missed") {
      return res.json({ call: callRecord });
    }

    const targetStatus: CallStatus = callRecord.status === "ringing" ? "missed" : "ended";

    const { data: updated, error } = await admin
      .from("calls")
      .update({
        status: targetStatus,
        ended_at: new Date().toISOString(),
        duration_seconds: durationSeconds,
        end_reason: reason,
      })
      .eq("id", callId)
      .select()
      .single();

    if (error) throw error;

    if (durationSeconds > 0) {
      callMetrics.recordSuccess(relayUsed, setupTimeMs);
    }
    callMetrics.recordEnd(reason, durationSeconds, reconnectCount);

    res.json({ call: updated });
  }),
);
