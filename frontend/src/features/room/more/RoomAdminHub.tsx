import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useI18n } from "@/i18n";
import type { Profile, Room } from "@/types";
import { Row, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import { copyToClipboard } from "@/utils/safeClipboard";

type RoomAdminHubProps = {
  room: Room;
  members: Profile[];
  currentUserId?: string;
  isOwner?: boolean;
  canManageMembers?: boolean;
  canModerate?: boolean;
  canAnnounce?: boolean;
  onOpenRoleManagement?: () => void;
  onOpenPinnedHub?: () => void;
  onOpenModerationCenter?: () => void;
  onOpenAnalytics?: () => void;
  onOpenSettings?: () => void;
  onOpenKnockRequests?: () => void;
  onOpenStudyPermissions?: () => void;
  onOpenMonitoringCenter?: () => void;
  onRoomUpdated?: (updated: Partial<Room>) => void;
};

export function RoomAdminHub({
  room,
  members,
  currentUserId,
  isOwner,
  canManageMembers,
  canModerate,
  canAnnounce,
  onOpenRoleManagement,
  onOpenPinnedHub,
  onOpenModerationCenter,
  onOpenAnalytics,
  onOpenSettings,
  onOpenKnockRequests,
  onOpenStudyPermissions,
  onOpenMonitoringCenter,
  onRoomUpdated,
}: RoomAdminHubProps) {
  const { colors, isDark } = useTheme();
  const { t } = useI18n();
  const qc = useQueryClient();

  // Local state for interactive switches
  const [knockMode, setKnockMode] = useState<boolean>(room.knock_mode_enabled !== false);
  const [isPrivate, setIsPrivate] = useState<boolean>(room.visibility !== "public");

  // Modals state
  const [broadcastModalOpen, setBroadcastModalOpen] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [isUrgent, setIsUrgent] = useState(true);

  // Invite state
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  // 1. KNOCK / LOBBY MODE TOGGLE
  const toggleKnockMutation = useMutation({
    mutationFn: (enableKnock: boolean) =>
      api<{ success: boolean; knockModeEnabled: boolean }>(`/rooms/${room.id}/knock/toggle-open`, {
        method: "POST",
        body: JSON.stringify({ openForEveryone: !enableKnock }),
      }),
    onMutate: (enableKnock) => {
      setKnockMode(enableKnock);
      triggerHaptic();
    },
    onSuccess: (data) => {
      setKnockMode(data.knockModeEnabled);
      onRoomUpdated?.({ knock_mode_enabled: data.knockModeEnabled });
      qc.invalidateQueries({ queryKey: ["room", room.id] });
      Alert.alert(
        data.knockModeEnabled ? "Knock Mode Activated" : "Open Access Enabled",
        data.knockModeEnabled
          ? "New visitors must now knock and be admitted by an admin or teacher."
          : "Anyone can now join this room immediately without waiting in the lobby.",
      );
    },
    onError: (err: Error) => {
      setKnockMode(!knockMode);
      Alert.alert("Failed to toggle knock mode", err.message);
    },
  });

  // 2. ROOM PRIVACY TOGGLE
  const togglePrivacyMutation = useMutation({
    mutationFn: (makePrivate: boolean) =>
      api<{ success: boolean }>(`/rooms/${room.id}/settings`, {
        method: "PATCH",
        body: JSON.stringify({ visibility: makePrivate ? "private" : "public" }),
      }),
    onMutate: (makePrivate) => {
      setIsPrivate(makePrivate);
      triggerHaptic();
    },
    onSuccess: (_, makePrivate) => {
      onRoomUpdated?.({ visibility: makePrivate ? "private" : "public" });
      qc.invalidateQueries({ queryKey: ["room", room.id] });
      Alert.alert(
        makePrivate ? "Room Set to Private" : "Room Set to Public",
        makePrivate
          ? "This room is now unlisted and requires an invite link or approval to enter."
          : "This room is now publicly discoverable in the Campus Directory.",
      );
    },
    onError: (err: Error) => {
      setIsPrivate(!isPrivate);
      Alert.alert("Failed to update privacy", err.message);
    },
  });

  // 3. GENERATE & COPY INVITE LINK
  const generateInviteMutation = useMutation({
    mutationFn: () =>
      api<{ invite: { id: string; code?: string } }>(`/rooms/${room.id}/generate-invite`, {
        method: "POST",
      }),
    onSuccess: async (data) => {
      triggerHaptic();
      const code = data.invite?.code || data.invite?.id;
      const link = `https://skillbridge.app/room/${room.id}?invite=${code}`;
      setInviteUrl(link);
      await copyToClipboard(link, `Room Invite Link for ${room.title}`);
      Alert.alert(
        "Invite Link Ready! 🔗",
        `Invite link copied to clipboard:\n\n${link}\n\nYou can share this with classmates to give them instant access.`,
        [
          { text: "Done", style: "cancel" },
          {
            text: "Share Link",
            onPress: () => {
              Share.share({
                title: `Join ${room.title} on SkillBridge`,
                message: `Join our academic room "${room.title}" on SkillBridge: ${link}`,
              });
            },
          },
        ],
      );
    },
    onError: async (err: Error) => {
      // Fallback share link if generate-invite endpoint encounters permission fallback
      const fallbackLink = `https://skillbridge.app/room/${room.id}`;
      setInviteUrl(fallbackLink);
      await copyToClipboard(fallbackLink, `Room Link for ${room.title}`);
      Alert.alert("Room Link Copied", fallbackLink);
    },
  });

  // 4. EMERGENCY / PRIORITY BROADCAST POST
  const broadcastMutation = useMutation({
    mutationFn: (payload: { title: string; body: string; isUrgent: boolean }) =>
      api(`/rooms/${room.id}/posts`, {
        method: "POST",
        body: JSON.stringify({
          title: payload.title.trim(),
          body: payload.body.trim(),
          type: "announcement",
          metadata: { is_urgent: payload.isUrgent, priority: payload.isUrgent ? "urgent" : "normal" },
        }),
      }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room-posts", room.id] });
      qc.invalidateQueries({ queryKey: ["room-pinned", room.id] });
      setBroadcastModalOpen(false);
      setBroadcastTitle("");
      setBroadcastBody("");
      Alert.alert(
        "Broadcast Published! 📢",
        "Your official announcement has been pinned to the top of the room feed and dispatched to members.",
      );
    },
    onError: (err: Error) => {
      Alert.alert("Could not publish announcement", err.message);
    },
  });

  // 5. KNOCK REQUESTS QUERY
  const { data: knockData } = useQuery<{ requests?: any[]; pendingKnocksCount?: number }>({
    queryKey: ["room-knock-requests", room.id],
    queryFn: () => api<{ requests: any[]; pendingKnocksCount?: number }>(`/rooms/${room.id}/knock/requests`),
    enabled: Boolean(canModerate),
    refetchInterval: 15_000,
  });
  const pendingKnocks = knockData?.requests?.filter((r) => r.status === "pending") ?? [];

  // Admit individual knocked student
  const admitKnockMutation = useMutation({
    mutationFn: (requestId: string) =>
      api(`/rooms/${room.id}/knock/${requestId}/admit`, { method: "POST" }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room-knock-requests", room.id] });
      qc.invalidateQueries({ queryKey: ["room", room.id] });
    },
  });

  // Decline individual knocked student
  const declineKnockMutation = useMutation({
    mutationFn: (requestId: string) =>
      api(`/rooms/${room.id}/knock/${requestId}/decline`, { method: "POST" }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room-knock-requests", room.id] });
    },
  });

  // 6. EXPORT ATTENDANCE ROSTER
  const handleExportRoster = async () => {
    triggerHaptic();
    try {
      // Build clean CSV roster from room members and metadata
      const header = "Member ID,Full Name,Username,Role,Online Status\n";
      const rows = members
        .map(
          (m) =>
            `"${m.id}","${(m.full_name || "Unknown").replace(/"/g, '""')}","${m.username || ""}","${
              m.id === room.owner_id ? "Owner" : "Member"
            }","${(m as any).is_online ? "Online" : "Offline"}"`,
        )
        .join("\n");
      const csvContent = header + rows;
      await copyToClipboard(csvContent, `${room.title} - Roster Export`);

      Alert.alert(
        "Roster Exported! 📄",
        `Attendance roster for ${members.length} members compiled into CSV and copied to clipboard.`,
        [
          { text: "Done", style: "cancel" },
          {
            text: "Share CSV",
            onPress: () => {
              Share.share({
                title: `${room.title} Attendance Roster.csv`,
                message: csvContent,
              });
            },
          },
        ],
      );
    } catch (err: any) {
      Alert.alert("Export Error", err.message || "Failed to export roster");
    }
  };

  return (
    <View style={s.container}>
      {/* SECTION HEADER */}
      <Row style={s.sectionHeader}>
        <View style={[s.badgeIcon, { backgroundColor: "#F59E0B22" }]}>
          <MaterialCommunityIcons name="shield-crown" size={16} color="#F59E0B" />
        </View>
        <Text style={[s.sectionTitle, { color: colors.text }]}>ROOM ADMINISTRATION & CONTROLS</Text>
        <View style={[s.roleChip, { backgroundColor: "#F59E0B20" }]}>
          <Text style={[s.roleChipText, { color: "#F59E0B" }]}>ADMIN / OWNER</Text>
        </View>
      </Row>

      {/* QUICK SWITCHES PANEL */}
      <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[s.cardSubHeader, { color: colors.muted }]}>ACCESS & ADMISSION POLICIES</Text>

        {/* 1. Knock / Waiting Lobby Switch */}
        <Row style={s.switchRow}>
          <View style={{ flex: 1, gap: 2 }}>
            <Row style={{ alignItems: "center", gap: 6 }}>
              <MaterialCommunityIcons name="door-sliding-lock" size={18} color={knockMode ? colors.primary : colors.muted} />
              <Text style={[s.switchTitle, { color: colors.text }]}>
                {knockMode ? "Knock Approval (Lobby On)" : "Open Entry (Lobby Off)"}
              </Text>
            </Row>
            <Text style={[s.switchSub, { color: colors.muted }]}>
              {knockMode
                ? "Students must knock to enter; admins/teachers review admission."
                : "Any student can enter directly without approval."}
            </Text>
          </View>
          <Switch
            value={knockMode}
            onValueChange={(val) => toggleKnockMutation.mutate(val)}
            disabled={toggleKnockMutation.isPending}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#FFFFFF"
          />
        </Row>

        {/* 2. Public vs Private Switch (Room Owner Only) */}
        {isOwner && (
          <>
            <View style={[s.divider, { backgroundColor: colors.divider }]} />
            <Row style={s.switchRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <Row style={{ alignItems: "center", gap: 6 }}>
                  <MaterialCommunityIcons name={isPrivate ? "lock-outline" : "earth"} size={18} color={isPrivate ? colors.warning : colors.success} />
                  <Text style={[s.switchTitle, { color: colors.text }]}>
                    {isPrivate ? "Private Room (Invite-Only)" : "Public Discovery Room"}
                  </Text>
                </Row>
                <Text style={[s.switchSub, { color: colors.muted }]}>
                  {isPrivate
                    ? "Hidden from public campus directory; accessible only via invite link."
                    : "Listed publicly for university students to find and join."}
                </Text>
              </View>
              <Switch
                value={isPrivate}
                onValueChange={(val) => togglePrivacyMutation.mutate(val)}
                disabled={togglePrivacyMutation.isPending}
                trackColor={{ false: colors.border, true: colors.warning }}
                thumbColor="#FFFFFF"
              />
            </Row>
          </>
        )}
      </View>

      {/* QUICK ADMIN ACTIONS GRID */}
      <View style={s.actionsGrid}>
        {/* Action 0: Roles & Staff Management (Admins & Owners with member management rights) */}
        {Boolean(onOpenRoleManagement && (isOwner || canManageMembers)) && (
          <Pressable
            onPress={() => {
              triggerHaptic();
              onOpenRoleManagement?.();
            }}
            style={({ pressed }) => [
              s.actionTile,
              { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <View style={[s.tileIconBox, { backgroundColor: "#F59E0B22" }]}>
              <MaterialCommunityIcons name="badge-account-horizontal" size={20} color="#F59E0B" />
            </View>
            <Text style={[s.tileTitle, { color: colors.text }]}>Roles & Staff</Text>
            <Text style={[s.tileSub, { color: colors.muted }]}>Hierarchy, permissions & staff</Text>
          </Pressable>
        )}

        {/* Action 1: Invite Passcode & Link */}
        <Pressable
          onPress={() => generateInviteMutation.mutate()}
          disabled={generateInviteMutation.isPending}
          style={({ pressed }) => [
            s.actionTile,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <View style={[s.tileIconBox, { backgroundColor: `${colors.primary}1A` }]}>
            {generateInviteMutation.isPending ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <MaterialCommunityIcons name="link-variant" size={20} color={colors.primary} />
            )}
          </View>
          <Text style={[s.tileTitle, { color: colors.text }]}>Invite Link</Text>
          <Text style={[s.tileSub, { color: colors.muted }]}>Generate & copy shareable pass</Text>
        </Pressable>

        {/* Action 2: Emergency Broadcast (Owners & Leaders with announcement rights) */}
        {Boolean(canAnnounce || isOwner) && (
          <Pressable
            onPress={() => {
              triggerHaptic();
              setBroadcastModalOpen(true);
            }}
            style={({ pressed }) => [
              s.actionTile,
              { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <View style={[s.tileIconBox, { backgroundColor: "#EF444422" }]}>
              <MaterialCommunityIcons name="bullhorn-outline" size={20} color="#EF4444" />
            </View>
            <Text style={[s.tileTitle, { color: colors.text }]}>Broadcast</Text>
            <Text style={[s.tileSub, { color: colors.muted }]}>Pin urgent alert to room feed</Text>
          </Pressable>
        )}

        {/* Action 3: Export Attendance */}
        <Pressable
          onPress={handleExportRoster}
          style={({ pressed }) => [
            s.actionTile,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <View style={[s.tileIconBox, { backgroundColor: "#10B98122" }]}>
            <MaterialCommunityIcons name="file-delimited-outline" size={20} color="#10B981" />
          </View>
          <Text style={[s.tileTitle, { color: colors.text }]}>Export Roster</Text>
          <Text style={[s.tileSub, { color: colors.muted }]}>Download CSV attendance record</Text>
        </Pressable>

        {/* Action 4: Room Settings & Modules (Owners & Member Admins only) */}
        {Boolean(onOpenSettings && (isOwner || canManageMembers)) && (
          <Pressable
            onPress={() => {
              triggerHaptic();
              onOpenSettings?.();
            }}
            style={({ pressed }) => [
              s.actionTile,
              { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <View style={[s.tileIconBox, { backgroundColor: "#6366F122" }]}>
              <MaterialCommunityIcons name="cog-outline" size={20} color="#6366F1" />
            </View>
            <Text style={[s.tileTitle, { color: colors.text }]}>Settings</Text>
            <Text style={[s.tileSub, { color: colors.muted }]}>Modules, landing tab & rules</Text>
          </Pressable>
        )}
      </View>

      {/* PENDING KNOCK REQUESTS ALERT (if any exist and user can moderate) */}
      {Boolean((canModerate || isOwner) && pendingKnocks.length > 0) && (
        <View style={[s.card, { backgroundColor: `${colors.primary}0D`, borderColor: colors.primary }]}>
          <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
            <Row style={{ alignItems: "center", gap: 8 }}>
              <MaterialCommunityIcons name="account-clock" size={20} color={colors.primary} />
              <Text style={[s.switchTitle, { color: colors.text }]}>
                {pendingKnocks.length} Student{pendingKnocks.length > 1 ? "s" : ""} Waiting in Lobby
              </Text>
            </Row>
            {onOpenKnockRequests && (
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  onOpenKnockRequests();
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "800", color: colors.primary }}>Manage All</Text>
              </Pressable>
            )}
          </Row>

          <View style={{ gap: 8, marginTop: 4 }}>
            {pendingKnocks.slice(0, 3).map((kr: any) => (
              <Row key={kr.id} style={s.knockItemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.knockName, { color: colors.text }]}>
                    {kr.profile?.full_name || kr.user_name || "Applicant"}
                  </Text>
                  <Text style={[s.knockSub, { color: colors.muted }]}>
                    {kr.message || "Requested to join room"}
                  </Text>
                </View>
                <Row style={{ gap: 6 }}>
                  <Pressable
                    onPress={() => admitKnockMutation.mutate(kr.id)}
                    disabled={admitKnockMutation.isPending}
                    style={[s.miniBtn, { backgroundColor: colors.primary }]}
                  >
                    <Text style={s.miniBtnText}>Admit</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => declineKnockMutation.mutate(kr.id)}
                    disabled={declineKnockMutation.isPending}
                    style={[s.miniBtn, { backgroundColor: colors.surface2 }]}
                  >
                    <Text style={[s.miniBtnText, { color: colors.muted }]}>Pass</Text>
                  </Pressable>
                </Row>
              </Row>
            ))}
          </View>
        </View>
      )}

      {/* MODERATION & SAFETY BUTTONS ROW */}
      <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border, padding: 8 }]}>
        {Boolean(onOpenRoleManagement && (isOwner || canManageMembers)) && (
          <Pressable
            onPress={() => {
              triggerHaptic();
              onOpenRoleManagement?.();
            }}
            style={[s.listActionRow, { borderBottomWidth: 1, borderBottomColor: colors.divider }]}
          >
            <View style={[s.tileIconBox, { backgroundColor: "#F59E0B1A", width: 34, height: 34 }]}>
              <MaterialCommunityIcons name="shield-account" size={18} color="#F59E0B" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.listActionTitle, { color: colors.text }]}>Role Hierarchy & Staff Center</Text>
              <Text style={[s.listActionSub, { color: colors.muted }]}>Promote teachers, assign moderators & ownership</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} />
          </Pressable>
        )}

        {Boolean(onOpenModerationCenter && (canModerate || isOwner)) && (
          <Pressable
            onPress={() => {
              triggerHaptic();
              onOpenModerationCenter?.();
            }}
            style={[s.listActionRow, { borderBottomWidth: 1, borderBottomColor: colors.divider }]}
          >
            <View style={[s.tileIconBox, { backgroundColor: "#EF44441A", width: 34, height: 34 }]}>
              <MaterialCommunityIcons name="shield-account-outline" size={18} color={colors.danger} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.listActionTitle, { color: colors.text }]}>Moderation & Safety Center</Text>
              <Text style={[s.listActionSub, { color: colors.muted }]}>Reports queue, warnings & ban audit logs</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} />
          </Pressable>
        )}

        {onOpenAnalytics && (
          <Pressable
            onPress={() => {
              triggerHaptic();
              onOpenAnalytics();
            }}
            style={s.listActionRow}
          >
            <View style={[s.tileIconBox, { backgroundColor: `${colors.primary}1A`, width: 34, height: 34 }]}>
              <MaterialCommunityIcons name="chart-box-outline" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.listActionTitle, { color: colors.text }]}>Room Insights & Health</Text>
              <Text style={[s.listActionSub, { color: colors.muted }]}>Activity metrics, top contributors & retention</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} />
          </Pressable>
        )}
      </View>

      {/* EMERGENCY BROADCAST MODAL */}
      <Modal
        visible={broadcastModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setBroadcastModalOpen(false)}
      >
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
              <Row style={{ alignItems: "center", gap: 8 }}>
                <MaterialCommunityIcons name="bullhorn" size={22} color="#EF4444" />
                <Text style={[s.modalTitle, { color: colors.text }]}>Priority Broadcast</Text>
              </Row>
              <Pressable
                onPress={() => setBroadcastModalOpen(false)}
                hitSlop={8}
                style={[s.closeModalBtn, { backgroundColor: colors.surface2 }]}
              >
                <MaterialCommunityIcons name="close" size={18} color={colors.text} />
              </Pressable>
            </Row>

            <Text style={[s.modalSub, { color: colors.muted }]}>
              Post an official announcement pinned to the top of {room.title}. All room members will receive this alert.
            </Text>

            <TextInput
              value={broadcastTitle}
              onChangeText={setBroadcastTitle}
              placeholder="Announcement Headline (e.g. Midterm Review Today)"
              placeholderTextColor={colors.muted}
              style={[s.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            />

            <TextInput
              value={broadcastBody}
              onChangeText={setBroadcastBody}
              placeholder="Announcement details, syllabus changes, room links..."
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={4}
              style={[
                s.input,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  color: colors.text,
                  minHeight: 88,
                  textAlignVertical: "top",
                },
              ]}
            />

            <Row style={{ justifyContent: "space-between", alignItems: "center", paddingVertical: 4 }}>
              <Row style={{ alignItems: "center", gap: 6 }}>
                <MaterialCommunityIcons name="pin" size={18} color="#EF4444" />
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>Pin to top with Urgent Badge</Text>
              </Row>
              <Switch
                value={isUrgent}
                onValueChange={setIsUrgent}
                trackColor={{ false: colors.border, true: "#EF4444" }}
                thumbColor="#FFFFFF"
              />
            </Row>

            <Row style={{ gap: 10, marginTop: 10 }}>
              <Pressable
                onPress={() => setBroadcastModalOpen(false)}
                style={[s.btn, { backgroundColor: colors.surface2, flex: 1 }]}
              >
                <Text style={[s.btnText, { color: colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (!broadcastTitle.trim() || !broadcastBody.trim()) {
                    Alert.alert("Missing details", "Please enter both a title and message body.");
                    return;
                  }
                  broadcastMutation.mutate({
                    title: broadcastTitle,
                    body: broadcastBody,
                    isUrgent,
                  });
                }}
                disabled={broadcastMutation.isPending}
                style={[s.btn, { backgroundColor: "#EF4444", flex: 2 }]}
              >
                {broadcastMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={[s.btnText, { color: "#FFFFFF", fontWeight: "800" }]}>Publish Broadcast</Text>
                )}
              </Pressable>
            </Row>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    gap: 12,
  },
  sectionHeader: {
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 2,
  },
  badgeIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.5,
    flex: 1,
  },
  roleChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  roleChipText: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  card: {
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 10,
  },
  cardSubHeader: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  switchRow: {
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  switchTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  switchSub: {
    fontSize: 11,
    lineHeight: 15,
  },
  divider: {
    height: 1,
    marginVertical: 4,
  },
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  actionTile: {
    flexBasis: "48%",
    flexGrow: 1,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 6,
  },
  tileIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  tileTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  tileSub: {
    fontSize: 11,
    lineHeight: 15,
  },
  knockItemRow: {
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    backgroundColor: "rgba(0,0,0,0.02)",
  },
  knockName: {
    fontSize: 12,
    fontWeight: "700",
  },
  knockSub: {
    fontSize: 10,
  },
  miniBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  miniBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  listActionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 6,
    gap: 12,
  },
  listActionTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  listActionSub: {
    fontSize: 11,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    maxWidth: 480,
    padding: 20,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 12,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  modalSub: {
    fontSize: 12,
    lineHeight: 17,
  },
  closeModalBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    fontSize: 13,
  },
  btn: {
    paddingVertical: 11,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: {
    fontSize: 13,
  },
});
