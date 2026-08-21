import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { Button, Card, Empty, ErrorState, H1, Muted, Pill, Row, Screen, Skeleton, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import { router } from "expo-router";

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  kind: string;
  read_at?: string | null;
  created_at: string;
  data?: Record<string, any>;
};

const FILTERS = [
  { key: "all", label: "🔔 All" },
  { key: "sessions", label: "👥 Sessions & Rooms" },
  { key: "research", label: "🔬 Research" },
  { key: "messages", label: "💬 Messages" },
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

  const filteredList = allList.filter((n) => {
    if (filter === "sessions") return n.kind.includes("room") || n.kind.includes("session");
    if (filter === "research") return n.kind.includes("research");
    if (filter === "messages") return n.kind.includes("message") || n.kind.includes("chat");
    return true;
  });

  const handleNotificationPress = (item: NotificationItem) => {
    triggerHaptic();
    if (!item.read_at) {
      markRead.mutate(item.id);
    }

    // Action routing
    if (item.data?.conversationId) {
      router.push(`/chat/${item.data.conversationId}` as any);
    } else if (item.data?.roomId) {
      router.push(`/room/${item.data.roomId}` as any);
    } else if (item.data?.projectId || item.kind.includes("research")) {
      router.push("/research" as any);
    } else if (item.kind.includes("session")) {
      router.push("/schedule" as any);
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

      {filteredList.map((item) => (
        <Pressable
          key={item.id}
          onPress={() => handleNotificationPress(item)}
          style={({ pressed }) => [{ opacity: pressed ? 0.78 : 1 }]}
        >
          <Card tone={item.read_at ? "soft" : "glow"}>
            <View style={s.row}>
              <View
                style={[
                  s.icon,
                  {
                    backgroundColor: item.read_at ? colors.surface2 : colors.primarySoft,
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name={iconForKind(item.kind)}
                  size={22}
                  color={item.read_at ? colors.muted : colors.primary}
                />
              </View>

              <View style={{ flex: 1, gap: 4 }}>
                <View style={s.titleRow}>
                  <Text style={[s.itemTitle, { color: colors.text }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  {!item.read_at ? <View style={[s.unreadDot, { backgroundColor: colors.primary }]} /> : null}
                </View>

                <Muted numberOfLines={2}>{item.body}</Muted>

                <View style={s.meta}>
                  <Pill tone={item.read_at ? "default" : "accent"}>{item.kind}</Pill>
                  <Text style={{ color: colors.muted, fontSize: 11 }}>
                    {new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ·{" "}
                    {new Date(item.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                  </Text>
                </View>
              </View>
            </View>
          </Card>
        </Pressable>
      ))}

      {filteredList.length === 0 && !notifications.isLoading ? (
        <Empty
          title="No notifications in this category"
          detail="You'll receive push alerts when peers volunteer to teach, publish papers, or send messages."
        />
      ) : null}
    </Screen>
  );
}

function iconForKind(kind: string): keyof typeof MaterialCommunityIcons.glyphMap {
  if (kind.includes("message") || kind.includes("chat")) return "message-text-outline";
  if (kind.includes("room") || kind.includes("session")) return "school-outline";
  if (kind.includes("research")) return "flask-outline";
  if (kind.includes("event") || kind.includes("seminar")) return "calendar-star";
  if (kind.includes("connection")) return "account-plus-outline";
  return "bell-outline";
}

const s = StyleSheet.create({
  filterBar: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginVertical: 6 },
  filterTab: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1 },
  row: { flexDirection: "row", gap: 12, alignItems: "center" },
  icon: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  itemTitle: { fontSize: 15, fontWeight: "800", flex: 1 },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  meta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
});
