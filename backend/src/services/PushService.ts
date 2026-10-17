import { admin } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { getFirebaseMessaging } from "./firebase.js";

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, any>;
  priority?: "normal" | "high";
}

export interface PushProvider {
  sendNotification(userId: string, message: PushMessage): Promise<void>;
}

export class FirebasePushProvider implements PushProvider {
  async sendNotification(userId: string, message: PushMessage): Promise<void> {
    const messaging = getFirebaseMessaging();
    if (!messaging) return;

    const { data: tokens } = await admin
      .from("device_tokens")
      .select("token")
      .eq("user_id", userId)
      .eq("enabled", true)
      .eq("provider", "fcm");

    if (!tokens || tokens.length === 0) return;

    const fcmTokens = tokens.map((t) => t.token);
    const isHighPriority = message.priority === "high";

    const stringData: Record<string, string> = {};
    if (message.data) {
      for (const [k, v] of Object.entries(message.data)) {
        stringData[k] = typeof v === "string" ? v : JSON.stringify(v);
      }
    }

    try {
      const response = await messaging.sendEachForMulticast({
        tokens: fcmTokens,
        notification: {
          title: message.title,
          body: message.body,
        },
        data: stringData,
        android: {
          priority: isHighPriority ? "high" : "normal",
          ttl: isHighPriority ? 60 * 1000 : 24 * 60 * 60 * 1000,
          notification: {
            channelId: isHighPriority ? "incoming_calls" : "default",
            priority: isHighPriority ? "max" : "default",
            sound: "default",
            defaultSound: true,
            defaultVibrateTimings: true,
          },
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title: message.title,
                body: message.body,
              },
              sound: "default",
              badge: 1,
              interruptionLevel: isHighPriority ? "critical" : "active",
            },
          },
        },
      });

      const invalidTokens: string[] = [];
      response.responses.forEach((res: any, idx: number) => {
        if (!res.success && res.error) {
          const code = res.error.code;
          if (
            code === "messaging/invalid-registration-token" ||
            code === "messaging/registration-token-not-registered"
          ) {
            invalidTokens.push(fcmTokens[idx]);
          }
        }
      });

      if (invalidTokens.length > 0) {
        await admin.from("device_tokens").update({ enabled: false }).in("token", invalidTokens);
      }

      logger.info(
        {
          event: "fcm_push_dispatched",
          userId,
          successCount: response.successCount,
          failureCount: response.failureCount,
        },
        "FCM push notification dispatched",
      );
    } catch (err) {
      logger.error(
        {
          event: "fcm_dispatch_error",
          userId,
          err: err instanceof Error ? err.message : err,
        },
        "Failed to dispatch FCM push notification",
      );
    }
  }
}

export class ExpoPushProvider implements PushProvider {
  async sendNotification(userId: string, message: { title: string; body: string; data?: Record<string, any>; priority?: "normal" | "high" }) {
    const { data: tokens } = await admin
      .from("device_tokens")
      .select("token")
      .eq("user_id", userId)
      .eq("provider", "expo")
      .eq("enabled", true);

    if (!tokens || tokens.length === 0) return;

    const expoTokens = tokens.map(t => t.token);
    const isHighPriority = message.priority === "high";

    const payload = expoTokens.map(token => ({
      to: token,
      sound: "default",
      title: message.title,
      body: message.body,
      data: message.data,
      // High-priority messages wake the device (Android FCM) and are
      // delivered immediately even in Do Not Disturb / quiet hours.
      ...(isHighPriority
        ? {
            priority: "high" as const,
            // Android notification channel for incoming calls (bypasses DND
            // when the channel is configured with importance HIGH).
            channelId: "incoming_calls",
            // iOS: play sound & show even when the device is muted.
            interruptionLevel: "active" as const,
            _displayInForeground: true,
          }
        : { priority: "default" as const }),
    }));

    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Accept-encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        logger.error(
          {
            event: "expo_push_send_failed",
            userId,
            status: response.status,
            err: await response.text(),
          },
          "Expo push notification HTTP failure",
        );
        return;
      }

      const result = await response.json();
      const receipts = result.data || [];
      
      const invalidTokens: string[] = [];
      const receiptInserts: any[] = [];
      
      for (let i = 0; i < receipts.length; i++) {
        const receipt = receipts[i];
        const token = expoTokens[i];
        
        if (receipt.status === "error") {
          // Direct error
          if (receipt.details?.error === "DeviceNotRegistered") {
            invalidTokens.push(token);
          }
        } else if (receipt.status === "ok" && receipt.id) {
          // It's a ticket, persist it to check receipt later
          receiptInserts.push({
            ticket_id: receipt.id,
            user_id: userId,
            device_token: token,
            status: "pending"
          });
        }
      }

      if (receiptInserts.length > 0) {
        await admin.from("push_receipts").insert(receiptInserts);
      }

      if (invalidTokens.length > 0) {
        await admin
          .from("device_tokens")
          .update({ enabled: false })
          .in("token", invalidTokens);
      }
    } catch (err) {
      logger.error(
        {
          event: "push_notification_dispatch_error",
          userId,
          err: err instanceof Error ? err.message : err,
        },
        "Error sending push notification",
      );
    }
  }

  async checkPendingReceipts() {
    // 1. Fetch pending receipts from db
    const { data: pending } = await admin
      .from("push_receipts")
      .select("ticket_id, device_token")
      .eq("status", "pending")
      .limit(100);

    if (!pending || pending.length === 0) return;

    const ticketIds = pending.map(p => p.ticket_id);

    try {
      const response = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Accept-encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: ticketIds })
      });

      if (!response.ok) return;

      const result = await response.json();
      const data = result.data || {};

      const deliveredIds: string[] = [];
      const errorUpdates: Array<{ id: string; details: any }> = [];
      const invalidTokens: string[] = [];
      
      for (const p of pending) {
        const receipt = data[p.ticket_id];
        if (!receipt) continue;

        if (receipt.status === "ok") {
          deliveredIds.push(p.ticket_id);
        } else if (receipt.status === "error") {
          errorUpdates.push({ id: p.ticket_id, details: receipt.details || null });
          if (receipt.details?.error === "DeviceNotRegistered") {
            invalidTokens.push(p.device_token);
          }
        }
      }

      // Batch update delivered receipts in one query
      if (deliveredIds.length > 0) {
        await admin
          .from("push_receipts")
          .update({ status: "delivered" })
          .in("ticket_id", deliveredIds);
      }

      // Process error updates
      if (errorUpdates.length > 0) {
        await Promise.all(
          errorUpdates.map((item) =>
            admin
              .from("push_receipts")
              .update({ status: "error", error_details: item.details })
              .eq("ticket_id", item.id),
          ),
        );
      }

      // Batch disable invalid device tokens
      if (invalidTokens.length > 0) {
        await admin
          .from("device_tokens")
          .update({ enabled: false })
          .in("token", [...new Set(invalidTokens)]);
      }
    } catch (err) {
      logger.error(
        {
          event: "push_receipt_check_error",
          err: err instanceof Error ? err.message : err,
        },
        "Error checking push receipts",
      );
    }
  }
}

export class DualPushProvider implements PushProvider {
  private expo = new ExpoPushProvider();
  private fcm = new FirebasePushProvider();

  async sendNotification(userId: string, message: PushMessage): Promise<void> {
    // Parallel dual delivery: if one fails or has no tokens for user, the other delivers!
    await Promise.allSettled([
      this.fcm.sendNotification(userId, message),
      this.expo.sendNotification(userId, message),
    ]);
  }

  async checkPendingReceipts(): Promise<void> {
    await this.expo.checkPendingReceipts();
  }
}

export class MockPushProvider implements PushProvider {
  async sendNotification(userId: string, message: PushMessage) {
    logger.debug({ event: "mock_push_dispatched", userId, title: message.title, priority: message.priority }, `[MOCK PUSH] To: ${userId}`);
  }
  async checkPendingReceipts() {}
}

export class PushService {
  private static provider: PushProvider & { checkPendingReceipts?: () => Promise<void> } =
    process.env.NODE_ENV === "test" ? new MockPushProvider() : new DualPushProvider();

  static setProvider(provider: PushProvider & { checkPendingReceipts?: () => Promise<void> }) {
    this.provider = provider;
  }

  static async sendNotification(userId: string, message: PushMessage) {
    return this.provider.sendNotification(userId, message);
  }

  static async checkPendingReceipts() {
    if (this.provider.checkPendingReceipts) {
      await this.provider.checkPendingReceipts();
    }
  }
}
