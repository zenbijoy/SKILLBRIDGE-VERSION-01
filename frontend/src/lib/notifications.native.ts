import { useEffect } from "react";
import { useRouter } from "expo-router";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";
import { useCallStore } from "@/features/calls/store/callStore";

const DEVICE_FP_KEY = "@skillbridge_push_device_fingerprint";
const FCM_FP_KEY = "@skillbridge_fcm_device_fingerprint";

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const isCall = Boolean((notification.request.content.data as any)?.callId);
    return {
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
      // On Android, high priority calls ring over current screen
      priority: isCall ? Notifications.AndroidNotificationPriority.MAX : Notifications.AndroidNotificationPriority.HIGH,
    };
  },
});

export async function setupNotificationChannels(): Promise<void> {
  // 1. WhatsApp-style Interactive Call Action Category (Accept & Decline from lock screen / notification shade)
  try {
    await Notifications.setNotificationCategoryAsync("call", [
      {
        identifier: "accept",
        buttonTitle: "Accept",
        options: {
          opensAppToForeground: true,
        },
      },
      {
        identifier: "decline",
        buttonTitle: "Decline",
        options: {
          opensAppToForeground: false,
          isDestructive: true,
        },
      },
    ]);
  } catch (err) {
    console.warn("[Push] Error setting notification category:", err);
  }

  if (Platform.OS === "android") {
    // 2. WhatsApp-style Incoming Call Notification Channel (bypasses DND, max importance)
    await Notifications.setNotificationChannelAsync("incoming_calls", {
      name: "Incoming Calls",
      description: "High priority incoming voice and video call alerts",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500, 250, 500],
      lightColor: "#10B981",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
      sound: "default",
      enableVibrate: true,
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.VOICE_COMMUNICATION_SIGNALLING,
        contentType: Notifications.AndroidAudioContentType.SONIFICATION,
      },
    });

    // 3. Default General Channel
    await Notifications.setNotificationChannelAsync("default", {
      name: "General Notifications",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#3B82F6",
      sound: "default",
    });
  }
}

export async function registerPush(): Promise<string | null> {
  if (!Device.isDevice) return null;
  try {
    await setupNotificationChannels();

    const current = await Notifications.getPermissionsAsync();
    const perm = current.status === "granted" ? current : await Notifications.requestPermissionsAsync();
    if (perm.status !== "granted") return null;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    let expoToken: string | null = null;

    // 1. Dual Pipeline Step A: Register Expo Push Token
    if (projectId) {
      try {
        const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
        expoToken = tokenData.data;
        const device = await api<{ token_fingerprint?: string }>("/notifications/devices", {
          method: "POST",
          body: JSON.stringify({
            token: expoToken,
            platform: Platform.OS,
            provider: "expo",
            device_id: Device.modelId ?? undefined,
            app_version: Constants.expoConfig?.version,
          }),
        });
        if (device.token_fingerprint) await AsyncStorage.setItem(DEVICE_FP_KEY, device.token_fingerprint);
      } catch (expoErr) {
        console.warn("[Push] Expo token registration fallback:", expoErr);
      }
    }

    // 2. Dual Pipeline Step B: Register Native FCM Device Token directly for Firebase
    try {
      const nativeDeviceTokenData = await Notifications.getDevicePushTokenAsync();
      const fcmToken = nativeDeviceTokenData?.data;
      if (fcmToken && fcmToken !== expoToken) {
        const fcmDevice = await api<{ token_fingerprint?: string }>("/notifications/devices", {
          method: "POST",
          body: JSON.stringify({
            token: fcmToken,
            platform: Platform.OS,
            provider: "fcm",
            device_id: Device.modelId ?? undefined,
            app_version: Constants.expoConfig?.version,
          }),
        });
        if (fcmDevice.token_fingerprint) await AsyncStorage.setItem(FCM_FP_KEY, fcmDevice.token_fingerprint);
      }
    } catch (fcmErr) {
      console.warn("[Push] Native FCM registration fallback:", fcmErr);
    }

    return expoToken;
  } catch (error) {
    console.warn("Push token registration skipped or failed in dev build:", error);
    return null;
  }
}

export async function unregisterPush(): Promise<void> {
  const [expoFp, fcmFp] = await Promise.all([
    AsyncStorage.getItem(DEVICE_FP_KEY),
    AsyncStorage.getItem(FCM_FP_KEY),
  ]);

  if (expoFp) {
    try {
      await api(`/notifications/devices/${expoFp}`, { method: "DELETE" });
      await AsyncStorage.removeItem(DEVICE_FP_KEY);
    } catch {}
  }

  if (fcmFp) {
    try {
      await api(`/notifications/devices/${fcmFp}`, { method: "DELETE" });
      await AsyncStorage.removeItem(FCM_FP_KEY);
    } catch {}
  }
}

export function useNotificationRouting(router: ReturnType<typeof useRouter>) {
  const lastNotificationResponse = Notifications.useLastNotificationResponse();

  // 1. Listen for background & lockscreen notification response actions (Accept / Decline / Banner Tap)
  useEffect(() => {
    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const actionId = response.actionIdentifier;
      const data = response.notification?.request?.content?.data as Record<string, any> | undefined;
      const callId = data?.callId;

      if (callId) {
        // Always stop incoming sound and vibration on user action
        import("@/features/calls/services/callSounds").then(({ callSounds }) => {
          callSounds.stopAll().catch(() => {});
        });
        import("react-native").then(({ Vibration }) => {
          Vibration.cancel();
        });
        Notifications.dismissNotificationAsync(response.notification.request.identifier).catch(() => {});

        if (actionId === "decline") {
          import("@/features/calls/store/callStore").then(({ useCallStore }) => {
            useCallStore.getState().setIncomingCall(null);
          });
          import("@/features/calls/services/callApi").then(({ rejectCallApi }) => {
            rejectCallApi(callId, "declined").catch(() => {});
          });
          import("@/lib/socket").then(({ getSocket }) => {
            getSocket()?.emit("call:reject", { callId, reason: "declined" });
          });
          return;
        }

        // "accept" action opens and auto-accepts the call immediately
        if (actionId === "accept") {
          router.push(`/call/${callId}?callId=${callId}&autoAccept=true` as any);
          return;
        }

        // Banner tap opens the call screen
        router.push(`/call/${callId}?callId=${callId}` as any);
        return;
      }

      if (typeof data?.url === "string" && data.url.startsWith("/")) {
        router.push(data.url as any);
        return;
      }
    });

    return () => {
      responseSub.remove();
    };
  }, [router]);

  // 2. Listen for active incoming foreground push notifications for instant in-app call modal
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as Record<string, any> | undefined;

      // Handle remote cancellation or call ended push
      if (data?.type === "call_ended" || data?.type === "call_cancelled") {
        import("@/features/calls/services/callSounds").then(({ callSounds }) => {
          callSounds.stopAll().catch(() => {});
        });
        import("react-native").then(({ Vibration }) => {
          Vibration.cancel();
        });
        useCallStore.getState().setIncomingCall(null);
        Notifications.dismissNotificationAsync(notification.request.identifier).catch(() => {});
        return;
      }

      if (data?.callId) {
        const { activeCall, setIncomingCall } = useCallStore.getState();
        if (activeCall && activeCall.status === "connected") return;
        setIncomingCall({
          callId: data.callId,
          callerId: data.callerId || "",
          callerName: data.callerName || "SkillBridge User",
          callerAvatar: data.callerAvatar || null,
          type: data.callType === "audio" ? "audio" : "video",
          provider: "webrtc",
        });
      }
    });

    return () => {
      sub.remove();
    };
  }, []);

  useEffect(() => {
    const data = lastNotificationResponse?.notification?.request?.content?.data as Record<string, any> | undefined;
    if (!data) return;

    if (typeof data.url === "string" && data.url.startsWith("/")) {
      router.push(data.url as any);
      return;
    }

    if (data.roomId) {
      router.push(`/room/${data.roomId}` as any);
    } else if (data.clubId) {
      router.push(`/club/${data.clubId}` as any);
    } else if (data.conversationId) {
      router.push(`/chat/${data.conversationId}` as any);
    } else if (data.postId) {
      router.push("/feed" as any);
    } else if (data.bookingId) {
      router.push("/schedule" as any);
    } else if (data.callId) {
      // Direct call routing
      const actionId = lastNotificationResponse?.actionIdentifier;
      if (actionId === "accept") {
        router.push(`/call/${data.callId}?callId=${data.callId}&autoAccept=true` as any);
      } else {
        router.push(`/call/${data.callId}?callId=${data.callId}` as any);
      }
    }
  }, [lastNotificationResponse, router]);
}
