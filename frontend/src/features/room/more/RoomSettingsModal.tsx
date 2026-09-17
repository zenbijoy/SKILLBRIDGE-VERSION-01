import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import type { Room, RoomInvite } from "@/types";
import { Row, triggerHaptic } from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";

type RoomSettingsModalProps = {
  visible: boolean;
  room: Room;
  onClose: () => void;
  onRoomUpdated: (updatedRoom: Partial<Room>) => void;
};

const AVAILABLE_MODULES = [
  { key: "posts", label: "Posts & Discussions", icon: "post-outline", desc: "Facebook Group-style academic feed" },
  { key: "chat", label: "Chat & Channels", icon: "chat-outline", desc: "Real-time chat with multi-channel support" },
  { key: "learn", label: "Learn & Sessions", icon: "school-outline", desc: "Classroom schedules, study tracks & Q&A" },
  { key: "media", label: "Media & Playlists", icon: "video-outline", desc: "Lecture library, notes & video progress" },
  { key: "voice", label: "Voice Rooms", icon: "microphone-outline", desc: "Always-on audio study drop-in lounge" },
];

const LANDING_TABS: { key: "posts" | "chat" | "learn" | "media" | "more"; label: string }[] = [
  { key: "posts", label: "Posts Feed" },
  { key: "chat", label: "Main Chat" },
  { key: "learn", label: "Learn / Class" },
  { key: "media", label: "Media" },
  { key: "more", label: "Room Info" },
];

export function RoomSettingsModal({
  visible,
  room,
  onClose,
  onRoomUpdated,
}: RoomSettingsModalProps) {
  const { colors } = useTheme();

  // Settings state
  const [enabledModules, setEnabledModules] = useState<string[]>(
    room.enabled_modules || ["posts", "chat", "learn", "media", "voice"],
  );
  const [defaultLandingTab, setDefaultLandingTab] = useState<string>(
    room.default_landing_tab || "posts",
  );
  const [savingSettings, setSavingSettings] = useState(false);

  // Invites state
  const [invites, setInvites] = useState<RoomInvite[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);

  const fetchInvites = async () => {
    try {
      setLoadingInvites(true);
      const data = await api<RoomInvite[]>(`/rooms/${room.id}/invites`);
      setInvites(data);
    } catch (err) {
      console.warn("Error fetching room invites:", err);
    } finally {
      setLoadingInvites(false);
    }
  };

  useEffect(() => {
    if (visible) {
      setEnabledModules(room.enabled_modules || ["posts", "chat", "learn", "media", "voice"]);
      setDefaultLandingTab(room.default_landing_tab || "posts");
      fetchInvites();
    }
  }, [visible, room.id]);

  const toggleModule = (moduleKey: string) => {
    triggerHaptic();
    setEnabledModules((prev) => {
      if (prev.includes(moduleKey)) {
        if (prev.length <= 1) {
          Alert.alert("At least one module must remain active.");
          return prev;
        }
        return prev.filter((k) => k !== moduleKey);
      } else {
        return [...prev, moduleKey];
      }
    });
  };

  const handleSaveSettings = async () => {
    try {
      triggerHaptic();
      setSavingSettings(true);
      const data = await api<Partial<Room>>(`/rooms/${room.id}/settings`, {
        method: "PATCH",
        body: JSON.stringify({
          enabled_modules: enabledModules,
          default_landing_tab: defaultLandingTab,
        }),
      });
      onRoomUpdated(data);
      Alert.alert("Success", "Room settings have been updated.");
      onClose();
    } catch (err: any) {
      Alert.alert("Update Failed", err?.message || "Failed to update room settings");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCreateInvite = async () => {
    try {
      triggerHaptic();
      setCreatingInvite(true);
      const data = await api<RoomInvite>(`/rooms/${room.id}/invites`, {
        method: "POST",
        body: JSON.stringify({
          expires_in_days: 7,
        }),
      });
      setInvites((prev) => [data, ...prev]);
    } catch (err: any) {
      Alert.alert("Create Invite Failed", err?.message || "Failed to create invite");
    } finally {
      setCreatingInvite(false);
    }
  };

  const handleShareInvite = async (invite: RoomInvite) => {
    triggerHaptic();
    try {
      await Share.share({
        message: `Join our academic study room "${room.title}" on SkillBridge with code: ${invite.code}`,
      });
    } catch (err) {
      // Ignored
    }
  };

  const handleRevokeInvite = (inviteId: string) => {
    Alert.alert("Revoke Invite", "Are you sure you want to deactivate this invite code?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Revoke",
        style: "destructive",
        onPress: async () => {
          try {
            await api(`/rooms/${room.id}/invites/${inviteId}`, { method: "DELETE" });
            setInvites((prev) => prev.filter((i) => i.id !== inviteId));
          } catch (err: any) {
            Alert.alert("Error", err?.message || "Failed to revoke invite");
          }
        },
      },
    ]);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[s.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[s.header, { borderBottomColor: colors.divider }]}>
          <Row style={{ alignItems: "center", gap: 10, flex: 1 }}>
            <View style={[s.iconBox, { backgroundColor: colors.primarySoft }]}>
              <MaterialCommunityIcons name="cog-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.headerTitle, { color: colors.text }]} numberOfLines={1}>
                Room Management
              </Text>
              <Text style={[s.headerSub, { color: colors.muted }]} numberOfLines={1}>
                Modules, defaults & invite links
              </Text>
            </View>
          </Row>
          <Pressable
            onPress={() => {
              triggerHaptic();
              onClose();
            }}
            hitSlop={8}
            style={[s.closeBtn, { backgroundColor: colors.surface2 }]}
          >
            <MaterialCommunityIcons name="close" size={18} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {/* 1. ENABLED MODULES */}
          <Text style={[s.sectionTitle, { color: colors.muted }]}>ACTIVE FEATURES & MODULES</Text>
          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {AVAILABLE_MODULES.map((mod, idx) => {
              const isActive = enabledModules.includes(mod.key);
              return (
                <View
                  key={mod.key}
                  style={[
                    s.moduleRow,
                    idx > 0 && { borderTopWidth: 1, borderTopColor: colors.divider },
                  ]}
                >
                  <View style={[s.modIcon, { backgroundColor: colors.primarySoft }]}>
                    <MaterialCommunityIcons
                      name={mod.icon as any}
                      size={18}
                      color={colors.primary}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[s.modLabel, { color: colors.text }]}>{mod.label}</Text>
                    <Text style={[s.modDesc, { color: colors.muted }]}>{mod.desc}</Text>
                  </View>
                  <Switch
                    value={isActive}
                    onValueChange={() => toggleModule(mod.key)}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor={isActive ? "#fff" : colors.muted}
                  />
                </View>
              );
            })}
          </View>

          {/* 2. DEFAULT LANDING TAB */}
          <Text style={[s.sectionTitle, { color: colors.muted, marginTop: 18 }]}>
            DEFAULT ENTRY TAB
          </Text>
          <Text style={[s.helpText, { color: colors.muted }]}>
            Choose what members see immediately upon opening this Room.
          </Text>
          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border, padding: 6 }]}>
            {LANDING_TABS.map((tab, idx) => {
              const isSelected = defaultLandingTab === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => {
                    triggerHaptic();
                    setDefaultLandingTab(tab.key);
                  }}
                  style={[
                    s.tabRow,
                    { backgroundColor: isSelected ? colors.primarySoft : "transparent" },
                    idx > 0 && { borderTopWidth: 1, borderTopColor: colors.divider },
                  ]}
                >
                  <Text
                    style={[
                      s.tabText,
                      { color: isSelected ? colors.primary : colors.text, fontWeight: isSelected ? "800" : "500" },
                    ]}
                  >
                    {tab.label}
                  </Text>
                  {isSelected && (
                    <MaterialCommunityIcons name="check" size={18} color={colors.primary} />
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Save Settings Button */}
          <Pressable
            onPress={handleSaveSettings}
            disabled={savingSettings}
            style={[
              s.saveBtn,
              { backgroundColor: colors.primary, opacity: savingSettings ? 0.7 : 1 },
            ]}
          >
            {savingSettings ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={s.saveBtnText}>Save Room Configuration</Text>
            )}
          </Pressable>

          {/* 3. INVITE CODES */}
          <View style={{ marginTop: 22, marginBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={[s.sectionTitle, { color: colors.muted }]}>ROOM INVITE LINKS</Text>
            <Pressable
              onPress={handleCreateInvite}
              disabled={creatingInvite}
              style={[s.newInviteBtn, { backgroundColor: colors.primarySoft }]}
            >
              {creatingInvite ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Row style={{ alignItems: "center", gap: 4 }}>
                  <MaterialCommunityIcons name="plus" size={16} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>
                    Create Link
                  </Text>
                </Row>
              )}
            </Pressable>
          </View>

          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {loadingInvites ? (
              <View style={{ padding: 18, alignItems: "center" }}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : invites.length > 0 ? (
              invites.map((inv, idx) => (
                <View
                  key={inv.id}
                  style={[
                    s.inviteRow,
                    idx > 0 && { borderTopWidth: 1, borderTopColor: colors.divider },
                  ]}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Row style={{ alignItems: "center", gap: 8 }}>
                      <Text style={[s.inviteCode, { color: colors.primary }]}>{inv.code}</Text>
                      <View style={[s.usesBadge, { backgroundColor: colors.surface2 }]}>
                        <Text style={[s.usesText, { color: colors.muted }]}>
                          {inv.uses_count} {inv.uses_count === 1 ? "use" : "uses"}
                        </Text>
                      </View>
                    </Row>
                    <Text style={[s.inviteExpiry, { color: colors.muted }]}>
                      {inv.expires_at
                        ? `Expires: ${new Date(inv.expires_at).toLocaleDateString()}`
                        : "No expiry"}
                    </Text>
                  </View>

                  <Row style={{ alignItems: "center", gap: 6 }}>
                    <Pressable
                      onPress={() => handleShareInvite(inv)}
                      style={[s.iconAction, { backgroundColor: colors.primarySoft }]}
                    >
                      <MaterialCommunityIcons name="share-variant-outline" size={16} color={colors.primary} />
                    </Pressable>
                    <Pressable
                      onPress={() => handleRevokeInvite(inv.id)}
                      style={[s.iconAction, { backgroundColor: colors.surface2 }]}
                    >
                      <MaterialCommunityIcons name="trash-can-outline" size={16} color={colors.danger} />
                    </Pressable>
                  </Row>
                </View>
              ))
            ) : (
              <View style={{ padding: 18, alignItems: "center" }}>
                <Text style={{ color: colors.muted, fontSize: 13 }}>No active invite links</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  headerSub: {
    fontSize: 11,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    paddingHorizontal: 2,
  },
  helpText: {
    fontSize: 11,
    marginVertical: 4,
    paddingHorizontal: 2,
  },
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: "hidden",
    marginTop: 6,
  },
  moduleRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 12,
  },
  modIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  modLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  modDesc: {
    fontSize: 11,
  },
  tabRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
  },
  tabText: {
    fontSize: 13,
  },
  saveBtn: {
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },
  newInviteBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  inviteRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    gap: 10,
  },
  inviteCode: {
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1,
  },
  usesBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  usesText: {
    fontSize: 10,
    fontWeight: "700",
  },
  inviteExpiry: {
    fontSize: 10,
  },
  iconAction: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
});
