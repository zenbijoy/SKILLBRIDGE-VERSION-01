import { Router } from "express";
import { z } from "zod";
import { AccessToken } from "livekit-server-sdk";
import { env } from "../config/env.js";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
export const live = Router();
live.post(
  "/token/:roomId",
  wrap(async (req, res) => {
    const roomId = z.string().uuid().parse(req.params.roomId);
    const { data: member } = await admin
      .from("room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", req.userId!)
      .maybeSingle();
    if (!member)
      return res.status(403).json({ error: "Join the learning room first" });
    const canPublish = ["owner", "teacher", "moderator"].includes(member.role);
    const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
      identity: req.userId!,
      ttl: "1h",
      metadata: JSON.stringify({ roomId, role: member.role }),
    });
    at.addGrant({
      roomJoin: true,
      room: `skillbridge-${roomId}`,
      canSubscribe: true,
      canPublish,
      canPublishData: true,
    });
    res.json({ url: env.LIVEKIT_URL, token: await at.toJwt(), canPublish });
  }),
);
