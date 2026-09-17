import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
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
  onOpenSearch,
  onJoinVoice,
}: RoomChatViewProps) {
  const { colors } = useTheme();
  const [currentChannel, setCurrentChannel] = useState<RoomChannel | null>(null);
  const [showChannelSwitcher, setShowChannelSwitcher] = useState(false);

  const activeConvId = currentChannel?.conversation_id || conversationId;
  const channelName = currentChannel?.name || "general";
  const channelIcon = currentChannel?.type === "announcement" ? "bullhorn" : "pound";

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
          <MaterialCommunityIcons name={channelIcon} size={18} color={colors.primary} />
          <Text style={[s.channelName, { color: colors.text }]}>{channelName}</Text>
          <MaterialCommunityIcons name="chevron-down" size={16} color={colors.muted} />
          <Text style={[s.channelMeta, { color: colors.muted }]}>· {memberCount}</Text>
        </Pressable>

        <Row style={{ alignItems: "center", gap: 8 }}>
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
        <RoomChatTab key={activeConvId || "default"} conversationId={activeConvId} isMember={Boolean(isMember)} />
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
  channelMeta: {
    fontSize: 12,
  },
  iconBtn: {
    padding: 6,
    borderRadius: radius.pill,
  },
});
