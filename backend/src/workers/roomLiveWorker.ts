import { admin } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { getSocketServer, roomPresenceRoom } from "../socket.js";
import {
  getRoomServiceClient,
  getAllRoomMemberIds,
  broadcastRoomLiveStatus,
} from "../routes/room-live.js";
import { NotificationService } from "../services/notificationService.js";

const WORKER_INTERVAL_MS = 15_000;
const warnedStudySessions = new Set<string>();

/**
 * Background worker for Room Live & Open Sessions:
 * 1. Starts scheduled study sessions when starts_at arrives (and terminates open sessions)
 * 2. Ends study sessions when ends_at arrives
 * 3. Ends empty open sessions whose last_empty_at is older than 60s grace
 * 4. Reconciles DB participants against LiveKit active participants (ghostbuster)
 * 5. Sends 5-minute pre-warning event before a study session starts
 */
export function startRoomLiveWorker(): { stop: () => void } | null {
  if (process.env.ENABLE_ROOM_LIVE_WORKER === "false") {
    return null;
  }

  const timer = setInterval(async () => {
    try {
      const io = getSocketServer();
      const livekit = getRoomServiceClient();
      const now = new Date();
      const nowIso = now.toISOString();

      // ───────────────────────────────────────────────────────────────────────
      // 1. Auto-start scheduled study sessions whose starts_at <= now()
      // ───────────────────────────────────────────────────────────────────────
      const { data: dueSessions, error: dueErr } = await admin
        .from("sessions")
        .select("id, room_id, title, media, teacher_id, starts_at, ends_at")
        .eq("status", "scheduled")
        .lte("starts_at", nowIso)
        .limit(20);

      if (!dueErr && dueSessions && dueSessions.length > 0) {
        for (const session of dueSessions) {
          // Flip status to live
          const { error: updateErr } = await admin
            .from("sessions")
            .update({ status: "live" })
            .eq("id", session.id)
            .eq("status", "scheduled");

          if (updateErr) continue;

          // End open sessions for this room atomically
          const { data: rawEnded } = await admin.rpc("end_open_sessions_for_room", {
            p_room_id: session.room_id,
            p_reason: "study_session_started",
          });

          const endedSessions = (rawEnded || []) as Array<{ ended_session_id: string; livekit_room: string }>;

          // Delete ended open sessions in LiveKit
          if (livekit && endedSessions.length > 0) {
            for (const eos of endedSessions) {
              await livekit.deleteRoom(eos.livekit_room).catch(() => {});
            }
          }

          // Emit realtime notifications to room
          if (io) {
            if (endedSessions.length > 0) {
              io.to(roomPresenceRoom(session.room_id)).emit("room:live:ended", {
                roomId: session.room_id,
                reason: "study_session_started",
                nextStudySessionId: session.id,
              });
            }
            io.to(roomPresenceRoom(session.room_id)).emit("room:live:started", {
              roomId: session.room_id,
              studySessionId: session.id,
              title: session.title,
              media: session.media || "video",
              teacherId: session.teacher_id,
              status: "live",
            });
            io.emit("room:live:feed", {
              roomId: session.room_id,
              isLive: true,
              media: session.media || "video",
              studySessionId: session.id,
            });
          }

          // Push notifications to room members
          void (async () => {
            try {
              const [{ data: roomData }, memberIds] = await Promise.all([
                admin.from("rooms").select("title").eq("id", session.room_id).maybeSingle(),
                getAllRoomMemberIds(session.room_id, session.teacher_id),
              ]);
              const roomTitle = roomData?.title || "Study Space";
              for (const memberId of memberIds) {
                void NotificationService.dispatch({
                  userId: memberId,
                  type: "ROOM_STUDY_STARTED",
                  title: "Study Session Started 🎓",
                  body: `"${session.title}" has started in ${roomTitle}. Tap to join!`,
                  priority: "high",
                  entityType: "room",
                  entityId: session.room_id,
                  data: {
                    roomId: session.room_id,
                    studySessionId: session.id,
                    route: "room",
                  },
                });
              }
            } catch {}
          })();

          void broadcastRoomLiveStatus(session.room_id);

          logger.info(
            { event: "scheduled_study_session_started", sessionId: session.id, roomId: session.room_id },
            "Started scheduled study session and closed open sessions",
          );
        }
      }

      // ───────────────────────────────────────────────────────────────────────
      // 2. End study sessions whose ends_at <= now()
      // ───────────────────────────────────────────────────────────────────────
      const { data: expiredStudy, error: expErr } = await admin
        .from("sessions")
        .select("id, room_id")
        .eq("status", "live")
        .not("ends_at", "is", null)
        .lte("ends_at", nowIso)
        .limit(20);

      if (!expErr && expiredStudy && expiredStudy.length > 0) {
        for (const session of expiredStudy) {
          await admin
            .from("sessions")
            .update({ status: "completed" })
            .eq("id", session.id)
            .eq("status", "live");

          if (livekit) {
            await livekit.deleteRoom(`skillbridge-session-${session.id}`).catch(() => {});
          }

          if (io) {
            io.to(roomPresenceRoom(session.room_id)).emit("room:live:ended", {
              roomId: session.room_id,
              sessionId: session.id,
              reason: "ends_at_reached",
            });
            io.emit("room:live:feed", {
              roomId: session.room_id,
              isLive: false,
            });
          }

          void broadcastRoomLiveStatus(session.room_id);

          logger.info({ event: "study_session_ended_at_cutoff", sessionId: session.id }, "Completed study session at ends_at");
        }
      }

      // ───────────────────────────────────────────────────────────────────────
      // 3. End open sessions whose last_empty_at is older than 60s grace period
      // ───────────────────────────────────────────────────────────────────────
      const graceCutoff = new Date(Date.now() - 60_000).toISOString();
      const { data: emptyOpenSessions, error: emptyErr } = await admin
        .from("room_open_sessions")
        .select("id, room_id, livekit_room")
        .eq("status", "live")
        .not("last_empty_at", "is", null)
        .lte("last_empty_at", graceCutoff)
        .limit(20);

      if (!emptyErr && emptyOpenSessions && emptyOpenSessions.length > 0) {
        for (const eos of emptyOpenSessions) {
          // Double check there are genuinely 0 active participants
          const { count } = await admin
            .from("room_open_participants")
            .select("user_id", { count: "exact", head: true })
            .eq("session_id", eos.id)
            .is("left_at", null);

          if ((count ?? 0) === 0) {
            await admin
              .from("room_open_sessions")
              .update({ status: "ended", ended_at: nowIso, end_reason: "empty_timeout" })
              .eq("id", eos.id)
              .eq("status", "live");

            if (livekit) {
              await livekit.deleteRoom(eos.livekit_room).catch(() => {});
            }

            if (io) {
              io.to(roomPresenceRoom(eos.room_id)).emit("room:live:ended", {
                roomId: eos.room_id,
                sessionId: eos.id,
                reason: "empty_timeout",
              });
              io.emit("room:live:feed", {
                roomId: eos.room_id,
                isLive: false,
              });
            }

            void broadcastRoomLiveStatus(eos.room_id);

            logger.info(
              { event: "empty_open_session_ended_grace", sessionId: eos.id, roomId: eos.room_id },
              "Ended empty open session after 60s grace period",
            );
          } else {
            // Participant rejoined; reset last_empty_at
            await admin
              .from("room_open_sessions")
              .update({ last_empty_at: null })
              .eq("id", eos.id);
          }
        }
      }

      // ───────────────────────────────────────────────────────────────────────
      // 4. Ghostbuster: reconcile DB participants with LiveKit listParticipants
      // ───────────────────────────────────────────────────────────────────────
      if (livekit) {
        const { data: liveOpenSessions } = await admin
          .from("room_open_sessions")
          .select("id, room_id, livekit_room, started_at")
          .eq("status", "live")
          .limit(10);

        for (const session of liveOpenSessions || []) {
          try {
            const lkParticipants = await livekit.listParticipants(session.livekit_room).catch(() => []);
            const liveIdentities = new Set(lkParticipants.map((p) => p.identity));

            // Fetch DB active participants joined > 45s ago (allow connection setup window)
            const joinedCutoff = new Date(Date.now() - 45_000).toISOString();
            const { data: dbParticipants } = await admin
              .from("room_open_participants")
              .select("user_id, is_host")
              .eq("session_id", session.id)
              .is("left_at", null)
              .lte("joined_at", joinedCutoff);

            for (const dp of dbParticipants || []) {
              if (!liveIdentities.has(dp.user_id)) {
                // Ghost detected: participant is marked active in DB but absent from LiveKit
                logger.info(
                  { event: "ghost_participant_cleared", userId: dp.user_id, sessionId: session.id },
                  "Clearing ghost participant not present in LiveKit room",
                );

                const { data: rawLeave } = await admin.rpc("leave_open_session_atomic", {
                  p_session_id: session.id,
                  p_user_id: dp.user_id,
                });

                const leaveRes = rawLeave as {
                  host_transferred?: boolean;
                  new_host_id?: string | null;
                  remaining_participants: number;
                };

                if (io && leaveRes?.host_transferred && leaveRes.new_host_id) {
                  io.to(roomPresenceRoom(session.room_id)).emit("room:live:host_changed", {
                    roomId: session.room_id,
                    sessionId: session.id,
                    newHostId: leaveRes.new_host_id,
                  });
                }
                void broadcastRoomLiveStatus(session.room_id);
              }
            }
          } catch (lkErr) {
            // LiveKit query error; skip gracefully
          }
        }
      }

      // ───────────────────────────────────────────────────────────────────────
      // 5. 5-Minute Warning: notify open session participants before study start
      // ───────────────────────────────────────────────────────────────────────
      const warningWindow = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      const { data: upcomingStudy } = await admin
        .from("sessions")
        .select("id, room_id, title, starts_at")
        .eq("status", "scheduled")
        .gt("starts_at", nowIso)
        .lte("starts_at", warningWindow);

      for (const study of upcomingStudy || []) {
        if (warnedStudySessions.has(study.id)) continue;

        // Check if there is an active open session in this room
        const { data: openSess } = await admin
          .from("room_open_sessions")
          .select("id")
          .eq("room_id", study.room_id)
          .eq("status", "live")
          .maybeSingle();

        if (openSess) {
          const minutesRemaining = Math.max(1, Math.ceil((new Date(study.starts_at).getTime() - Date.now()) / 60_000));
          if (io) {
            io.to(roomPresenceRoom(study.room_id)).emit("room:live:study_warning", {
              roomId: study.room_id,
              studySessionId: study.id,
              title: study.title,
              startsAt: study.starts_at,
              minutesRemaining,
            });
          }
          warnedStudySessions.add(study.id);
          logger.info(
            { event: "study_warning_broadcast", studySessionId: study.id, roomId: study.room_id, minutesRemaining },
            "Broadcast 5-minute study session warning to open session participants",
          );
        }
      }

      // Evict old entries from warnedStudySessions
      if (warnedStudySessions.size > 200) {
        warnedStudySessions.clear();
      }
    } catch (workerErr) {
      logger.error({ event: "room_live_worker_error", err: (workerErr as Error).message }, "Room live worker iteration failed");
    }
  }, WORKER_INTERVAL_MS);

  return {
    stop: () => clearInterval(timer),
  };
}
