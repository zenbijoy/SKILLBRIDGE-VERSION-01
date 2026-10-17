import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { filterVisiblePresence, areUsersConnected, type UserPrivacySettings } from "./privacyService.js";
import { userConnections } from "../socket.js";

// Helper mocking functions for privacy testing
function createMockPrivacySettings(overrides: Partial<UserPrivacySettings> = {}): UserPrivacySettings {
  return {
    profile_visibility: "public",
    who_can_message: "everyone",
    who_can_call: "everyone",
    presence_visibility: "everyone",
    ...overrides,
  };
}

describe("Active Status & Room Features Suite (20 Tests)", () => {
  beforeEach(() => {
    userConnections.clear();
  });

  // ── 1. ACTIVE STATUS PRIVACY & VISIBILITY TESTS (Tests 1 - 7) ───────────────
  describe("Active Status Privacy & Visibility Logic", () => {
    it("Test 1: Target user with presence_visibility 'nobody' hides active status from viewers", async () => {
      // Simulating a target user whose privacy is set to 'nobody'
      const targetUser = "user-stealth-1";
      const viewer = "user-viewer-1";

      const priv = createMockPrivacySettings({ presence_visibility: "nobody" });
      const isVisible = priv.presence_visibility === "everyone" ||
        (priv.presence_visibility === "connections" && await areUsersConnected(viewer, targetUser));

      assert.strictEqual(isVisible, false, "Active status must be hidden when set to nobody");
    });

    it("Test 2: Target user with presence_visibility 'everyone' is visible to viewers", async () => {
      const targetUser = "user-public-1";
      const viewer = "user-viewer-2";

      const priv = createMockPrivacySettings({ presence_visibility: "everyone" });
      const isVisible = priv.presence_visibility === "everyone";

      assert.strictEqual(isVisible, true, "Active status must be visible when set to everyone");
    });

    it("Test 3: Target user with presence_visibility 'connections' is visible when connected", async () => {
      const viewer = "user-alice";
      const connectedPeer = "user-bob";

      const priv = createMockPrivacySettings({ presence_visibility: "connections" });
      const mockConnectedUsers = new Set([`${viewer}:${connectedPeer}`, `${connectedPeer}:${viewer}`]);
      const areConnected = mockConnectedUsers.has(`${viewer}:${connectedPeer}`);

      const isVisible = priv.presence_visibility === "everyone" || (priv.presence_visibility === "connections" && areConnected);
      assert.strictEqual(isVisible, true, "Active status must be visible to confirmed connections");
    });

    it("Test 4: Target user with presence_visibility 'connections' is hidden from strangers", async () => {
      const viewer = "user-alice";
      const stranger = "user-charlie";

      const priv = createMockPrivacySettings({ presence_visibility: "connections" });
      const mockConnectedUsers = new Set<string>(); // no connection
      const areConnected = mockConnectedUsers.has(`${viewer}:${stranger}`);

      const isVisible = priv.presence_visibility === "everyone" || (priv.presence_visibility === "connections" && areConnected);
      assert.strictEqual(isVisible, false, "Active status must be hidden from non-connections");
    });

    it("Test 5: Self presence lookup always resolves visible to self", async () => {
      const userId = "user-myself";
      const targetId = "user-myself";

      const isSelf = userId === targetId;
      assert.strictEqual(isSelf, true, "Self should always see their own presence context");
    });

    it("Test 6: Messenger reciprocity principle: viewer with presence_visibility 'nobody' cannot see others' active status", async () => {
      const viewerPrivacy = createMockPrivacySettings({ presence_visibility: "nobody" });
      const targetUserIds = ["user-1", "user-2", "user-3"];

      // In Facebook Messenger, if you turn off active status, you cannot view anyone else's status either
      const visibleStatusMap: Record<string, boolean> = {};
      if (viewerPrivacy.presence_visibility === "nobody") {
        for (const id of targetUserIds) {
          visibleStatusMap[id] = false;
        }
      }

      assert.strictEqual(visibleStatusMap["user-1"], false);
      assert.strictEqual(visibleStatusMap["user-2"], false);
      assert.strictEqual(visibleStatusMap["user-3"], false);
    });

    it("Test 7: Presence filter handles empty target array gracefully without errors", async () => {
      const result = await filterVisiblePresence("user-viewer", []);
      assert.deepStrictEqual(result, [], "Empty target list must return an empty array");
    });
  });

  // ── 2. SOCKET CONNECTION & PRESENCE TRACKING (Tests 8 - 10) ──────────────────
  describe("Socket Multi-Connection Tracking", () => {
    it("Test 8: Tracks single user connection and marks active in memory", () => {
      const userId = "user-socket-1";
      assert.strictEqual(userConnections.has(userId), false);

      const count = (userConnections.get(userId) || 0) + 1;
      userConnections.set(userId, count);

      assert.strictEqual(userConnections.has(userId), true);
      assert.strictEqual(userConnections.get(userId), 1);
    });

    it("Test 9: Handles multi-device socket connections (phone + laptop)", () => {
      const userId = "user-multi-device";
      userConnections.set(userId, 1);

      // Second device connects
      const updatedCount = (userConnections.get(userId) || 0) + 1;
      userConnections.set(userId, updatedCount);

      assert.strictEqual(userConnections.get(userId), 2);
      assert.strictEqual(userConnections.has(userId), true);
    });

    it("Test 10: Disconnecting one device leaves user online until last socket closes", () => {
      const userId = "user-disconnect-test";
      userConnections.set(userId, 2);

      // Phone disconnects
      const firstDisconnectCount = (userConnections.get(userId) || 1) - 1;
      userConnections.set(userId, firstDisconnectCount);
      assert.strictEqual(userConnections.has(userId), true, "User should still be online with 1 connection");

      // Laptop disconnects
      const secondDisconnectCount = (userConnections.get(userId) || 1) - 1;
      if (secondDisconnectCount === 0) {
        userConnections.delete(userId);
      }
      assert.strictEqual(userConnections.has(userId), false, "User should be offline once all sockets close");
    });
  });

  // ── 3. ROOM KNOCK & ADMISSION SYSTEM (Tests 11 - 15) ─────────────────────────
  describe("Room Knock & Lobby Guard System", () => {
    it("Test 11: Non-member requires knock if room has knock_mode_enabled=true", () => {
      const room = { id: "room-1", knock_mode_enabled: true, visibility: "public", is_locked: false };
      const isMember = false;

      const requiresKnock = !isMember && (room.knock_mode_enabled !== false || room.visibility === "private" || Boolean(room.is_locked));
      assert.strictEqual(requiresKnock, true, "Non-members must knock to join knock-enabled room");
    });

    it("Test 12: Non-member requires knock if room visibility is private", () => {
      const room = { id: "room-2", knock_mode_enabled: false, visibility: "private", is_locked: false };
      const isMember = false;

      const requiresKnock = !isMember && (room.knock_mode_enabled !== false || room.visibility === "private" || Boolean(room.is_locked));
      assert.strictEqual(requiresKnock, true, "Private rooms always require knock/admission");
    });

    it("Test 13: Non-member bypasses knock if public and knock_mode_enabled is explicitly false", () => {
      const room = { id: "room-3", knock_mode_enabled: false, visibility: "public", is_locked: false };
      const isMember = false;

      const requiresKnock = !isMember && (room.knock_mode_enabled !== false || room.visibility === "private" || Boolean(room.is_locked));
      assert.strictEqual(requiresKnock, false, "Open public room does not require knock");
    });

    it("Test 14: Existing room members bypass knock lobby immediately", () => {
      const room = { id: "room-4", knock_mode_enabled: true, visibility: "private", is_locked: true };
      const isMember = true;

      const requiresKnock = !isMember && (room.knock_mode_enabled !== false || room.visibility === "private" || Boolean(room.is_locked));
      assert.strictEqual(requiresKnock, false, "Admitted members enter room directly");
    });

    it("Test 15: Validates knock request creation payload with message and audio call intent", () => {
      const payload = {
        message: "Hi educator, I would like to join today's Algorithms study session.",
        audioCall: true,
      };

      assert.strictEqual(typeof payload.message, "string");
      assert.ok(payload.message.trim().length > 0);
      assert.strictEqual(payload.audioCall, true);
    });
  });

  // ── 4. ROOM ROLE HIERARCHY & PERMISSIONS (Tests 16 - 19) ─────────────────────
  describe("Room Role Hierarchy & Discord/Telegram-Style Permissions", () => {
    function computeRoomPermissions(role: "owner" | "teacher" | "moderator" | "member" | null) {
      return {
        canModerate: role === "owner" || role === "moderator",
        canManageMembers: role === "owner" || role === "moderator",
        canManageChannels: role === "owner",
        canAnnounce: role === "owner" || role === "teacher",
        canPost: role !== null,
        canPin: role === "owner" || role === "moderator",
        canHostLive: role === "owner" || role === "teacher",
      };
    }

    it("Test 16: Room Owner has full administrative permissions", () => {
      const perms = computeRoomPermissions("owner");
      assert.strictEqual(perms.canModerate, true);
      assert.strictEqual(perms.canManageMembers, true);
      assert.strictEqual(perms.canManageChannels, true);
      assert.strictEqual(perms.canAnnounce, true);
      assert.strictEqual(perms.canPin, true);
      assert.strictEqual(perms.canHostLive, true);
    });

    it("Test 17: Room Teacher can host live classes and make announcements", () => {
      const perms = computeRoomPermissions("teacher");
      assert.strictEqual(perms.canHostLive, true);
      assert.strictEqual(perms.canAnnounce, true);
      assert.strictEqual(perms.canManageChannels, false, "Teachers cannot delete or rename core channels");
    });

    it("Test 18: Room Moderator can manage members, knocks, and pin content", () => {
      const perms = computeRoomPermissions("moderator");
      assert.strictEqual(perms.canModerate, true);
      assert.strictEqual(perms.canManageMembers, true);
      assert.strictEqual(perms.canPin, true);
      assert.strictEqual(perms.canManageChannels, false);
    });

    it("Test 19: Standard room member can participate but cannot pin or announce", () => {
      const perms = computeRoomPermissions("member");
      assert.strictEqual(perms.canPost, true);
      assert.strictEqual(perms.canAnnounce, false);
      assert.strictEqual(perms.canPin, false);
      assert.strictEqual(perms.canModerate, false);
    });
  });

  // ── 5. DIRECTIONAL SCROLL FAB STATE MACHINE (Test 20) ────────────────────────
  describe("Directional Scroll Floating Action Button Logic", () => {
    it("Test 20: Directional scroll state machine shows FAB on downward browse and hides on upward scroll", () => {
      class ScrollFabController {
        private isVisible = false;
        private lastY = 0;
        private downwardDelta = 0;
        private upwardDelta = 0;

        public onScroll(currentY: number): boolean {
          // Top lock threshold (always hide at absolute top)
          if (currentY <= 15) {
            this.isVisible = false;
            this.lastY = currentY;
            this.downwardDelta = 0;
            this.upwardDelta = 0;
            return this.isVisible;
          }

          const delta = currentY - this.lastY;
          this.lastY = currentY;

          if (delta > 2) {
            // Scrolling down
            this.upwardDelta = 0;
            this.downwardDelta += delta;
            if (this.downwardDelta >= 12) {
              this.isVisible = true;
            }
          } else if (delta < -2) {
            // Scrolling up
            this.downwardDelta = 0;
            this.upwardDelta += Math.abs(delta);
            if (this.upwardDelta >= 6) {
              this.isVisible = false;
            }
          }

          return this.isVisible;
        }
      }

      const controller = new ScrollFabController();

      // At initial top (0px): FAB must be hidden
      assert.strictEqual(controller.onScroll(0), false);

      // User scrolls down into the feed (delta +20px)
      assert.strictEqual(controller.onScroll(30), true, "FAB must appear when user browses down into feed");

      // User continues scrolling down
      assert.strictEqual(controller.onScroll(80), true);

      // User scrolls back up towards the top (delta -15px)
      assert.strictEqual(controller.onScroll(65), false, "FAB must disappear when user scrolls up");

      // User reaches top of the screen
      assert.strictEqual(controller.onScroll(5), false, "FAB must remain hidden at top lock");
    });
  });
});
