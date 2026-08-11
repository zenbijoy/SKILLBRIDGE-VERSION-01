import { admin } from "../lib/db.js";
import { PushService } from "./PushService.js";

export async function notifyUser(
  userId: string,
  title: string,
  body: string,
  kind = "general",
  data: Record<string, string> = {},
) {
  const { error } = await admin
    .from("notifications")
    .insert({ user_id: userId, title, body, kind, data });

  if (error) throw error;

  await PushService.sendNotification(userId, {
    title,
    body,
    data,
  });
}
