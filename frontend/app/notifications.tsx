import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { Card, Empty, ErrorState, H2, Muted, Pill, Screen, Skeleton } from "@/components/ui";
import { useI18n } from "@/i18n";
import { radius, useTheme } from "@/theme";

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  kind: string;
  read_at?: string | null;
  created_at: string;
};

export default function Notifications() {
  const qc = useQueryClient();
  const { colors } = useTheme();
  const { t } = useI18n();
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<{ notifications: NotificationItem[] }>("/notifications"),
  });
  const markRead = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return (
    <Screen>
      {notifications.isLoading ? <><Skeleton height={100} /><Skeleton height={100} /><Skeleton height={100} /></> : null}
      {notifications.isError ? <ErrorState detail={(notifications.error as Error).message} onRetry={() => notifications.refetch()} /> : null}
      {notifications.isSuccess && notifications.data.notifications.length === 0 ? <Empty title={t("notifications.empty")} detail={t("notifications.emptyDetail")} /> : null}
      {notifications.data?.notifications.map((item) => (
        <Pressable key={item.id} onPress={() => !item.read_at && markRead.mutate(item.id)} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
          <Card tone={item.read_at ? "default" : "primary"}>
            <View style={s.row}>
              <View style={[s.icon, { backgroundColor: item.read_at ? colors.surface2 : colors.surface }]}>
                <MaterialCommunityIcons name={iconForKind(item.kind)} size={22} color={item.read_at ? colors.muted : colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 5 }}>
                <View style={s.titleRow}>
                  <H2 style={{ flex: 1 }}>{item.title}</H2>
                  {!item.read_at ? <View style={[s.dot, { backgroundColor: colors.primary }]} /> : null}
                </View>
                <Muted>{item.body}</Muted>
                <View style={s.meta}><Pill>{item.kind}</Pill><Text style={{ color: colors.muted, fontSize: 12 }}>{new Date(item.created_at).toLocaleString()}</Text></View>
              </View>
            </View>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

function iconForKind(kind: string): keyof typeof MaterialCommunityIcons.glyphMap {
  if (kind.includes("message")) return "message-text-outline";
  if (kind.includes("room") || kind.includes("session")) return "account-group-outline";
  if (kind.includes("event")) return "calendar-star";
  if (kind.includes("connection")) return "account-plus-outline";
  return "bell-outline";
}

const s = StyleSheet.create({
  row: { flexDirection: "row", gap: 12 },
  icon: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  meta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" },
});
