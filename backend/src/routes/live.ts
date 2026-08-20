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
  }
  
  res.status(200).send();
}));
live.post(
  "/token/:sessionId",
  wrap(async (req, res) => {
    const paramId = z.string().uuid().parse(req.params.sessionId);
    
    // 1. Try resolving directly as session ID
    let { data: session } = await admin
      .from("sessions")
      .select("id, room_id, status, teacher_id")
      .eq("id", paramId)
      .maybeSingle();

    // 2. If not a session ID, resolve as room ID with active/scheduled session
    if (!session) {
      const { data: roomSession } = await admin
        .from("sessions")
        .select("id, room_id, status, teacher_id")
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
    const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
      identity: req.userId!,
      ttl: "1h",
      metadata: JSON.stringify({ sessionId: activeSession.id, roomId: activeSession.room_id, role: member.role }),
    });
    
    at.addGrant({
      roomJoin: true,
      room: `skillbridge-session-${activeSession.id}`,
      canSubscribe: true,
      canPublish,
      canPublishData: true,
    });
    
    res.json({ url: env.LIVEKIT_URL, token: await at.toJwt(), canPublish, sessionId: activeSession.id });
  }),
);


