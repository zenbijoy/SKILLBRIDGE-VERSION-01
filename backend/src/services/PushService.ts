import { admin } from "../lib/db.js";

export interface PushProvider {
  sendNotification(userId: string, message: { title: string; body: string; data?: Record<string, any> }): Promise<void>;
}

export class ExpoPushProvider implements PushProvider {
  async sendNotification(userId: string, message: { title: string; body: string; data?: Record<string, any> }) {
    const { data: tokens } = await admin
      .from("device_tokens")
      .select("token")
      .eq("user_id", userId)
      .eq("provider", "expo")
      .eq("enabled", true);

    if (!tokens || tokens.length === 0) return;

    const expoTokens = tokens.map(t => t.token);

    const payload = expoTokens.map(token => ({
      to: token,
      sound: "default",
      title: message.title,
      body: message.body,
      data: message.data
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
        console.error("Expo push notification failed:", await response.text());
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
      console.error("Error sending push notification:", err);
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

      const invalidTokens: string[] = [];
      
      for (const p of pending) {
        const receipt = data[p.ticket_id];
        if (!receipt) continue;

        if (receipt.status === "ok") {
          await admin.from("push_receipts").update({ status: "delivered" }).eq("ticket_id", p.ticket_id);
        } else if (receipt.status === "error") {
          await admin.from("push_receipts").update({ 
            status: "error", 
            error_details: receipt.details || null 
          }).eq("ticket_id", p.ticket_id);

          if (receipt.details?.error === "DeviceNotRegistered") {
            invalidTokens.push(p.device_token);
          }
        }
      }

      if (invalidTokens.length > 0) {
        await admin
          .from("device_tokens")
          .update({ enabled: false })
          .in("token", invalidTokens);
      }
    } catch (err) {
      console.error("Error checking push receipts:", err);
    }
  }
}

export class MockPushProvider implements PushProvider {
  async sendNotification(userId: string, message: { title: string; body: string; data?: Record<string, any> }) {
    console.log(`[MOCK PUSH] To: ${userId}, Title: ${message.title}`);
  }
  async checkPendingReceipts() {}
}

export class PushService {
  private static provider: PushProvider & { checkPendingReceipts?: () => Promise<void> } = process.env.NODE_ENV === "test" ? new MockPushProvider() : new ExpoPushProvider();
  
  static setProvider(provider: PushProvider & { checkPendingReceipts?: () => Promise<void> }) {
    this.provider = provider;
  }
  
  static async sendNotification(
    userId: string,
    message: { title: string; body: string; data?: Record<string, any> }
  ) {
    return this.provider.sendNotification(userId, message);
  }

  static async checkPendingReceipts() {
    if (this.provider.checkPendingReceipts) {
      await this.provider.checkPendingReceipts();
    }
  }
}
