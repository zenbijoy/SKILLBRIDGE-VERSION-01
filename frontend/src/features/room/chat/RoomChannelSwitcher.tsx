import React, { useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Card, Row, triggerHaptic } from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";
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

export function RoomChannelSwitcher({
  roomId,
  visible,
  selectedChannelId,
  canManageChannels,
  onClose,
  onSelectChannel,
  onJoinVoice,
}: RoomChannelSwitcherProps) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [channelType, setChannelType] = useState<ChannelType>("text");
  const [channelDescription, setChannelDescription] = useState("");

  const { data, isLoading } = useQuery<{ channels: RoomChannel[] }>({
    queryKey: ["room-channels", roomId],
    queryFn: () => api<{ channels: RoomChannel[] }>(`/rooms/${roomId}/channels`),
    enabled: visible,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api<{ channel: RoomChannel }>(`/rooms/${roomId}/channels`, {
        method: "POST",
        body: JSON.stringify({
          name: channelName.trim(),
          type: channelType,
          description: channelDescription.trim(),
        }),
      }),
    onSuccess: (res) => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room-channels", roomId] });
      setShowCreateModal(false);
      setChannelName("");
      setChannelDescription("");
      onSelectChannel(res.channel);
      onClose();
    },
    onError: (err: any) => {
      Alert.alert("Error", err.message || "Failed to create channel");
    },
  });

  const getChannelIcon = (type: ChannelType): keyof typeof MaterialCommunityIcons.glyphMap => {
    switch (type) {
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

  const channelTypes: { type: ChannelType; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
    { type: "text", label: "Text Chat", icon: "pound" },
    { type: "announcement", label: "Announcements", icon: "bullhorn" },
    { type: "voice", label: "Voice Room", icon: "volume-high" },
    { type: "question", label: "Q&A", icon: "help-circle-outline" },
    { type: "resource", label: "Resources", icon: "file-document-outline" },
  ];

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <Pressable style={s.backdrop} onPress={onClose}>
          <Pressable style={[s.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={(e) => e.stopPropagation()}>
            <View style={s.handle} />
            <Row style={s.headerRow}>
              <Text style={[s.title, { color: colors.text }]}>ROOM CHANNELS</Text>
              {canManageChannels && (
                <Pressable
                  onPress={() => {
                    triggerHaptic();
                    setShowCreateModal(true);
                  }}
                  style={[s.newChannelBtn, { backgroundColor: colors.primary }]}
                >
                  <MaterialCommunityIcons name="plus" size={16} color="#FFFFFF" />
                  <Text style={s.newChannelText}>Channel</Text>
                </Pressable>
              )}
            </Row>

            <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
              {(data?.channels ?? []).map((ch) => {
                const isSelected = selectedChannelId ? ch.id === selectedChannelId : ch.is_default;
                const iconName = getChannelIcon(ch.type);

                return (
                  <Pressable
                    key={ch.id}
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
                    style={[
                      s.channelItem,
                      {
                        backgroundColor: isSelected ? colors.primary + "14" : "transparent",
                        borderColor: isSelected ? colors.primary + "40" : "transparent",
                      },
                    ]}
                  >
                    <Row style={{ alignItems: "center", gap: 10, flex: 1 }}>
                      <MaterialCommunityIcons
                        name={iconName}
                        size={20}
                        color={isSelected ? colors.primary : colors.muted}
                      />
                      <View style={{ flex: 1 }}>
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
                        {Boolean(ch.description) && (
                          <Text style={[s.channelDesc, { color: colors.muted }]} numberOfLines={1}>
                            {ch.description}
                          </Text>
                        )}
                      </View>
                    </Row>

                    {ch.type === "voice" && (
                      <View style={[s.badge, { backgroundColor: colors.success + "20" }]}>
                        <Text style={[s.badgeText, { color: colors.success }]}>VOICE</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Create Channel Modal */}
      <Modal visible={showCreateModal} transparent animationType="fade" onRequestClose={() => setShowCreateModal(false)}>
        <Pressable style={s.backdrop} onPress={() => setShowCreateModal(false)}>
          <Pressable style={[s.createCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[s.createTitle, { color: colors.text }]}>Create New Channel</Text>

            <Text style={[s.inputLabel, { color: colors.muted }]}>CHANNEL NAME</Text>
            <TextInput
              style={[s.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
              placeholder="e.g. assignments, project-chat"
              placeholderTextColor={colors.muted}
              value={channelName}
              onChangeText={setChannelName}
            />

            <Text style={[s.inputLabel, { color: colors.muted }]}>CHANNEL TYPE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              {channelTypes.map((ct) => {
                const isTypeSelected = channelType === ct.type;
                return (
                  <Pressable
                    key={ct.type}
                    onPress={() => {
                      triggerHaptic();
                      setChannelType(ct.type);
                    }}
                    style={[
                      s.typePill,
                      {
                        backgroundColor: isTypeSelected ? colors.primary : colors.background,
                        borderColor: isTypeSelected ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons name={ct.icon} size={14} color={isTypeSelected ? "#FFF" : colors.text} />
                    <Text style={{ fontSize: 12, fontWeight: isTypeSelected ? "700" : "500", color: isTypeSelected ? "#FFF" : colors.text }}>
                      {ct.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={[s.inputLabel, { color: colors.muted }]}>DESCRIPTION (OPTIONAL)</Text>
            <TextInput
              style={[s.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
              placeholder="What is this channel for?"
              placeholderTextColor={colors.muted}
              value={channelDescription}
              onChangeText={setChannelDescription}
            />

            <Row style={{ justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
              <Button title="Cancel" variant="ghost" onPress={() => setShowCreateModal(false)} />
              <Button
                title="Create"
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
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    maxHeight: "75%",
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    alignSelf: "center",
    marginTop: 8,
    marginBottom: 12,
  },
  headerRow: {
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  newChannelBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  newChannelText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  list: {
    gap: 6,
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
  channelName: {
    fontSize: 15,
  },
  channelDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  createCard: {
    margin: 20,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 16,
    alignSelf: "center",
    width: "90%",
    maxWidth: 420,
  },
  createTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    marginTop: 10,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  typePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
