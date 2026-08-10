export async function registerPush(): Promise<string | null> {
  // Notifications are not supported or safely implemented on the web for Phase 1.3.1.
  console.log("Push notifications skipped on web platform.");
  return null;
}
