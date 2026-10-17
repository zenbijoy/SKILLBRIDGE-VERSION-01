import { admin } from "../lib/db.js";
import { getSocketServer } from "../socket.js";
import { logger } from "../lib/logger.js";

// A call that stays in "ringing" longer than this is treated as missed.
// This mirrors WhatsApp/Phone behaviour: if the callee never answers
// (e.g. app killed / offline), the caller is told the call was missed
// instead of hanging on "ringing" forever.
const RINGING_TIMEOUT_MS = 45_000;
const CONNECTING_TIMEOUT_MS = 60_000;
const WORKER_INTERVAL_MS = 15_000;

export function startCallTimeoutWorker(): { stop: () => void } | null {
  if (process.env.ENABLE_CALL_TIMEOUT_WORKER === "false") {
    return null;
  }

  const timer = setInterval(async () => {
    try {
      const io = getSocketServer();
      const ringingCutoff = new Date(Date.now() - RINGING_TIMEOUT_MS).toISOString();

      // 1. Find calls still ringing past the timeout window (mark as missed)
      const { data: staleCalls, error: fetchErr } = await admin
        .from("calls")
        .select("id, caller_id, callee_id, type")
        .eq("status", "ringing")
        .lt("ringing_at", ringingCutoff)
        .limit(100);

      if (fetchErr) throw fetchErr;

      if (staleCalls && staleCalls.length > 0) {
        for (const call of staleCalls) {
          // Atomic transition: only flip to "missed" if still ringing.
          const { error: updateErr } = await admin
            .from("calls")
            .update({ status: "missed", ended_at: new Date().toISOString(), end_reason: "missed" })
            .eq("id", call.id)
            .eq("status", "ringing");

          if (updateErr) continue;

          // Notify the caller that the call was missed.
          if (io) {
            io.to(`user:${call.caller_id}`).emit("call:missed", {
              callId: call.id,
              calleeId: call.callee_id,
              type: call.type,
            });
          }
        }

        logger.info(
          { event: "call_timeout_marked_missed", count: staleCalls.length },
          "Marked stale ringing calls as missed",
        );
      }

      // 2. Find accepted/connecting calls that failed to establish connection within 60s (Bug 6)
      const connectCutoff = new Date(Date.now() - CONNECTING_TIMEOUT_MS).toISOString();
      const { data: stuckConnectingCalls, error: connErr } = await admin
        .from("calls")
        .select("id, caller_id, callee_id, type")
        .in("status", ["accepted", "connecting"])
        .lt("created_at", connectCutoff)
        .limit(100);

      if (connErr) throw connErr;

      if (stuckConnectingCalls && stuckConnectingCalls.length > 0) {
        for (const call of stuckConnectingCalls) {
          const { error: updateErr } = await admin
            .from("calls")
            .update({
              status: "failed",
              ended_at: new Date().toISOString(),
              end_reason: "connection_timeout",
            })
            .eq("id", call.id)
            .in("status", ["accepted", "connecting"]);

          if (updateErr) continue;

          if (io) {
            io.to(`user:${call.caller_id}`).emit("call:end", {
              callId: call.id,
              durationSeconds: 0,
              reason: "connection_timeout",
            });
            io.to(`user:${call.callee_id}`).emit("call:end", {
              callId: call.id,
              durationSeconds: 0,
              reason: "connection_timeout",
            });
          }
        }

        logger.info(
          { event: "call_timeout_marked_failed", count: stuckConnectingCalls.length },
          "Marked stale accepted/connecting calls as failed",
        );
      }
    } catch (err) {
      logger.error(
        {
          event: "call_timeout_worker_failed",
          err: err instanceof Error ? err.message : err,
        },
        "Call timeout worker failed",
      );
    }
  }, WORKER_INTERVAL_MS);

  if (typeof timer.unref === "function") {
    timer.unref();
  }

  return {
    stop: () => clearInterval(timer),
  };
}
