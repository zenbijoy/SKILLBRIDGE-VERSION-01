import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useTheme, radius } from "@/theme";
import { triggerHaptic } from "@/components/ui";

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  kind: string;
  priority?: "low" | "normal" | "high" | "urgent";
  entity_type?: string;
  entity_id?: string;
  read_at?: string | null;
  created_at: string;
  data?: Record<string, any>;
};

interface WebNotificationsDropdownProps {
  visible: boolean;
  onClose: () => void;
}

export function WebNotificationsDropdown({ visible, onClose }: WebNotificationsDropdownProps) {
  const { colors, isDark } = useTheme();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<{ notifications: NotificationItem[] }>("/notifications"),
    staleTime: 10_000,
    enabled: visible,
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => api("/notifications/read-all", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const markItemReadMutation = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  if (!visible) return null;

  const notifications = data?.notifications || [];
  const unreadCount = notifications.filter((n) => !n.read_at).length;
  const filtered =
    filter === "unread" ? notifications.filter((n) => !n.read_at) : notifications;

  const handleItemClick = (item: NotificationItem) => {
    triggerHaptic();
    if (!item.read_at) {
      markItemReadMutation.mutate(item.id);
    }
    onClose();

    if (item.entity_type === "room" && item.entity_id) {
      router.push(`/room/${item.entity_id}` as any);
    } else if (item.entity_type === "chat" || item.entity_type === "message") {
      router.push(item.entity_id ? (`/chat/${item.entity_id}` as any) : ("/inbox" as any));
    } else if (item.entity_type === "booking" && item.entity_id) {
      router.push(`/bookings/${item.entity_id}` as any);
    } else if (item.entity_type === "club" && item.entity_id) {
      router.push(`/club/${item.entity_id}` as any);
    } else {
      router.push("/notifications" as any);
    }
  };

  const getNotificationIcon = (kind: string) => {
    switch (kind) {
      case "room_invite":
      case "room_live":
        return { icon: "door-open", color: "#10B981" };
      case "chat_message":
      case "direct_message":
        return { icon: "chat-processing-outline", color: "#3B82F6" };
      case "booking_confirmed":
      case "booking_request":
        return { icon: "calendar-check", color: "#8B5CF6" };
      case "connection_accepted":
      case "connection_request":
        return { icon: "account-multiple-check", color: "#F59E0B" };
      case "achievement_unlocked":
      case "badge_earned":
        return { icon: "trophy-outline", color: "#EC4899" };
      default:
        return { icon: "bell-outline", color: colors.primary };
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return "Just now";
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHours = Math.floor(diffMin / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays === 1) return "Yesterday";
      return `${diffDays}d ago`;
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
        {/* Top Header */}
        <View style={[styles.headerRow, { borderBottomColor: colors.border }]}>
          <View style={styles.headerTitleCol}>
            <Text style={[styles.title, { color: colors.text }]}>Notifications</Text>
            {unreadCount > 0 ? (
              <View style={[styles.unreadBadge, { backgroundColor: colors.primarySoft }]}>
                <Text style={[styles.unreadBadgeText, { color: colors.primary }]}>{unreadCount} unread</Text>
              </View>
            ) : null}
          </View>
          {unreadCount > 0 ? (
            <Pressable
              onPress={() => {
                triggerHaptic();
                markAllReadMutation.mutate();
              }}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={[styles.markAllText, { color: colors.primary }]}>Mark all as read</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Filter Pills */}
        <View style={[styles.filterBar, { borderBottomColor: colors.border }]}>
          <Pressable
            onPress={() => setFilter("all")}
            style={[
              styles.filterPill,
              {
                backgroundColor: filter === "all" ? colors.primary : colors.surface2,
              },
            ]}
          >
            <Text
              style={[
                styles.filterPillText,
                { color: filter === "all" ? "#FFFFFF" : colors.text, fontWeight: filter === "all" ? "700" : "500" },
              ]}
            >
              All
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setFilter("unread")}
            style={[
              styles.filterPill,
              {
                backgroundColor: filter === "unread" ? colors.primary : colors.surface2,
              },
            ]}
          >
            <Text
              style={[
                styles.filterPillText,
                { color: filter === "unread" ? "#FFFFFF" : colors.text, fontWeight: filter === "unread" ? "700" : "500" },
              ]}
            >
              Unread ({unreadCount})
            </Text>
          </Pressable>
        </View>

        {/* List of Notifications */}
        <ScrollView style={styles.scrollArea}>
          {isLoading ? (
            <View style={styles.loadingArea}>
              <ActivityIndicator color={colors.primary} size="small" />
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.emptyArea}>
              <MaterialCommunityIcons name="bell-sleep-outline" size={40} color={colors.muted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No notifications</Text>
              <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
                {filter === "unread" ? "You're all caught up!" : "You will be notified about rooms and messages here."}
              </Text>
            </View>
          ) : (
            filtered.slice(0, 15).map((item) => {
              const isUnread = !item.read_at;
              const iconDef = getNotificationIcon(item.kind);
              return (
                <Pressable
                  key={item.id}
                  onPress={() => handleItemClick(item)}
                  style={({ pressed }) => [
                    styles.itemRow,
                    {
                      backgroundColor: pressed
                        ? colors.surface2
                        : isUnread
                        ? isDark
                          ? "rgba(37, 99, 235, 0.08)"
                          : "rgba(37, 99, 235, 0.04)"
                        : "transparent",
                      borderBottomColor: colors.border,
                    },
                  ]}
                >
                  <View style={[styles.iconBox, { backgroundColor: `${iconDef.color}18` }]}>
                    <MaterialCommunityIcons name={iconDef.icon as any} size={20} color={iconDef.color} />
                  </View>
                  <View style={styles.itemTextCol}>
                    <View style={styles.itemTitleRow}>
                      <Text style={[styles.itemTitle, { color: colors.text, fontWeight: isUnread ? "700" : "600" }]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      {isUnread ? <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} /> : null}
                    </View>
                    <Text style={[styles.itemBody, { color: colors.muted }]} numberOfLines={2}>
                      {item.body}
                    </Text>
                    <Text style={[styles.itemTime, { color: colors.muted }]}>
                      {formatTime(item.created_at)}
                    </Text>
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>

        {/* Footer Link */}
        <Pressable
          onPress={() => {
            triggerHaptic();
            onClose();
            router.push("/notifications" as any);
          }}
          style={({ pressed }) => [
            styles.footerBtn,
            {
              borderTopColor: colors.border,
              backgroundColor: pressed ? colors.surface2 : colors.surfaceMuted,
            },
          ]}
        >
          <Text style={[styles.footerBtnText, { color: colors.primary }]}>
            View all notifications
          </Text>
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
    right: 64,
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
    width: 380,
    maxHeight: 520,
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
  headerTitleCol: {
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
  markAllText: {
    fontSize: 12,
    fontWeight: "600",
  },
  filterBar: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  filterPillText: {
    fontSize: 12,
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
    alignItems: "flex-start",
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  itemTextCol: {
    flex: 1,
    gap: 3,
  },
  itemTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  itemTitle: {
    fontSize: 13,
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  itemBody: {
    fontSize: 12,
    lineHeight: 16,
  },
  itemTime: {
    fontSize: 10,
    marginTop: 2,
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
