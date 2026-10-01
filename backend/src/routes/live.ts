import { Router } from "express";
import { z } from "zod";
import { AccessToken, WebhookReceiver } from "livekit-server-sdk";
import { env } from "../config/env.js";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";
import { logger } from "../lib/logger.js";
import { broadcastRoomPresence } from "../socket.js";
import { NotificationService } from "../services/notificationService.js";

export const live = Router();
export const liveWebhooks = Router();

/**
 * Count who is currently connected to a LiveKit session and push that number
 * to every client watching the room. Silently returns when the session is gone.
 */
async function emitRoomPresence(sessionId: string): Promise<void> {
  try {
    const { data: session } = await admin
      .from("sessions")
      .select("id, room_id, status")
      .eq("id", sessionId)
      .maybeSingle();

    if (!session) return;

    const { count } = await admin
      .from("livekit_attendance")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .is("left_at", null);

    broadcastRoomPresence(session.room_id as string, {
      sessionId,
      liveParticipantCount: count ?? 0,
      isLive: session.status === "live",
    });
  } catch (err) {
    logger.warn(
      { event: "emit_room_presence_failed", sessionId, err: (err as Error).message },
      "Failed to emit room presence",
    );
  }
}

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
        logger.error(
          {
            event: "livekit_webhook_join_failed",
            sessionId: meta.sessionId,
            err: rpcErr.message,
          },
          "record_livekit_join RPC failed",
        );
        throw rpcErr;
      }
      // Push the updated count to everyone watching this room in real time.
      await emitRoomPresence(meta.sessionId);
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
        logger.error(
          {
            event: "livekit_webhook_leave_failed",
            sessionId: meta.sessionId,
            err: rpcErr.message,
          },
          "record_livekit_leave RPC failed",
        );
        throw rpcErr;
      }
      await emitRoomPresence(meta.sessionId);
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
          logger.error(
            {
              event: "livekit_room_finished_update_failed",
              sessionId,
              err: updateErr.message,
            },
            "room_finished session update failed",
          );
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

        // Dispatch ROOM_SESSION_LIVE notification to other room members asynchronously
        void (async () => {
          try {
            const [{ data: roomData }, { data: members }] = await Promise.all([
              admin.from("rooms").select("title").eq("id", targetRoomId).maybeSingle(),
              admin.from("room_members").select("user_id").eq("room_id", targetRoomId).neq("user_id", req.userId!).limit(50),
            ]);

            const roomName = roomData?.title || "Study Room";
            for (const m of members || []) {
              void NotificationService.dispatch({
                userId: m.user_id,
                type: "ROOM_SESSION_LIVE",
                title: "Live Session Started 🔴",
                body: `A live study session is happening now in "${roomName}".`,
                entityType: "room",
                entityId: targetRoomId,
                data: { roomId: targetRoomId, sessionId: newSession.id, route: "room" },
              });
            }
          } catch (notifErr) {
            logger.warn({ err: (notifErr as Error).message, targetRoomId }, "Failed dispatching live room session notification");
          }
        })();
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
// NOTE: the previous `/calls/initiate` + `/calls/:id/end` pair here was dead,
// incomplete code reachable only from an unused client hook. It minted a
// LiveKit token without any privacy/block checks and never rang the callee
// (no accept/decline/ring over socket), so it could not work end to end.
// The supported 1:1 call flow is the WebRTC pipeline in routes/calls.ts
// (POST /calls -> socket `call:incoming` -> accept/reject -> call:* signaling).



