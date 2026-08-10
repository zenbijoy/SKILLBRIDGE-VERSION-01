import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "./api";
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});
export async function registerPush() {
  if (!Device.isDevice) return null;
  const current = await Notifications.getPermissionsAsync();
  const perm =
    current.status === "granted"
      ? current
      : await Notifications.requestPermissionsAsync();
  if (perm.status !== "granted") return null;
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("default", {
      name: "SkillBridge",
      importance: Notifications.AndroidImportance.HIGH,
    });
  const token = (await Notifications.getExpoPushTokenAsync()).data;
  await api("/notifications/devices", {
    method: "POST",
    body: JSON.stringify({ token, platform: Platform.OS }),
  });
  return token;
}
