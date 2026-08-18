import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { IconButton } from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";
import { useI18n } from "@/i18n";

type NotificationItem = { id: string; read_at?: string | null };

export function AppHeader({
  title,
  searchPlaceholder,
  actionIcon,
  actionLabel,
  onAction,
}: {
  title?: string;
  searchPlaceholder?: string;
  actionIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<{ notifications: NotificationItem[] }>("/notifications"),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const unread = notifications.data?.notifications.filter((item) => !item.read_at).length ?? 0;

  return (
    <View style={styles.wrap}>
      {title || actionIcon ? (
        <View style={styles.titleRow}>
          <Text style={[styles.brand, { color: colors.text }]}>{title ?? "SkillBridge"}</Text>
          {actionIcon ? <IconButton icon={actionIcon} label={actionLabel ?? "Action"} onPress={onAction} /> : null}
        </View>
      ) : null}
      <View style={styles.searchRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("search.title")}
          onPress={() => router.push("/search" as any)}
          style={({ pressed }) => [
            styles.search,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.78 : 1 },
          ]}
        >
          <MaterialCommunityIcons name="magnify" size={22} color={colors.muted} />
          <Text numberOfLines={1} style={[styles.searchText, { color: colors.muted }]}>
            {searchPlaceholder ?? t("common.searchEverything")}
          </Text>
        </Pressable>
        <IconButton
          icon="bell-outline"
          label={t("notifications.title")}
          badge={unread}
          onPress={() => router.push("/notifications" as any)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  brand: { fontSize: 24, fontWeight: "900", letterSpacing: -0.7 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  search: { flex: 1, height: 48, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 9 },
  searchText: { flex: 1, fontSize: 14, fontWeight: "600" },
});
