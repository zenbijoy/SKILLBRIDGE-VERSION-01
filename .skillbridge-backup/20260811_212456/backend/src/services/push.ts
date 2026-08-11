import { admin } from "../lib/db.js";
import { env } from "../config/env.js";
export async function notifyUser(
  userId: string,
  title: string,
  body: string,
  kind = "general",
  data: Record<string, string> = {},
) {
  await admin
    .from("notifications")
    .insert({ user_id: userId, title, body, kind, data });
  const { data: tokens } = await admin
    .from("device_tokens")
    .select("token")
    .eq("user_id", userId)
    .eq("enabled", true);
  if (!tokens?.length) return;
  const messages = tokens.map((t) => ({
    to: t.token,
    sound: "default",
    title,
    body,
    data,
  }));
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (env.EXPO_PUSH_ACCESS_TOKEN)
    headers.Authorization = `Bearer ${env.EXPO_PUSH_ACCESS_TOKEN}`;
  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers,
    body: JSON.stringify(messages),
  }).catch(() => undefined);
}
