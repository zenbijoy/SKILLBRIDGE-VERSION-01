import { useEffect } from "react";
import { useRouter } from "expo-router";
import { api } from "./api";
import { getSocket } from "./socket";

const WEB_DEVICE_FP_KEY = "@skillbridge_web_push_device_fingerprint";

function getBrowserFingerprint(): string {
  if (typeof window === "undefined") return "web_client_ssr";
  let fp = window.localStorage.getItem(WEB_DEVICE_FP_KEY);
  if (!fp) {
    fp = `web_${Date.now()}_${Math.random().toString(36).substring(2, 12)}`;
    window.localStorage.setItem(WEB_DEVICE_FP_KEY, fp);
  }
  return fp;
}

export async function registerPush(): Promise<string | null> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return null;
  }

  try {
    let perm = Notification.permission;
    if (perm === "default") {
      perm = await Notification.requestPermission();
    }

    if (perm !== "granted") {
      return null;
    }

    const browserId = getBrowserFingerprint();

    // Register with backend device endpoint
    await api<{ token_fingerprint?: string }>("/notifications/devices", {
      method: "POST",
      body: JSON.stringify({
        token: `web_push_token_${browserId}`,
        platform: "web",
        provider: "web",
        device_id: browserId,
        app_version: "2.0.1",
      }),
    });

    return browserId;
  } catch (error) {
    console.warn("[Web Notification] Registration note:", error);
    return null;
  }
}

export async function unregisterPush(): Promise<void> {
  if (typeof window === "undefined") return;
  const fp = window.localStorage.getItem(WEB_DEVICE_FP_KEY);
  if (!fp) return;

  try {
    // Attempt backend cleanup
    window.localStorage.removeItem(WEB_DEVICE_FP_KEY);
  } catch (err) {
    console.warn("Could not unregister web push:", err);
  }
}

export function showWebNotification(
  title: string,
  options?: NotificationOptions & { url?: string },
  onClick?: () => void,
) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    const notification = new Notification(title, {
      icon: "/favicon.png",
      badge: "/favicon.png",
      ...options,
    });

    notification.onclick = () => {
      window.focus();
      if (onClick) onClick();
      else if (options?.url) {
        window.location.href = options.url;
      }
      notification.close();
    };
  } catch (err) {
    console.warn("Could not display browser notification:", err);
  }
}

export function useNotificationRouting(router: ReturnType<typeof useRouter>) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const socket = getSocket();
    if (!socket) return;

    const handleIncomingCall = (data: { callerName: string; callId: string; type: string }) => {
      if (document.hidden) {
        showWebNotification(
          `Incoming ${data.type === "video" ? "Video" : "Audio"} Call`,
          {
            body: `${data.callerName} is calling you on SkillBridge`,
            tag: `call_${data.callId}`,
            url: `/call/${data.callId}`,
          },
          () => router.push(`/call/${data.callId}` as any),
        );
      }
    };

    const handleNewMessage = (data: { senderName?: string; conversationId?: string; preview?: string }) => {
      if (document.hidden && data.conversationId) {
        showWebNotification(
          data.senderName ? `Message from ${data.senderName}` : "New Message",
          {
            body: data.preview || "You have a new message on SkillBridge",
            tag: `chat_${data.conversationId}`,
            url: `/chat/${data.conversationId}`,
          },
          () => router.push(`/chat/${data.conversationId}` as any),
        );
      }
    };

    socket.on("call:incoming", handleIncomingCall);
    socket.on("chat:message", handleNewMessage);

    return () => {
      socket.off("call:incoming", handleIncomingCall);
      socket.off("chat:message", handleNewMessage);
    };
  }, [router]);
}
