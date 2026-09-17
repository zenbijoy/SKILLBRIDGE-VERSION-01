import { admin } from "../lib/db.js";
import { isBlocked } from "../lib/query-helpers.js";

export type PrivacyPermission = "everyone" | "connections" | "nobody";
export type ProfileVisibility = "public" | "connections" | "private";

export type UserPrivacySettings = {
  profile_visibility: ProfileVisibility;
  who_can_message: PrivacyPermission;
  who_can_call: PrivacyPermission;
  presence_visibility: PrivacyPermission;
};

const DEFAULT_PRIVACY: UserPrivacySettings = {
  profile_visibility: "public",
  who_can_message: "everyone",
  who_can_call: "everyone",
  presence_visibility: "everyone",
};

/**
 * Check if two users are confirmed connections in the connections graph.
 */
export async function areUsersConnected(userA: string, userB: string): Promise<boolean> {
  if (userA === userB) return true;
  const { data } = await admin
    .from("connections")
    .select("id")
    .or(`and(user_a.eq.${userA},user_b.eq.${userB}),and(user_a.eq.${userB},user_b.eq.${userA})`)
    .maybeSingle();

  return Boolean(data);
}

/**
 * Retrieve comprehensive privacy settings for a user.
 */
export async function getUserPrivacySettings(userId: string): Promise<UserPrivacySettings> {
  const [profileRes, settingsRes] = await Promise.all([
    admin.from("profiles").select("profile_visibility").eq("id", userId).maybeSingle(),
    admin.from("user_settings").select("notification_preferences").eq("user_id", userId).maybeSingle(),
  ]);

  const pVis = profileRes.data?.profile_visibility as ProfileVisibility | undefined;
  const privacyJson = (settingsRes.data?.notification_preferences as any)?.privacy || {};

  return {
    profile_visibility: pVis || DEFAULT_PRIVACY.profile_visibility,
    who_can_message: privacyJson.who_can_message || DEFAULT_PRIVACY.who_can_message,
    who_can_call: privacyJson.who_can_call || DEFAULT_PRIVACY.who_can_call,
    presence_visibility: privacyJson.presence_visibility || DEFAULT_PRIVACY.presence_visibility,
  };
}

/**
 * Update privacy settings atomically across profiles and user_settings.
 */
export async function updateUserPrivacySettings(
  userId: string,
  patch: Partial<UserPrivacySettings>,
): Promise<UserPrivacySettings> {
  const tasks: Promise<any>[] = [];

  // Update profile visibility on profiles table
  if (patch.profile_visibility) {
    tasks.push(
      Promise.resolve(
        admin
          .from("profiles")
          .update({ profile_visibility: patch.profile_visibility })
          .eq("id", userId),
      ),
    );
  }

  // Update privacy preferences inside user_settings
  if (patch.who_can_message || patch.who_can_call || patch.presence_visibility) {
    tasks.push(
      (async () => {
        const { data: current } = await admin
          .from("user_settings")
          .select("notification_preferences")
          .eq("user_id", userId)
          .maybeSingle();

        const currentPrefs = (current?.notification_preferences as Record<string, any>) || {};
        const currentPrivacy = currentPrefs.privacy || {};

        const updatedPrivacy = {
          ...currentPrivacy,
          ...(patch.who_can_message && { who_can_message: patch.who_can_message }),
          ...(patch.who_can_call && { who_can_call: patch.who_can_call }),
          ...(patch.presence_visibility && { presence_visibility: patch.presence_visibility }),
        };

        const updatedPrefs = {
          ...currentPrefs,
          privacy: updatedPrivacy,
        };

        await admin.from("user_settings").upsert({
          user_id: userId,
          notification_preferences: updatedPrefs,
          updated_at: new Date().toISOString(),
        });
      })(),
    );
  }

  await Promise.all(tasks);
  return getUserPrivacySettings(userId);
}

/**
 * Server-authoritative check: Can user A send a direct message to user B?
 */
export async function canUserMessage(senderId: string, recipientId: string): Promise<{ allowed: boolean; reason?: string }> {
  if (senderId === recipientId) return { allowed: true };

  // 1. Check if blocked
  const blocked = await isBlocked(senderId, recipientId);
  if (blocked) {
    return { allowed: false, reason: "Unable to message this user." };
  }

  // 2. Check recipient's message privacy setting
  const recipientPrivacy = await getUserPrivacySettings(recipientId);

  if (recipientPrivacy.who_can_message === "nobody") {
    return { allowed: false, reason: "This user does not accept direct messages." };
  }

  if (recipientPrivacy.who_can_message === "connections") {
    const connected = await areUsersConnected(senderId, recipientId);
    if (!connected) {
      return { allowed: false, reason: "This user only accepts messages from connections." };
    }
  }

  return { allowed: true };
}

/**
 * Server-authoritative check: Can user A initiate a voice or video call to user B?
 */
export async function canUserCall(callerId: string, calleeId: string): Promise<{ allowed: boolean; reason?: string }> {
  if (callerId === calleeId) return { allowed: true };

  // 1. Check if blocked
  const blocked = await isBlocked(callerId, calleeId);
  if (blocked) {
    return { allowed: false, reason: "Cannot connect call due to privacy settings." };
  }

  // 2. Check callee's call privacy setting
  const calleePrivacy = await getUserPrivacySettings(calleeId);

  if (calleePrivacy.who_can_call === "nobody") {
    return { allowed: false, reason: "This user does not accept calls." };
  }

  if (calleePrivacy.who_can_call === "connections") {
    const connected = await areUsersConnected(callerId, calleeId);
    if (!connected) {
      return { allowed: false, reason: "This user only accepts calls from connections." };
    }
  }

  return { allowed: true };
}

/**
 * Filter a list of candidate user IDs according to their presence_visibility settings relative to viewerId.
 */
export async function filterVisiblePresence(viewerId: string, targetUserIds: string[]): Promise<string[]> {
  if (targetUserIds.length === 0) return [];

  const settingsList = await Promise.all(
    targetUserIds.map(async (targetId) => {
      if (targetId === viewerId) return { targetId, visible: true };
      const priv = await getUserPrivacySettings(targetId);
      if (priv.presence_visibility === "nobody") return { targetId, visible: false };
      if (priv.presence_visibility === "everyone") return { targetId, visible: true };
      // connections
      const connected = await areUsersConnected(viewerId, targetId);
      return { targetId, visible: connected };
    }),
  );

  return settingsList.filter((s) => s.visible).map((s) => s.targetId);
}
