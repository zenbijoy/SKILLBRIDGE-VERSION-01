/* eslint-disable no-restricted-globals */
// SkillBridge Web Push Notification Service Worker
// Standards-compliant Push API & Notification handling (RFC 8030 / RFC 8292)

self.addEventListener("install", (event) => {
  // Activate worker immediately without waiting for existing tabs to close
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Take control of all pages within scope immediately
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) {
    return;
  }

  let payload = {};
  try {
    payload = event.data.json();
  } catch (err) {
    payload = {
      title: "SkillBridge Notification",
      body: event.data.text(),
    };
  }

  const title = payload.title || "SkillBridge Notification";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/favicon.png",
    badge: payload.badge || "/favicon.png",
    tag: payload.tag || `skillbridge_push_${Date.now()}`,
    data: payload.data || {},
    renotify: payload.renotify !== false,
    requireInteraction: Boolean(payload.requireInteraction),
    actions: payload.actions || [],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const notifData = event.notification.data || {};
  let targetUrl = notifData.url || "/notifications";
  if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://") && !targetUrl.startsWith("/")) {
    targetUrl = "/" + targetUrl;
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // If a SkillBridge tab is already open, focus it and navigate
      for (const client of windowClients) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) {
            return client.navigate(targetUrl);
          }
          return;
        }
      }
      // If no open client exists, open a new window/tab
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
