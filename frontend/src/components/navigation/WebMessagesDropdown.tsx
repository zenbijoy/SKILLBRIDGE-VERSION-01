import React from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Image,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useTheme, radius } from "@/theme";
import { triggerHaptic } from "@/components/ui";
import { ActiveDot } from "@/features/presence/ActiveDot";

interface ConversationItem {
  id: string;
  kind: "dm" | "group" | "room";
  title?: string | null;
  avatar_url?: string | null;
  peer_id?: string | null;
  is_online?: boolean;
  unread_count?: number;
  last_message?: {
    id: string;
    body: string;
    sender_id: string;
    created_at: string;
  } | null;
  updated_at: string;
}

interface WebMessagesDropdownProps {
  visible: boolean;
  onClose: () => void;
}

export function WebMessagesDropdown({ visible, onClose }: WebMessagesDropdownProps) {
  const { colors } = useTheme();

  const { data, isLoading } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api<{ conversations: ConversationItem[] }>("/chat/conversations"),
    staleTime: 10_000,
    enabled: visible,
  });

  if (!visible) return null;

  const conversations = data?.conversations || [];
  const unreadTotal = conversations.reduce((sum, item) => sum + (item.unread_count ?? 0), 0);

  const handleSelectConversation = (conv: ConversationItem) => {
    triggerHaptic();
    onClose();
    router.push(`/chat/${conv.id}` as any);
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return "";
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return "Just now";
      if (diffMin < 60) return `${diffMin}m`;
      const diffHours = Math.floor(diffMin / 60);
      if (diffHours < 24) return `${diffHours}h`;
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  };

  return (
    <View style={styles.dropdownWrapper}>
      {/* Invisible backdrop to dismiss */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      {/* Floating Card */}
      <View
        style={[
          styles.dropdownCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.borderStrong,
            shadowColor: "#000",
          },
        ]}
      >
        {/* Header */}
        <View style={[styles.headerRow, { borderBottomColor: colors.border }]}>
          <View style={styles.headerTitleRow}>
            <Text style={[styles.title, { color: colors.text }]}>Chats</Text>
            {unreadTotal > 0 ? (
              <View style={[styles.unreadBadge, { backgroundColor: colors.primarySoft }]}>
                <Text style={[styles.unreadBadgeText, { color: colors.primary }]}>{unreadTotal} new</Text>
              </View>
            ) : null}
          </View>
          <Pressable
            onPress={() => {
              triggerHaptic();
              onClose();
              router.push("/(tabs)/inbox" as any);
            }}
            style={styles.openInboxBtn}
          >
            <MaterialCommunityIcons name="open-in-new" size={16} color={colors.primary} />
            <Text style={[styles.openInboxText, { color: colors.primary }]}>Open Inbox</Text>
          </Pressable>
        </View>

        {/* Conversation List */}
        <ScrollView style={styles.scrollArea}>
          {isLoading ? (
            <View style={styles.loadingArea}>
              <ActivityIndicator color={colors.primary} size="small" />
            </View>
          ) : conversations.length === 0 ? (
            <View style={styles.emptyArea}>
              <MaterialCommunityIcons name="chat-outline" size={40} color={colors.muted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No messages yet</Text>
              <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
                Connect with mentors or study peers to begin direct conversations.
              </Text>
            </View>
          ) : (
            conversations.slice(0, 10).map((conv) => {
              const hasUnread = (conv.unread_count ?? 0) > 0;
              const title = conv.title || "Study Peer";
              const initial = title.trim()[0]?.toUpperCase() || "P";
              return (
                <Pressable
                  key={conv.id}
                  onPress={() => handleSelectConversation(conv)}
                  style={({ pressed }) => [
                    styles.itemRow,
                    {
                      backgroundColor: pressed ? colors.surface2 : "transparent",
                      borderBottomColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.avatarWrap}>
                    {conv.avatar_url ? (
                      <Image source={{ uri: conv.avatar_url }} style={styles.avatar} />
                    ) : (
                      <View style={[styles.avatarFallback, { backgroundColor: colors.primarySoft }]}>
                        <Text style={[styles.avatarInitial, { color: colors.primary }]}>{initial}</Text>
                      </View>
                    )}
                    {conv.kind === "dm" && conv.peer_id ? (
                      <ActiveDot
                        userId={conv.peer_id}
                        initialOnline={conv.is_online}
                        size={12}
                        style={styles.onlineDot}
                      />
                    ) : conv.is_online ? (
                      <View style={[styles.onlineDot, { backgroundColor: "#10B981" }]} />
                    ) : null}
                  </View>
                  <View style={styles.textCol}>
                    <View style={styles.topLine}>
                      <Text
                        style={[
                          styles.name,
                          { color: colors.text, fontWeight: hasUnread ? "800" : "600" },
                        ]}
                        numberOfLines={1}
                      >
                        {title}
                      </Text>
                      <Text style={[styles.time, { color: colors.muted }]}>
                        {formatTime(conv.last_message?.created_at || conv.updated_at)}
                      </Text>
                    </View>
                    <View style={styles.bottomLine}>
                      <Text
                        style={[
                          styles.snippet,
                          {
                            color: hasUnread ? colors.text : colors.muted,
                            fontWeight: hasUnread ? "600" : "400",
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {conv.last_message?.body || "Start a conversation..."}
                      </Text>
                      {hasUnread ? (
                        <View style={[styles.pillBadge, { backgroundColor: colors.primary }]}>
                          <Text style={styles.pillBadgeText}>{conv.unread_count}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>

        {/* Footer */}
        <Pressable
          onPress={() => {
            triggerHaptic();
            onClose();
            router.push("/(tabs)/inbox" as any);
          }}
          style={({ pressed }) => [
            styles.footerBtn,
            {
              borderTopColor: colors.border,
              backgroundColor: pressed ? colors.surface2 : colors.surfaceMuted,
            },
          ]}
        >
          <Text style={[styles.footerBtnText, { color: colors.primary }]}>See all in Messenger</Text>
          <MaterialCommunityIcons name="arrow-right" size={16} color={colors.primary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dropdownWrapper: {
    position: "absolute",
    top: 56,
    right: 110,
    zIndex: 9999,
  },
  backdrop: {
    position: "fixed" as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9998,
  },
  dropdownCard: {
    width: 360,
    maxHeight: 500,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: "hidden",
    elevation: 20,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    zIndex: 9999,
    display: "flex",
    flexDirection: "column",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
  },
  unreadBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  unreadBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  openInboxBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  openInboxText: {
    fontSize: 12,
    fontWeight: "600",
  },
  scrollArea: {
    maxHeight: 380,
  },
  loadingArea: {
    padding: 32,
    alignItems: "center",
  },
  emptyArea: {
    padding: 32,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  emptySubtitle: {
    fontSize: 12,
    textAlign: "center",
  },
  itemRow: {
    flexDirection: "row",
    padding: 12,
    gap: 12,
    borderBottomWidth: 1,
    alignItems: "center",
  },
  avatarWrap: {
    position: "relative",
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  avatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 16,
    fontWeight: "700",
  },
  onlineDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  textCol: {
    flex: 1,
    gap: 3,
  },
  topLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  name: {
    fontSize: 13,
    flex: 1,
  },
  time: {
    fontSize: 11,
  },
  bottomLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  snippet: {
    fontSize: 12,
    flex: 1,
  },
  pillBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  pillBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
  footerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 6,
    borderTopWidth: 1,
  },
  footerBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },
});
