import { useEffect } from "react";
import { useRouter } from "expo-router";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";

const DEVICE_FP_KEY = "@skillbridge_push_device_fingerprint";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerPush(): Promise<string | null> {
  if (!Device.isDevice) return null;
  try {
    const current = await Notifications.getPermissionsAsync();
    const perm = current.status === "granted" ? current : await Notifications.requestPermissionsAsync();
    if (perm.status !== "granted") return null;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      console.warn("Push registration skipped: EAS projectId is not configured.");
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;
    const device = await api<{ token_fingerprint?: string }>("/notifications/devices", {
      method: "POST",
      body: JSON.stringify({
        token,
        platform: Platform.OS,
        provider: "expo",
        device_id: Device.modelId ?? undefined,
        app_version: Constants.expoConfig?.version,
      }),
    });
    if (device.token_fingerprint) await AsyncStorage.setItem(DEVICE_FP_KEY, device.token_fingerprint);
    return token;
  } catch (error) {
    console.error("Failed to register push token:", error);
    return null;
  }
}

export async function unregisterPush(): Promise<void> {
  const fingerprint = await AsyncStorage.getItem(DEVICE_FP_KEY);
  if (!fingerprint) return;
  try {
    await api(`/notifications/devices/${fingerprint}`, { method: "DELETE" });
    await AsyncStorage.removeItem(DEVICE_FP_KEY);
  } catch (error) {
    console.error("Failed to unregister push token:", error);
    throw error;
  }
}

export function useNotificationRouting(router: ReturnType<typeof useRouter>) {
  const lastNotificationResponse = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const url = lastNotificationResponse?.notification?.request?.content?.data?.url;
    if (typeof url === "string" && url.startsWith("/")) router.push(url as any);
  }, [lastNotificationResponse, router]);
}
