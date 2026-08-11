import { useEffect } from "react";
import { useRouter } from "expo-router";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import Constants from "expo-constants";
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
  try {
    const current = await Notifications.getPermissionsAsync();
    const perm =
      current.status === "granted"
        ? current
        : await Notifications.requestPermissionsAsync();
    if (perm.status !== "granted") return null;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;

    await api("/account/device-token", {
      method: "POST",
      body: JSON.stringify({ token, platform: Platform.OS }),
    });

    return token;
  } catch (error) {
    console.error("Failed to register push token:", error);
    return null;
  }
}

export function useNotificationRouting(router: ReturnType<typeof useRouter>) {
  const lastNotificationResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    const url = lastNotificationResponse?.notification?.request?.content?.data?.url;
    if (url) {
      router.push(url as any);
    }
  }, [lastNotificationResponse, router]);
}
