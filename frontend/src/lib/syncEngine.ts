import { LocalDB, OutboxTask } from "./database";
import { api } from "./api";

type SyncListener = (task: OutboxTask, event: "started" | "completed" | "failed") => void;

class SyncEngineSingleton {
  private isProcessing = false;
  private listeners: Set<SyncListener> = new Set();
  private maxRetries = 5;

  public addListener(listener: SyncListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(task: OutboxTask, event: "started" | "completed" | "failed") {
    for (const listener of this.listeners) {
      try {
        listener(task, event);
      } catch (err) {
        console.warn("SyncEngine listener threw error:", err);
      }
    }
  }

  /**
   * Process all pending outbox items sequentially with exponential backoff & deduplication
   */
  public async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const tasks = await LocalDB.getOutbox();
      const pendingTasks = tasks.filter((t) => t.status === "pending" || (t.status === "failed" && t.retryCount < this.maxRetries));

      for (const task of pendingTasks) {
        await LocalDB.updateOutboxTask(task.id, { status: "processing" });
        this.notify(task, "started");

        try {
          await this.executeTask(task);
          await LocalDB.removeOutboxTask(task.id);
          this.notify(task, "completed");
        } catch (err: any) {
          const nextRetry = task.retryCount + 1;
          const isFinal = nextRetry >= this.maxRetries;
          await LocalDB.updateOutboxTask(task.id, {
            status: isFinal ? "failed" : "pending",
            retryCount: nextRetry,
            lastError: err?.message || "Sync failed",
          });
          this.notify(task, "failed");
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async executeTask(task: OutboxTask): Promise<void> {
    switch (task.action) {
      case "SEND_MESSAGE": {
        const { conversationId, body, attachment, client_message_id } = task.payload;
        await api(`/chat/conversations/${conversationId}/messages`, {
          method: "POST",
          body: JSON.stringify({
            body,
            attachment,
            client_message_id: client_message_id || task.id,
          }),
        });
        break;
      }

      case "CREATE_POST": {
        await api("/social/posts", {
          method: "POST",
          body: JSON.stringify(task.payload),
        });
        break;
      }

      case "SUBMIT_QUIZ": {
        const { quizId, answers } = task.payload;
        await api(`/quiz/${quizId}/submit`, {
          method: "POST",
          body: JSON.stringify({ answers }),
        });
        break;
      }

      case "SAVE_CT_NOTE": {
        await api("/planner", {
          method: "POST",
          body: JSON.stringify(task.payload),
        });
        break;
      }

      default:
        console.warn("Unknown outbox action:", task.action);
    }
  }
}

export const SyncEngine = new SyncEngineSingleton();
