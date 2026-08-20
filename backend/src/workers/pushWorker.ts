import { PushService } from "../services/PushService.js";

export function startPushWorker(): { stop: () => void } | null {
  if (process.env.ENABLE_PUSH_WORKER === "false") {
    return null;
  }

  const intervalMs = parseInt(process.env.PUSH_WORKER_INTERVAL_MS || "300000", 10);
  const pushWorkerTimer = setInterval(() => {
    PushService.checkPendingReceipts().catch((err) => {
      console.error("[PushWorker] Receipt check error:", err?.message || err);
    });
  }, intervalMs);

  if (pushWorkerTimer && typeof pushWorkerTimer.unref === "function") {
    pushWorkerTimer.unref();
  }

  return {
    stop: () => clearInterval(pushWorkerTimer),
  };
}
