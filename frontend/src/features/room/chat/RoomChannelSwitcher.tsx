import React, { useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Row, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import type { ChannelType, RoomChannel } from "@/types";

type RoomChannelSwitcherProps = {
  roomId: string;
  visible: boolean;
  selectedChannelId?: string;
  canManageChannels?: boolean;
  onClose: () => void;
  onSelectChannel: (channel: RoomChannel) => void;
  onJoinVoice?: () => void;
};

type ChannelCategoryOption = {
  key: string;
  type: ChannelType;
  isPrivate: boolean;
  label: string;
  sublabel: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
};

const CHANNEL_OPTIONS: ChannelCategoryOption[] = [
  {
    key: "common",
    type: "text",
    isPrivate: false,
    label: "Common Chat",
    sublabel: "Seen & postable by everyone in this room",
    icon: "forum-outline",
  },
  {
    key: "private",
    type: "text",
    isPrivate: true,
    label: "Private Chat",
    sublabel: "Private for Teachers & Admins only",
    icon: "lock-outline",
  },
  {
    key: "announcement",
    type: "announcement",
    isPrivate: false,
    label: "Announcements",
    sublabel: "Only teachers & admins can post",
    icon: "bullhorn",
  },
  {
    key: "question",
    type: "question",
    isPrivate: false,
    label: "Q&A Channel",
    sublabel: "Dedicated questions & answers",
    icon: "help-circle-outline",
  },
  {
    key: "resource",
    type: "resource",
    isPrivate: false,
    label: "Resources",
    sublabel: "Course files, links & study notes",
    icon: "file-document-outline",
  },
];

export function RoomChannelSwitcher({
  roomId,
  visible,
  selectedChannelId,
  canManageChannels,
  onClose,
  onSelectChannel,
  onJoinVoice,
}: RoomChannelSwitcherProps) {
  const { colors, isDark } = useTheme();
  const qc = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [selectedOptionKey, setSelectedOptionKey] = useState<string>("common");
  const [isPrivate, setIsPrivate] = useState(false);
  const [channelDescription, setChannelDescription] = useState("");

  const { data } = useQuery<{ channels: RoomChannel[] }>({
    queryKey: ["room-channels", roomId],
    queryFn: () => api<{ channels: RoomChannel[] }>(`/rooms/${roomId}/channels`),
    enabled: visible,
  });

  const selectedCategory =
    CHANNEL_OPTIONS.find((o) => o.key === selectedOptionKey) || CHANNEL_OPTIONS[0];

  const createMutation = useMutation({
    mutationFn: () =>
      api<{ channel: RoomChannel }>(`/rooms/${roomId}/channels`, {
        method: "POST",
        body: JSON.stringify({
          name: channelName.trim(),
          type: selectedCategory.type,
          description: channelDescription.trim(),
          is_private: isPrivate || selectedCategory.isPrivate,
          allowed_roles:
            isPrivate || selectedCategory.isPrivate
              ? ["owner", "teacher", "moderator", "admin"]
              : undefined,
        }),
      }),
    onSuccess: (res) => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room-channels", roomId] });
      setShowCreateModal(false);
      setChannelName("");
      setChannelDescription("");
      setIsPrivate(false);
      setSelectedOptionKey("common");
      onSelectChannel(res.channel);
      onClose();
    },
    onError: (err: any) => {
      Alert.alert("Error", err.message || "Failed to create channel");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (channelId: string) =>
      api(`/rooms/${roomId}/channels/${channelId}`, { method: "DELETE" }),
    onSuccess: (_, deletedId) => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room-channels", roomId] });
      if (selectedChannelId === deletedId) {
        const remaining = (data?.channels ?? []).filter((c) => c.id !== deletedId);
        const fallback = remaining.find((c) => c.is_default) || remaining[0];
        if (fallback) onSelectChannel(fallback);
      }
    },
    onError: (err: any) => {
      Alert.alert("Error", err.message || "Failed to delete channel");
    },
  });

  function handleDeleteChannel(channel: RoomChannel) {
    if (channel.is_default) {
      Alert.alert("Cannot Delete", "The default general channel cannot be deleted.");
      return;
    }
    Alert.alert(
      "Delete Channel",
      `Are you sure you want to delete #${channel.name}? All message history in this channel will be removed.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMutation.mutate(channel.id),
        },
      ]
    );
  }

  const getChannelIcon = (ch: RoomChannel): keyof typeof MaterialCommunityIcons.glyphMap => {
    if (ch.is_private) return "lock";
    switch (ch.type) {
      case "announcement":
        return "bullhorn";
      case "question":
        return "help-circle-outline";
      case "resource":
        return "file-document-outline";
      case "media":
        return "play-box-outline";
      case "voice":
        return "volume-high";
      default:
        return "pound";
    }
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <Pressable style={s.backdrop} onPress={onClose}>
          <Pressable
            style={[s.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={[s.handle, { backgroundColor: colors.muted }]} />
            <Row style={s.headerRow}>
              <View>
                <Text style={[s.title, { color: colors.text }]}>ROOM CHANNELS</Text>
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                  Switch between common chat and private channels
                </Text>
              </View>
              {canManageChannels && (
                <Pressable
                  onPress={() => {
                    triggerHaptic();
                    setShowCreateModal(true);
                  }}
                  style={[s.newChannelBtn, { backgroundColor: colors.primary }]}
                >
                  <MaterialCommunityIcons name="plus" size={16} color={colors.white} />
                  <Text style={[s.newChannelText, { color: colors.white }]}>Create Channel</Text>
                </Pressable>
              )}
            </Row>

            <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
              {(data?.channels ?? []).map((ch) => {
                const isSelected = selectedChannelId ? ch.id === selectedChannelId : ch.is_default;
                const iconName = getChannelIcon(ch);

                return (
                  <View
                    key={ch.id}
                    style={[
                      s.channelItem,
                      {
                        backgroundColor: isSelected ? colors.primary + "14" : "transparent",
                        borderColor: isSelected ? colors.primary + "40" : colors.border + "40",
                      },
                    ]}
                  >
                    <Pressable
                      style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}
                      onPress={() => {
                        triggerHaptic();
                        if (ch.type === "voice" && onJoinVoice) {
                          onJoinVoice();
                          onClose();
                        } else {
                          onSelectChannel(ch);
                          onClose();
                        }
                      }}
                    >
                      <View
                        style={[
                          s.channelIconContainer,
                          {
                            backgroundColor: ch.is_private
                              ? colors.danger + "18"
                              : isSelected
                              ? colors.primary + "20"
                              : colors.surface2,
                          },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={iconName}
                          size={18}
                          color={
                            ch.is_private
                              ? colors.danger
                              : isSelected
                              ? colors.primary
                              : colors.muted
                          }
                        />
                      </View>

                      <View style={{ flex: 1 }}>
                        <Row style={{ alignItems: "center", gap: 6 }}>
                          <Text
                            style={[
                              s.channelName,
                              {
                                color: isSelected ? colors.primary : colors.text,
                                fontWeight: isSelected ? "800" : "600",
                              },
                            ]}
                          >
                            {ch.name}
                          </Text>

                          {ch.is_private ? (
                            <View style={[s.badge, { backgroundColor: colors.danger + "20" }]}>
                              <MaterialCommunityIcons name="lock" size={10} color={colors.danger} />
                              <Text style={[s.badgeText, { color: colors.danger }]}>
                                STAFF PRIVATE
                              </Text>
                            </View>
                          ) : ch.type === "announcement" ? (
                            <View style={[s.badge, { backgroundColor: colors.primary + "20" }]}>
                              <Text style={[s.badgeText, { color: colors.primary }]}>
                                ANNOUNCEMENTS
                              </Text>
                            </View>
                          ) : ch.type === "voice" ? (
                            <View style={[s.badge, { backgroundColor: colors.success + "20" }]}>
                              <Text style={[s.badgeText, { color: colors.success }]}>VOICE</Text>
                            </View>
                          ) : ch.is_default ? (
                            <View style={[s.badge, { backgroundColor: colors.muted + "20" }]}>
                              <Text style={[s.badgeText, { color: colors.muted }]}>COMMON</Text>
                            </View>
                          ) : null}
                        </Row>

                        {Boolean(ch.description) && (
                          <Text style={[s.channelDesc, { color: colors.muted }]} numberOfLines={1}>
                            {ch.description}
                          </Text>
                        )}
                      </View>
                    </Pressable>

                    {/* Delete Action for authorized managers on non-default channels */}
                    {canManageChannels && !ch.is_default && (
                      <Pressable
                        onPress={() => handleDeleteChannel(ch)}
                        style={s.deleteBtn}
                        hitSlop={8}
                        accessibilityLabel={`Delete #${ch.name}`}
                      >
                        <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.danger} />
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Create Channel Modal */}
      <Modal
        visible={showCreateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <Pressable style={s.backdrop} onPress={() => setShowCreateModal(false)}>
          <Pressable
            style={[s.createCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[s.createTitle, { color: colors.text }]}>Create Channel</Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 14 }}>
              Add a common chat channel for all members or a private channel restricted to room staff.
            </Text>

            <Text style={[s.inputLabel, { color: colors.muted }]}>CHANNEL TYPE & PRIVACY</Text>
            <View style={{ gap: 8, marginVertical: 6 }}>
              {CHANNEL_OPTIONS.map((opt) => {
                const isChosen = selectedOptionKey === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => {
                      triggerHaptic();
                      setSelectedOptionKey(opt.key);
                      setIsPrivate(opt.isPrivate);
                    }}
                    style={[
                      s.optionCard,
                      {
                        backgroundColor: isChosen
                          ? isDark
                            ? colors.surface2
                            : colors.primarySoft
                          : colors.background,
                        borderColor: isChosen ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <View
                      style={[
                        s.optionIcon,
                        {
                          backgroundColor: opt.isPrivate
                            ? colors.danger + "20"
                            : isChosen
                            ? colors.primary + "20"
                            : colors.surface,
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={opt.icon}
                        size={18}
                        color={
                          opt.isPrivate
                            ? colors.danger
                            : isChosen
                            ? colors.primary
                            : colors.text
                        }
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          s.optionLabel,
                          {
                            color: isChosen ? colors.primary : colors.text,
                            fontWeight: isChosen ? "700" : "600",
                          },
                        ]}
                      >
                        {opt.label}
                      </Text>
                      <Text style={[s.optionSublabel, { color: colors.muted }]}>
                        {opt.sublabel}
                      </Text>
                    </View>
                    {isChosen && (
                      <MaterialCommunityIcons
                        name="check-circle"
                        size={20}
                        color={colors.primary}
                      />
                    )}
                  </Pressable>
                );
              })}
            </View>

            <Text style={[s.inputLabel, { color: colors.muted }]}>CHANNEL NAME</Text>
            <TextInput
              style={[
                s.input,
                { backgroundColor: colors.background, color: colors.text, borderColor: colors.border },
              ]}
              placeholder="e.g. assignments, teachers-lounge, exams"
              placeholderTextColor={colors.muted}
              value={channelName}
              onChangeText={(txt) => setChannelName(txt.replace(/\s+/g, "-").toLowerCase())}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={[s.inputLabel, { color: colors.muted }]}>DESCRIPTION (OPTIONAL)</Text>
            <TextInput
              style={[
                s.input,
                { backgroundColor: colors.background, color: colors.text, borderColor: colors.border },
              ]}
              placeholder="What is this channel for?"
              placeholderTextColor={colors.muted}
              value={channelDescription}
              onChangeText={setChannelDescription}
            />

            <Row style={[s.privacyToggleRow, { borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Row style={{ alignItems: "center", gap: 6 }}>
                  <MaterialCommunityIcons
                    name={isPrivate ? "lock" : "lock-open-outline"}
                    size={16}
                    color={isPrivate ? colors.danger : colors.muted}
                  />
                  <Text style={[s.privacyToggleLabel, { color: colors.text }]}>
                    Private Channel
                  </Text>
                </Row>
                <Text style={[s.privacyToggleSub, { color: colors.muted }]}>
                  Only teachers and room administrators will be able to access and chat here.
                </Text>
              </View>
              <Switch
                value={isPrivate}
                onValueChange={(val) => {
                  triggerHaptic();
                  setIsPrivate(val);
                  if (val && selectedOptionKey === "common") {
                    setSelectedOptionKey("private");
                  } else if (!val && selectedOptionKey === "private") {
                    setSelectedOptionKey("common");
                  }
                }}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </Row>

            <Row style={{ justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
              <Button
                title="Cancel"
                variant="ghost"
                onPress={() => setShowCreateModal(false)}
              />
              <Button
                title="Create Channel"
                loading={createMutation.isPending}
                disabled={!channelName.trim()}
                onPress={() => createMutation.mutate()}
              />
            </Row>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    maxHeight: "80%",
    paddingHorizontal: 16,
    paddingBottom: 36,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 14,
  },
  headerRow: {
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  title: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  newChannelBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  newChannelText: {
    fontSize: 12,
    fontWeight: "700",
  },
  list: {
    gap: 8,
    paddingBottom: 16,
  },
  channelItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  channelIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  channelName: {
    fontSize: 15,
  },
  channelDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  deleteBtn: {
    padding: 6,
    marginLeft: 6,
  },
  createCard: {
    margin: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 18,
    alignSelf: "center",
    width: "92%",
    maxWidth: 440,
    maxHeight: "90%",
  },
  createTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    marginTop: 12,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
  },
  optionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  optionIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  optionLabel: {
    fontSize: 13,
  },
  optionSublabel: {
    fontSize: 11,
    marginTop: 1,
  },
  privacyToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: 12,
  },
  privacyToggleLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  privacyToggleSub: {
    fontSize: 11,
    marginTop: 2,
    paddingRight: 8,
  },
});
