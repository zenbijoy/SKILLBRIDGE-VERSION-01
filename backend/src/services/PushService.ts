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
        
        receiptInserts.push({
          ticket_id: receipt.id || "error",
          user_id: userId,
          device_token: token,
          status: receipt.status,
          error_details: receipt.details || null
        });
        
        if (receipt.status === "error" && receipt.details?.error === "DeviceNotRegistered") {
          invalidTokens.push(token);
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
}

export class MockPushProvider implements PushProvider {
  async sendNotification(userId: string, message: { title: string; body: string; data?: Record<string, any> }) {
    console.log(`[MOCK PUSH] To: ${userId}, Title: ${message.title}`);
  }
}

export class PushService {
  private static provider: PushProvider = process.env.NODE_ENV === "test" ? new MockPushProvider() : new ExpoPushProvider();
  
  static setProvider(provider: PushProvider) {
    this.provider = provider;
  }
  
  static async sendNotification(
    userId: string,
    message: { title: string; body: string; data?: Record<string, any> }
  ) {
    return this.provider.sendNotification(userId, message);
  }
}
