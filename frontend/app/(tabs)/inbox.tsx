import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import type { Conversation } from "@/types";
import { AppHeader } from "@/components/navigation/AppHeader";
import { Card, Empty, ErrorState, Field, H2, Muted, Pill, Row, Screen, Skeleton } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import { useI18n } from "@/i18n";

type InboxFilter = "all" | "unread" | "groups";

export default function Inbox() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<InboxFilter>("all");
  const conversations = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api<{ conversations: Conversation[] }>("/chat/conversations"),
    refetchInterval: 45_000,
  });

  const visible = useMemo(() => {
    const search = query.trim().toLowerCase();
    return (conversations.data?.conversations ?? []).filter((conversation) => {
      if (filter === "unread" && !(conversation.unread_count && conversation.unread_count > 0)) return false;
      if (filter === "groups" && conversation.kind === "dm") return false;
      if (!search) return true;
      return (conversation.title ?? "Conversation").toLowerCase().includes(search);
    });
  }, [conversations.data?.conversations, filter, query]);

  return (
    <Screen>
      <AppHeader title={t("inbox.title")} searchPlaceholder="Search SkillBridge..." />
      <Muted>{t("inbox.subtitle")}</Muted>
      <View style={s.searchWrap}>
        <MaterialCommunityIcons name="magnify" size={20} color={colors.muted} />
        <Field style={s.searchField} placeholder="Search conversations" value={query} onChangeText={setQuery} />
      </View>
      <Row>
        {(["all", "unread", "groups"] as const).map((item) => <Pressable key={item} onPress={() => setFilter(item)}><Pill tone={filter === item ? "primary" : "default"}>{item.charAt(0).toUpperCase() + item.slice(1)}</Pill></Pressable>)}
      </Row>

      {conversations.isLoading ? <><Skeleton height={82} /><Skeleton height={82} /><Skeleton height={82} /></> : null}
      {conversations.isError ? <ErrorState detail={(conversations.error as Error).message} onRetry={() => conversations.refetch()} /> : null}
      {conversations.isSuccess && visible.length === 0 ? <Empty title={t("inbox.empty")} detail={t("inbox.emptyDetail")} /> : null}

      {visible.map((conversation) => (
        <Pressable key={conversation.id} onPress={() => router.push(`/chat/${conversation.id}` as any)} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
          <Card>
            <View style={s.row}>
              <View style={[s.avatar, { backgroundColor: colors.primarySoft }]}>
                <MaterialCommunityIcons name={conversation.kind === "dm" ? "account-outline" : "account-group-outline"} size={23} color={colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text numberOfLines={1} style={[s.title, { color: colors.text }]}>{conversation.title || (conversation.kind === "dm" ? "Direct conversation" : "Study group")}</Text>
                <Muted numberOfLines={1}>{conversation.kind === "room" ? "Learning room conversation" : conversation.kind === "group" ? "Group conversation" : "Direct message"}</Muted>
              </View>
              <View style={{ alignItems: "flex-end", gap: 7 }}>
                <Muted>{new Date(conversation.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Muted>
                {conversation.unread_count ? <View style={[s.unread, { backgroundColor: colors.primary }]}><Text style={s.unreadText}>{conversation.unread_count > 99 ? "99+" : conversation.unread_count}</Text></View> : null}
              </View>
            </View>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

const s = StyleSheet.create({
  searchWrap: { flexDirection: "row", alignItems: "center" },
  searchField: { flex: 1, paddingLeft: 42, marginLeft: -30 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16, fontWeight: "800" },
  unread: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  unreadText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
});
