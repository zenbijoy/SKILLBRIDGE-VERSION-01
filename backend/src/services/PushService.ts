import { admin } from "../lib/db.js";

export class PushService {
  static async sendNotification(
    userId: string,
    message: { title: string; body: string; data?: Record<string, any> }
  ) {
    const { data: tokens } = await admin
      .from("device_tokens")
      .select("token")
      .eq("user_id", userId)
      .eq("is_active", true);

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
      for (let i = 0; i < receipts.length; i++) {
        const receipt = receipts[i];
        if (receipt.status === "error" && receipt.details?.error === "DeviceNotRegistered") {
          invalidTokens.push(expoTokens[i]);
        }
      }

      if (invalidTokens.length > 0) {
        await admin
          .from("device_tokens")
          .update({ is_active: false })
          .in("token", invalidTokens);
      }
    } catch (err) {
      console.error("Error sending push notification:", err);
    }
  }
}
