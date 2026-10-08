import { admin } from "../lib/db.js";
import { PushService } from "./PushService.js";
import { getSocketServer } from "../socket.js";

const preferenceByKind: Record<string, "messages" | "connections" | "rooms" | "sessions" | "teaching" | "system"> = {
  message: "messages",
  messages: "messages",
  connection: "connections",
  connections: "connections",
  room: "rooms",
  rooms: "rooms",
  session: "sessions",
  sessions: "sessions",
  teaching: "teaching",
  event: "system",
  research: "system",
  general: "system",
  system: "system",
};

export function isWithinQuietHours(now: Date, start: string, end: string, timezone: string) {
  if (start === end) return false;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const currentMinutes = hour * 60 + minute;
  const [startHour = 0, startMinute = 0] = start.split(":").map(Number);
  const [endHour = 0, endMinute = 0] = end.split(":").map(Number);
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;
  return startMinutes < endMinutes
    ? currentMinutes >= startMinutes && currentMinutes < endMinutes
    : currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

export async function notifyUser(
  userId: string,
  title: string,
  body: string,
  kind = "general",
  data: Record<string, string> = {},
  options: { priority?: "normal" | "high"; bypassQuietHours?: boolean } = {},
) {
  const priority = options.priority ?? "normal";
  const bypassQuietHours = options.bypassQuietHours ?? false;

  const { data: record, error } = await admin
    .from("notifications")
    .insert({ user_id: userId, title, body, kind, data })
    .select("id")
    .maybeSingle();

  if (error) throw error;

  const io = getSocketServer();
  if (io) {
    io.to(`user:${userId}`).emit("notification:new", {
      id: record?.id ?? null,
      user_id: userId,
      title,
      body,
      kind,
      data,
      priority,
      read_at: null,
      created_at: new Date().toISOString(),
    });
  }

  const [preferencesQ, profileQ] = await Promise.all([
    admin.from("notification_preferences").select("messages,connections,rooms,sessions,teaching,system").eq("user_id", userId).maybeSingle(),
    admin.from("profiles").select("quiet_hours_start,quiet_hours_end,timezone,onboarding_push_opt_in").eq("id", userId).maybeSingle(),
  ]);
  if (preferencesQ.error) throw preferencesQ.error;
  if (profileQ.error) throw profileQ.error;

  const preferenceKey = preferenceByKind[kind] ?? "system";
  const categoryEnabled = preferencesQ.data?.[preferenceKey] ?? true;
  const pushOptIn = profileQ.data?.onboarding_push_opt_in ?? true;
  const quiet = isWithinQuietHours(
    new Date(),
    profileQ.data?.quiet_hours_start ?? "22:00",
    profileQ.data?.quiet_hours_end ?? "07:00",
    profileQ.data?.timezone ?? "Asia/Dhaka",
  );
  // High-priority (e.g. incoming calls) always bypass quiet hours so the
  // callee is paged even at night — matching WhatsApp/Phone behaviour.
  if (!categoryEnabled || !pushOptIn) return;
  if (quiet && !bypassQuietHours) return;

  await PushService.sendNotification(userId, {
    title,
    body,
    data,
    priority,
  });
}
