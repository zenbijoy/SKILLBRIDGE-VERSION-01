import { admin } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { logDomainEvent } from "../lib/domainLogger.js";
import { PushService } from "./PushService.js";
import { isWithinQuietHours } from "./push.js";

export type NextGenNotificationType =
  | "ROOM_SESSION_STARTING"
  | "ROOM_SESSION_LIVE"
  | "QUESTION_ANSWERED"
  | "ANSWER_ACCEPTED"
  | "NEW_ROOM_MATERIAL"
  | "RECORDING_READY"
  | "CLUB_EVENT_CREATED"
  | "CLUB_EVENT_REMINDER"
  | "CLUB_ANNOUNCEMENT"
  | "CLUB_INVITATION"
  | "CLASH_DETECTED"
  | "NEGOTIATION_RECEIVED"
  | "NEGOTIATION_COUNTERED"
  | "NEGOTIATION_ACCEPTED"
  | "NEGOTIATION_REJECTED"
  | "POST_REACTION"
  | "POST_COMMENT"
  | "MENTION"
  | "ACHIEVEMENT_UNLOCKED"
  | "SYSTEM_ANNOUNCEMENT";

export interface NotificationEvent {
  userId: string;
  type: NextGenNotificationType;
  title: string;
  body: string;
  priority?: "low" | "normal" | "high" | "urgent";
  entityType?: "room" | "club" | "event" | "post" | "comment" | "recording" | "question" | "answer";
  entityId?: string;
  data?: Record<string, string>;
  category?: "messages" | "connections" | "rooms" | "sessions" | "teaching" | "system";
}

const typeToCategory: Record<NextGenNotificationType, "messages" | "connections" | "rooms" | "sessions" | "teaching" | "system"> = {
  ROOM_SESSION_STARTING: "sessions",
  ROOM_SESSION_LIVE: "sessions",
  QUESTION_ANSWERED: "rooms",
  ANSWER_ACCEPTED: "rooms",
  NEW_ROOM_MATERIAL: "rooms",
  RECORDING_READY: "rooms",
  CLUB_EVENT_CREATED: "system",
  CLUB_EVENT_REMINDER: "system",
  CLUB_ANNOUNCEMENT: "system",
  CLUB_INVITATION: "connections",
  CLASH_DETECTED: "system",
  NEGOTIATION_RECEIVED: "system",
  NEGOTIATION_COUNTERED: "system",
  NEGOTIATION_ACCEPTED: "system",
  NEGOTIATION_REJECTED: "system",
  POST_REACTION: "system",
  POST_COMMENT: "system",
  MENTION: "messages",
  ACHIEVEMENT_UNLOCKED: "system",
  SYSTEM_ANNOUNCEMENT: "system",
};

export class NotificationService {
  /**
   * Dispatch a typed notification event:
   * 1. Persists to public.notifications in database
   * 2. Evaluates user category preferences & quiet hours
   * 3. Dispatches push notification via PushService if appropriate
   */
  static async dispatch(event: NotificationEvent): Promise<{ id: string | null; pushed: boolean }> {
    try {
      const category = event.category || typeToCategory[event.type] || "system";
      const payloadData: Record<string, string> = {
        type: event.type,
        ...(event.entityType ? { entityType: event.entityType } : {}),
        ...(event.entityId ? { entityId: event.entityId } : {}),
        ...(event.data ?? {}),
      };

      // 1. Persist notification in database
      const { data: record, error } = await admin
        .from("notifications")
        .insert({
          user_id: event.userId,
          kind: category,
          title: event.title,
          body: event.body,
          data: payloadData,
          priority: event.priority || "normal",
          entity_type: event.entityType || null,
          entity_id: event.entityId || null,
        })
        .select("id")
        .maybeSingle();

      if (error) {
        logger.warn({ err: error.message, userId: event.userId, type: event.type }, "Failed writing notification record");
      }

      // 2. Fetch preferences & quiet hours in parallel
      const [prefsQ, profileQ] = await Promise.all([
        admin.from("notification_preferences").select("messages,connections,rooms,sessions,teaching,system").eq("user_id", event.userId).maybeSingle(),
        admin.from("profiles").select("quiet_hours_start,quiet_hours_end,timezone,onboarding_push_opt_in").eq("id", event.userId).maybeSingle(),
      ]);

      const categoryEnabled = prefsQ.data?.[category] ?? true;
      const pushOptIn = profileQ.data?.onboarding_push_opt_in ?? true;
      const isUrgent = event.priority === "urgent";

      const quiet = !isUrgent && isWithinQuietHours(
        new Date(),
        profileQ.data?.quiet_hours_start ?? "22:00",
        profileQ.data?.quiet_hours_end ?? "07:00",
        profileQ.data?.timezone ?? "Asia/Dhaka",
      );

      // Skip push if user muted category, opted out, or within quiet hours (unless urgent)
      if (!categoryEnabled || !pushOptIn || quiet) {
        return { id: record?.id ?? null, pushed: false };
      }

      // 3. Dispatch push via PushService
      await PushService.sendNotification(event.userId, {
        title: event.title,
        body: event.body,
        data: payloadData,
      });

      logDomainEvent({
        event: "push_dispatched",
        notificationType: event.type,
        recipientCount: 1,
        batchCount: 1,
      });

      return { id: record?.id ?? null, pushed: true };
    } catch (err: any) {
      logger.error({ err, userId: event.userId, type: event.type }, "Notification dispatch error");
      logDomainEvent({
        event: "push_failed",
        notificationType: event.type,
        errorCode: err?.code || err?.message || "UNKNOWN_ERROR",
        recipientCount: 1,
      });
      return { id: null, pushed: false };
    }
  }
}
