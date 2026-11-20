import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { Row, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import { RoomChatTab } from "../RoomChatTab";
import { RoomChannelSwitcher } from "./RoomChannelSwitcher";
import type { RoomChannel } from "@/types";

type RoomChatViewProps = {
  roomId: string;
  conversationId?: string | null;
  roomTitle: string;
  memberCount: number;
  isMember?: boolean;
  canManageChannels?: boolean;
  isEducator?: boolean;
  onOpenSearch?: () => void;
  onJoinVoice?: () => void;
};

export function RoomChatView({
  roomId,
  conversationId,
  roomTitle,
  memberCount,
  isMember,
  canManageChannels,
  isEducator,
  onOpenSearch,
  onJoinVoice,
}: RoomChatViewProps) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [currentChannel, setCurrentChannel] = useState<RoomChannel | null>(null);
  const [showChannelSwitcher, setShowChannelSwitcher] = useState(false);
  const socket = getSocket();

  // Load channels immediately
  const { data: channelsData } = useQuery<{ channels: RoomChannel[] }>({
    queryKey: ["room-channels", roomId],
    queryFn: () => api<{ channels: RoomChannel[] }>(`/rooms/${roomId}/channels`),
    staleTime: 30_000,
  });

  const channels = channelsData?.channels ?? [];

  // Auto-select default channel or fallback if none is selected
  useEffect(() => {
    if (channels.length > 0) {
      if (!currentChannel || !channels.some((c) => c.id === currentChannel.id)) {
        const def = channels.find((c) => c.is_default) || channels[0];
        setCurrentChannel(def);
      }
    }
  }, [channels, currentChannel]);

  // Real-time channel list synchronization
  useEffect(() => {
    if (!socket || !roomId) return;

    const onChannelCreated = (createdChannel: RoomChannel) => {
      qc.invalidateQueries({ queryKey: ["room-channels", roomId] });
    };

    const onChannelDeleted = (payload: { channelId: string }) => {
      qc.invalidateQueries({ queryKey: ["room-channels", roomId] });
      if (currentChannel && currentChannel.id === payload.channelId) {
        setCurrentChannel(null);
      }
    };

    socket.on("room:channel:created", onChannelCreated);
    socket.on("room:channel:deleted", onChannelDeleted);

    return () => {
      socket.off("room:channel:created", onChannelCreated);
      socket.off("room:channel:deleted", onChannelDeleted);
    };
  }, [socket, roomId, currentChannel, qc]);

  const activeConvId = currentChannel?.conversation_id || conversationId;
  const channelName = currentChannel?.name || "general";
  const channelIcon = currentChannel?.is_private
    ? "lock"
    : currentChannel?.type === "announcement"
    ? "bullhorn"
    : currentChannel?.type === "voice"
    ? "volume-high"
    : "pound";

  return (
    <View style={s.container}>
      {/* Compact Channel Header with Switcher Trigger */}
      <Row style={[s.chatHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => {
            triggerHaptic();
            setShowChannelSwitcher(true);
          }}
          style={s.channelTrigger}
        >
          <MaterialCommunityIcons
            name={channelIcon}
            size={18}
            color={currentChannel?.is_private ? colors.danger : colors.primary}
          />
          <Text style={[s.channelName, { color: colors.text }]}>{channelName}</Text>
          <MaterialCommunityIcons name="chevron-down" size={16} color={colors.muted} />

          {currentChannel?.is_private ? (
            <View style={[s.privacyPill, { backgroundColor: colors.danger + "20" }]}>
              <MaterialCommunityIcons name="lock" size={10} color={colors.danger} />
              <Text style={[s.privacyPillText, { color: colors.danger }]}>STAFF ONLY</Text>
            </View>
          ) : currentChannel?.type === "announcement" ? (
            <View style={[s.privacyPill, { backgroundColor: colors.primary + "20" }]}>
              <Text style={[s.privacyPillText, { color: colors.primary }]}>ANNOUNCEMENTS</Text>
            </View>
          ) : (
            <View style={[s.privacyPill, { backgroundColor: colors.surface2 }]}>
              <Text style={[s.privacyPillText, { color: colors.muted }]}>COMMON</Text>
            </View>
          )}
        </Pressable>

        <Row style={{ alignItems: "center", gap: 8 }}>
          {canManageChannels && (
            <Pressable
              onPress={() => {
                triggerHaptic();
                setShowChannelSwitcher(true);
              }}
              style={[s.addChannelShortcut, { borderColor: colors.border }]}
            >
              <MaterialCommunityIcons name="plus" size={14} color={colors.primary} />
              <Text style={[s.addChannelText, { color: colors.primary }]}>Channel</Text>
            </Pressable>
          )}

          {onOpenSearch && (
            <Pressable
              onPress={() => {
                triggerHaptic();
                onOpenSearch();
              }}
              style={s.iconBtn}
            >
              <MaterialCommunityIcons name="magnify" size={20} color={colors.muted} />
            </Pressable>
          )}
        </Row>
      </Row>

      {/* Inline Real-Time Chat Engine */}
      <View style={{ flex: 1 }}>
        <RoomChatTab
          {...({
            key: activeConvId || "default",
            conversationId: activeConvId,
            isMember: Boolean(isMember),
            channel: currentChannel,
            isEducator: Boolean(isEducator || canManageChannels),
          } as any)}
        />
      </View>

      {/* Channel Switcher Bottom Sheet */}
      <RoomChannelSwitcher
        roomId={roomId}
        visible={showChannelSwitcher}
        selectedChannelId={currentChannel?.id}
        canManageChannels={canManageChannels}
        onClose={() => setShowChannelSwitcher(false)}
        onSelectChannel={(ch) => setCurrentChannel(ch)}
        onJoinVoice={onJoinVoice}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  chatHeader: {
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  channelTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: radius.sm,
  },
  channelName: {
    fontSize: 15,
    fontWeight: "800",
  },
  privacyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
    marginLeft: 4,
  },
  privacyPillText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  addChannelShortcut: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  addChannelText: {
    fontSize: 11,
    fontWeight: "700",
  },
  iconBtn: {
    padding: 6,
    borderRadius: radius.pill,
  },
});
