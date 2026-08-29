import { PushService } from "../services/PushService.js";
import { logger } from "../lib/logger.js";

export function startPushWorker(): { stop: () => void } | null {
  if (process.env.ENABLE_PUSH_WORKER === "false") {
    return null;
  }

  const intervalMs = parseInt(process.env.PUSH_WORKER_INTERVAL_MS || "300000", 10);
  const pushWorkerTimer = setInterval(() => {
    PushService.checkPendingReceipts().catch((err) => {
      logger.error(
        {
          event: "push_worker_receipt_check_failed",
          err: err?.message || err,
        },
        "Push notification receipt check failed",
      );
    });
  }, intervalMs);

  if (pushWorkerTimer && typeof pushWorkerTimer.unref === "function") {
    pushWorkerTimer.unref();
  }

  return {
    stop: () => clearInterval(pushWorkerTimer),
  };
}
