import { admin } from "../lib/db.js";
import { logger } from "../lib/logger.js";

export async function audit(
  actorId: string,
  action: string,
  targetType: string,
  targetId?: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await admin
    .from("audit_logs")
    .insert({
      actor_id: actorId,
      action,
      target_type: targetType,
      target_id: targetId ?? null,
      metadata,
    });

  if (error) {
    logger.error(
      {
        event: "audit_persist_failed",
        actorId,
        action,
        targetType,
        targetId,
        err: error.message,
      },
      `Failed to persist audit log for action ${action}`,
    );
    throw new Error(`Durable audit logging failed for ${action}: ${error.message}`);
  }
}
