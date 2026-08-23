import { Router } from "express";
import { z } from "zod";
import { AccessToken, WebhookReceiver } from "livekit-server-sdk";
import { env } from "../config/env.js";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";

export const live = Router();
export const liveWebhooks = Router();

function getWebhookReceiver(): WebhookReceiver | null {
  if (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
    return null;
  }

  return new WebhookReceiver(
    env.LIVEKIT_API_KEY,
    env.LIVEKIT_API_SECRET,
  );
}

liveWebhooks.post("/", wrap(async (req, res) => {
  if (!req.rawBody) {
    return res.status(400).send("Missing raw body");
  }
  
  const receiver = getWebhookReceiver();

  if (!receiver) {
    return res.status(503).json({
      success: false,
      error: {
        code: "LIVEKIT_DISABLED",
        message: "LiveKit webhook is not configured",
      },
    });
  }

  const event = await receiver.receive(req.rawBody, req.get("Authorization") || "");

  if (event.event === "participant_joined") {
    let meta: any = {};
    try { meta = JSON.parse(event.participant?.metadata || "{}"); } catch(e){}
    
    if (meta.sessionId && event.participant?.identity) {
      const { error: rpcErr } = await admin.rpc("record_livekit_join", {
        p_session_id: meta.sessionId,
        p_user_id: event.participant.identity,
      });
      if (rpcErr) {
        console.error(`[LIVEKIT_WEBHOOK_ERROR] record_livekit_join failed:`, rpcErr.message);
        throw rpcErr;
      }
    }
  } else if (event.event === "participant_left") {
    let meta: any = {};
    try { meta = JSON.parse(event.participant?.metadata || "{}"); } catch(e){}
    
    if (meta.sessionId && event.participant?.identity) {
      const { error: rpcErr } = await admin.rpc("record_livekit_leave", {
        p_session_id: meta.sessionId,
        p_user_id: event.participant.identity,
      });
      if (rpcErr) {
        console.error(`[LIVEKIT_WEBHOOK_ERROR] record_livekit_leave failed:`, rpcErr.message);
        throw rpcErr;
      }
    }
  } else if (event.event === "room_finished") {
    const roomName = event.room?.name || "";
    const prefix = "skillbridge-session-";
    if (roomName.startsWith(prefix)) {
      const sessionId = roomName.substring(prefix.length);
      if (sessionId) {
        const { error: updateErr } = await admin
          .from("sessions")
          .update({ status: "completed", ended_at: new Date().toISOString() })
          .eq("id", sessionId)
          .eq("status", "live");
        if (updateErr) {
          console.error(`[LIVEKIT_WEBHOOK_ERROR] room_finished session update failed:`, updateErr.message);
        }
      }
    }
  }
  
  res.status(200).json({ received: true });
}));

live.post(
  "/token/:sessionId",
  wrap(async (req, res) => {
    // Check if LiveKit credentials are configured on the backend
    if (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET || !env.LIVEKIT_URL) {
      return res.status(503).json({
        error: "LiveKit real-time service is not configured. Please set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET in backend/.env",
        code: "LIVEKIT_NOT_CONFIGURED",
      });
    }

    const paramId = z.string().uuid().parse(req.params.sessionId);
    
    // 1. Try resolving directly as session ID
    let { data: session } = await admin
      .from("sessions")
      .select("id, room_id, status, teacher_id, starts_at")
      .eq("id", paramId)
      .maybeSingle();

    // 2. If not a session ID, resolve as room ID with active/scheduled session
    if (!session) {
      const { data: roomSession } = await admin
        .from("sessions")
        .select("id, room_id, status, teacher_id, starts_at")
        .eq("room_id", paramId)
        .in("status", ["live", "scheduled"])
        .order("starts_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      session = roomSession;
    }

    // 3. If still no session, check if caller is room owner/teacher to start one
    const targetRoomId = session?.room_id || paramId;
    const { data: member } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", targetRoomId)
      .eq("user_id", req.userId!)
      .maybeSingle();
      
    if (!member) {
      return res.status(403).json({ error: "Join the learning room first" });
    }

    if (!session) {
      if (["owner", "teacher"].includes(member.role)) {
        // Automatically create live session for room host
        const { data: newSession, error: createErr } = await admin
          .from("sessions")
          .insert({
            room_id: targetRoomId,
            teacher_id: req.userId!,
            title: "Live Peer Session",
            mode: "online",
            status: "live",
            starts_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (createErr || !newSession) throw createErr || new Error("Failed to create session");
        session = newSession;
      } else {
        return res.status(404).json({ error: "No active live session found in this room" });
      }
    }

    const activeSession = session;
    if (!activeSession) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (["completed", "cancelled"].includes(activeSession.status)) {
      return res.status(403).json({ error: `Cannot join session in ${activeSession.status} state` });
    }

    const authorizedRoles = ["owner", "teacher", "moderator", "member"];
    if (!authorizedRoles.includes(member.role)) {
      return res.status(403).json({ error: "Unauthorized role" });
    }

    const canPublish = ["owner", "teacher", "moderator"].includes(member.role) || activeSession.teacher_id === req.userId;

    // Transition scheduled session to live when teacher/host joins
    if (activeSession.status === "scheduled" && canPublish) {
      await admin
        .from("sessions")
        .update({ status: "live" })
        .eq("id", activeSession.id);
    }

    // Fetch participant profile to enrich metadata
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, username, avatar_url")
      .eq("id", req.userId!)
      .maybeSingle();

    const participantName = profile?.full_name || (profile?.username ? `@${profile.username}` : req.userId);

    const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
      identity: req.userId!,
      name: participantName,
      ttl: "4h",
      metadata: JSON.stringify({
        sessionId: activeSession.id,
        roomId: activeSession.room_id,
        role: member.role,
        fullName: profile?.full_name || null,
        username: profile?.username || null,
        avatarUrl: profile?.avatar_url || null,
      }),
    });
    
    at.addGrant({
      roomJoin: true,
      room: `skillbridge-session-${activeSession.id}`,
      canSubscribe: true,
      canPublish,
      canPublishData: true,
    });
    
    res.json({
      url: env.LIVEKIT_URL,
      token: await at.toJwt(),
      canPublish,
      sessionId: activeSession.id,
      roomName: `skillbridge-session-${activeSession.id}`,
      participantName,
    });
  }),
);

// 1:1 WhatsApp-style Call Initiation Endpoint
live.post(
  "/calls/initiate",
  wrap(async (req, res) => {
    if (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET || !env.LIVEKIT_URL) {
      return res.status(503).json({
        error: "LiveKit service not configured for calls.",
        code: "LIVEKIT_NOT_CONFIGURED",
      });
    }

    const { calleeId, callType } = z
      .object({
        calleeId: z.string().uuid(),
        callType: z.enum(["audio", "video"]).default("video"),
      })
      .parse(req.body);

    const callerId = req.userId!;
    if (callerId === calleeId) {
      return res.status(400).json({ error: "Cannot initiate call to self." });
    }

    const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const roomName = `sb-call-${callId}`;

    // Get profiles of caller and callee
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name, username, avatar_url")
      .in("id", [callerId, calleeId]);

    const caller = profiles?.find((p) => p.id === callerId);
    const callee = profiles?.find((p) => p.id === calleeId);

    const callerName = caller?.full_name || caller?.username || "SkillBridge User";
    const calleeName = callee?.full_name || callee?.username || "SkillBridge Peer";

    // Mint LiveKit Token for caller
    const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
      identity: callerId,
      name: callerName,
      ttl: "1h",
      metadata: JSON.stringify({ callId, callType, role: "caller" }),
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canSubscribe: true,
      canPublish: true,
      canPublishData: true,
    });

    // Notify callee via push notification
    try {
      const { notifyUser } = await import("../services/push.js");
      await notifyUser(
        calleeId,
        `Incoming ${callType} call`,
        `${callerName} is calling you on SkillBridge…`,
        "call",
        { callId, callerId, callerName, roomName, callType },
      );
    } catch (err) {
      console.warn("Could not dispatch call push notification:", err);
    }

    res.json({
      callId,
      roomName,
      token: await at.toJwt(),
      url: env.LIVEKIT_URL,
      calleeName,
      calleeAvatar: callee?.avatar_url || null,
    });
  }),
);

// 1:1 Call Termination Endpoint
live.post(
  "/calls/:id/end",
  wrap(async (req, res) => {
    const callId = req.params.id;
    const { durationSeconds } = z
      .object({
        durationSeconds: z.number().int().min(0).default(0),
      })
      .parse(req.body);

    res.json({ success: true, callId, durationSeconds, status: "ended" });
  }),
);



