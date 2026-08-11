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
      await admin.rpc("record_livekit_join", {
        p_session_id: meta.sessionId,
        p_user_id: event.participant.identity,
      });
    }
  } else if (event.event === "participant_left") {
    let meta: any = {};
    try { meta = JSON.parse(event.participant?.metadata || "{}"); } catch(e){}
    
    if (meta.sessionId && event.participant?.identity) {
      await admin.rpc("record_livekit_leave", {
        p_session_id: meta.sessionId,
        p_user_id: event.participant.identity,
      });
    }
  }
  
  res.status(200).send();
}));
live.post(
  "/token/:sessionId",
  wrap(async (req, res) => {
    const sessionId = z.string().uuid().parse(req.params.sessionId);
    
    const { data: session } = await admin
      .from("sessions")
      .select("room_id, status")
      .eq("id", sessionId)
      .maybeSingle();

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    if (["draft", "completed", "cancelled"].includes(session.status)) {
      return res.status(403).json({ error: `Cannot join session in ${session.status} state` });
    }

    const { data: member } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", session.room_id)
      .eq("user_id", req.userId!)
      .maybeSingle();
      
    if (!member)
      return res.status(403).json({ error: "Join the learning room first" });
      
    const authorizedRoles = ["owner", "teacher", "moderator", "member"];
    if (!authorizedRoles.includes(member.role)) {
      return res.status(403).json({ error: "Unauthorized role" });
    }

    const canPublish = ["owner", "teacher", "moderator"].includes(member.role);
    const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
      identity: req.userId!,
      ttl: "1h",
      metadata: JSON.stringify({ sessionId, roomId: session.room_id, role: member.role }),
    });
    
    at.addGrant({
      roomJoin: true,
      room: `skillbridge-session-${sessionId}`,
      canSubscribe: true,
      canPublish,
      canPublishData: true,
    });
    
    res.json({ url: env.LIVEKIT_URL, token: await at.toJwt(), canPublish });
  }),
);


