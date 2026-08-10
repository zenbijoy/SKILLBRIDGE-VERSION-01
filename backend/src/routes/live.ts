import { Router } from "express";
import { z } from "zod";
import { AccessToken } from "livekit-server-sdk";
import { env } from "../config/env.js";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
export const live = Router();
live.post(
  "/token/:sessionId",
  wrap(async (req, res) => {
    const sessionId = z.string().uuid().parse(req.params.sessionId);
    
    const { data: session } = await admin
      .from("sessions")
      .select("room_id")
      .eq("id", sessionId)
      .maybeSingle();

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const { data: member } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", session.room_id)
      .eq("user_id", req.userId!)
      .maybeSingle();
      
    if (!member)
      return res.status(403).json({ error: "Join the learning room first" });
      
    const authorizedRoles = ["owner", "teacher", "moderator", "student"];
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
