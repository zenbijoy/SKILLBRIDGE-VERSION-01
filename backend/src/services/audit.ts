import { admin } from "../lib/db.js";

export async function audit(
  actorId: string,
  action: string,
  targetType: string,
  targetId?: string,
  metadata: Record<string, unknown> = {},
) {
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
    console.error(`[AUDIT_ERROR] Failed to persist audit log for action ${action}:`, error.message);
  }
}
