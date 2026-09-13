import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { Button, Card, Empty, ErrorState, H1, Muted, Pill, Row, Screen, Skeleton, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import { router } from "expo-router";
import { nextGenEmptyStates } from "@/assets/nextgen";

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

const FILTERS = [
  { key: "all", label: "🔔 All" },
  { key: "rooms", label: "👥 Rooms & Q&A" },
  { key: "clubs", label: "🏛️ Clubs & Clashes" },
  { key: "feed", label: "📰 Campus Feed" },
  { key: "messages", label: "💬 Direct Chats" },
];

export default function Notifications() {
  const qc = useQueryClient();
  const { colors } = useTheme();
  const [filter, setFilter] = useState("all");

  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<{ notifications: NotificationItem[] }>("/notifications"),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllRead = useMutation({
    mutationFn: () => api("/notifications/read-all", { method: "PATCH" }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["notifications"] });
      Alert.alert("All read", "All notifications marked as read.");
    },
  });

  const allList = notifications.data?.notifications ?? [];
  const unreadCount = allList.filter((n) => !n.read_at).length;

  const filteredList = useMemo(() => {
    return allList.filter((n) => {
      const k = (n.kind || "").toLowerCase();
      const d = n.data || {};
      if (filter === "rooms") {
        return (
          k.includes("room") ||
          k.includes("question") ||
          k.includes("answer") ||
          k.includes("material") ||
          k.includes("recording") ||
          d.route === "room" ||
          Boolean(d.roomId)
        );
      }
      if (filter === "clubs") {
        return (
          k.includes("club") ||
          k.includes("clash") ||
          k.includes("negotiation") ||
          d.route === "club" ||
          Boolean(d.clubId)
        );
      }
      if (filter === "feed") {
        return (
          k.includes("feed") ||
          k.includes("post") ||
          k.includes("comment") ||
          d.route === "feed" ||
          Boolean(d.postId)
        );
      }
      if (filter === "messages") {
        return k.includes("message") || k.includes("chat") || Boolean(d.conversationId);
      }
      return true;
    });
  }, [allList, filter]);

  // Group by date sections
  const groupedSections = useMemo(() => {
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayMidnight = todayMidnight - 86400000;
    const weekMidnight = todayMidnight - 6 * 86400000;

    const sections: { title: string; items: NotificationItem[] }[] = [
      { title: "Today", items: [] },
      { title: "Yesterday", items: [] },
      { title: "Earlier This Week", items: [] },
      { title: "Older", items: [] },
    ];

    for (const item of filteredList) {
      const itemTime = new Date(item.created_at).getTime();
      if (itemTime >= todayMidnight) {
        sections[0].items.push(item);
      } else if (itemTime >= yesterdayMidnight) {
        sections[1].items.push(item);
      } else if (itemTime >= weekMidnight) {
        sections[2].items.push(item);
      } else {
        sections[3].items.push(item);
      }
    }

    return sections.filter((s) => s.items.length > 0);
  }, [filteredList]);

  const handleNotificationPress = (item: NotificationItem) => {
    triggerHaptic();
    if (!item.read_at) {
      markRead.mutate(item.id);
    }

    const data = item.data || {};

    // 1. Next-Gen Study Room & Q&A & Recordings Deep Link
    if (data.route === "room" || data.roomId) {
      const roomId = data.roomId;
      router.push(`/room/${roomId}` as any);
      return;
    }

    // 2. Next-Gen Club OS & Clash Negotiation Deep Link
    if (data.route === "club" || data.clubId) {
      const clubId = data.clubId;
      router.push(`/club/${clubId}` as any);
      return;
    }

    // 3. Next-Gen Campus Feed Deep Link
    if (data.route === "feed" || data.postId || item.kind.includes("post")) {
      router.push("/feed" as any);
      return;
    }

    // 4. Direct Chat Message Deep Link
    if (data.conversationId) {
      router.push(`/chat/${data.conversationId}` as any);
      return;
    }

    // 5. Research & Projects
    if (data.projectId || item.kind.includes("research")) {
      router.push("/research" as any);
      return;
    }

    // 6. Schedule & Calendar
    if (item.kind.includes("session") || item.kind.includes("event")) {
      router.push("/schedule" as any);
      return;
    }
  };

  return (
    <Screen>
      <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <H1>Notifications</H1>
          <Muted>
            {unreadCount > 0 ? `${unreadCount} unread update${unreadCount > 1 ? "s" : ""}` : "All caught up"}
          </Muted>
        </View>

        {unreadCount > 0 ? (
          <Button
            title="Mark all read"
            compact
            variant="ghost"
            loading={markAllRead.isPending}
            onPress={() => markAllRead.mutate()}
          />
        ) : null}
      </Row>

      {/* Filter Tabs */}
      <View style={s.filterBar}>
        {FILTERS.map((f) => {
          const selected = filter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => {
                triggerHaptic();
                setFilter(f.key);
              }}
              style={[
                s.filterTab,
                {
                  backgroundColor: selected ? colors.primary : colors.surface2,
                  borderColor: selected ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={{
                  color: selected ? colors.white : colors.text,
                  fontWeight: "800",
                  fontSize: 12,
                }}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {notifications.isLoading ? (
        <>
          <Skeleton height={90} />
          <Skeleton height={90} />
          <Skeleton height={90} />
        </>
      ) : null}

      {notifications.isError ? (
        <ErrorState detail={(notifications.error as Error).message} onRetry={() => notifications.refetch()} />
      ) : null}

      {/* Grouped Notifications List */}
      {groupedSections.map((section) => (
        <View key={section.title} style={s.sectionContainer}>
          <Text style={[s.sectionHeader, { color: colors.muted }]}>{section.title}</Text>
          <View style={{ gap: 8 }}>
            {section.items.map((item, idx) => {
              const iconInfo = getIconDetails(item.kind, item.data);
              const isUrgent = item.priority === "urgent" || item.priority === "high";

              return (
                <Animated.View key={item.id} entering={FadeInUp.delay(idx * 40).springify()}>
                  <Pressable
                    onPress={() => handleNotificationPress(item)}
                    style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
                  >
                    <Card tone={item.read_at ? "soft" : isUrgent ? "accent" : "glow"}>
                      <View style={s.row}>
                        <View
                          style={[
                            s.icon,
                            {
                              backgroundColor: item.read_at
                                ? colors.surface2
                                : iconInfo.bgColor || colors.primarySoft,
                            },
                          ]}
                        >
                          <MaterialCommunityIcons
                            name={iconInfo.icon}
                            size={22}
                            color={item.read_at ? colors.muted : iconInfo.color || colors.primary}
                          />
                        </View>

                        <View style={{ flex: 1, gap: 4 }}>
                          <View style={s.titleRow}>
                            <Text style={[s.itemTitle, { color: colors.text }]} numberOfLines={1}>
                              {item.title}
                            </Text>
                            {!item.read_at ? (
                              <View
                                style={[
                                  s.unreadDot,
                                  { backgroundColor: isUrgent ? colors.danger || "#ef4444" : colors.primary },
                                ]}
                              />
                            ) : null}
                          </View>

                          <Muted numberOfLines={2}>{item.body}</Muted>

                          <View style={s.meta}>
                            <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                              <Pill tone={item.read_at ? "default" : isUrgent ? "accent" : "primary"}>
                                {humanKind(item.kind)}
                              </Pill>
                              {isUrgent ? (
                                <Pill tone="danger">Priority</Pill>
                              ) : null}
                            </View>
                            <Text style={{ color: colors.muted, fontSize: 11 }}>
                              {new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </Card>
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        </View>
      ))}

      {filteredList.length === 0 && !notifications.isLoading ? (
        <View style={s.emptyBox}>
          <Image source={nextGenEmptyStates.noNotifications} style={s.emptyImage} resizeMode="contain" />
          <Empty
            title="No notifications in this view"
            detail="You're all caught up! You'll receive real-time alerts when study rooms open, questions are resolved, or clashes are negotiated."
          />
        </View>
      ) : null}
    </Screen>
  );
}

function getIconDetails(
  kind: string,
  _data?: Record<string, any>,
): {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color?: string;
  bgColor?: string;
} {
  const k = (kind || "").toUpperCase();

  if (k.includes("ANSWER_ACCEPTED") || k.includes("SOLVED")) {
    return { icon: "check-decagram", color: "#10b981", bgColor: "rgba(16, 185, 129, 0.12)" };
  }
  if (k.includes("QUESTION")) {
    return { icon: "comment-question-outline", color: "#8b5cf6", bgColor: "rgba(139, 92, 246, 0.12)" };
  }
  if (k.includes("MATERIAL")) {
    return { icon: "folder-file-outline", color: "#3b82f6", bgColor: "rgba(59, 130, 246, 0.12)" };
  }
  if (k.includes("RECORDING")) {
    return { icon: "youtube", color: "#ef4444", bgColor: "rgba(239, 68, 68, 0.12)" };
  }
  if (k.includes("CLASH") || k.includes("NEGOTIATION_RECEIVED")) {
    return { icon: "alert-decagram-outline", color: "#f59e0b", bgColor: "rgba(245, 158, 11, 0.12)" };
  }
  if (k.includes("NEGOTIATION_ACCEPTED")) {
    return { icon: "handshake-outline", color: "#10b981", bgColor: "rgba(16, 185, 129, 0.12)" };
  }
  if (k.includes("POST") || k.includes("FEED")) {
    return { icon: "newspaper-variant-outline", color: "#06b6d4", bgColor: "rgba(6, 182, 212, 0.12)" };
  }
  if (k.includes("MESSAGE") || k.includes("CHAT")) {
    return { icon: "message-text-outline", color: "#6366f1", bgColor: "rgba(99, 102, 241, 0.12)" };
  }
  if (k.includes("ROOM") || k.includes("SESSION")) {
    return { icon: "school-outline", color: "#3b82f6", bgColor: "rgba(59, 130, 246, 0.12)" };
  }

  return { icon: "bell-outline" };
}

function humanKind(kind: string): string {
  return kind
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const s = StyleSheet.create({
  filterBar: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginVertical: 8 },
  filterTab: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1 },
  sectionContainer: { marginTop: 14 },
  sectionHeader: { fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 },
  row: { flexDirection: "row", gap: 12, alignItems: "center" },
  icon: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  itemTitle: { fontSize: 15, fontWeight: "800", flex: 1 },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  meta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  emptyBox: { alignItems: "center", paddingVertical: 24 },
  emptyImage: { width: 140, height: 140, marginBottom: 12 },
});
