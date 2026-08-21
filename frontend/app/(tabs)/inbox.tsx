import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import type { Conversation } from "@/types";
import { AppHeader } from "@/components/navigation/AppHeader";
import { Card, Empty, ErrorState, Field, Muted, Pill, Row, Screen, Skeleton, triggerHaptic } from "@/components/ui";
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
    refetchInterval: 30_000,
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
    <Screen
      onRefresh={async () => {
        await conversations.refetch();
      }}
      refreshing={conversations.isRefetching}
    >
      <AppHeader title={t("inbox.title")} searchPlaceholder="Search conversations..." />
      <Muted>{t("inbox.subtitle")}</Muted>

      {/* Search Input Bar */}
      <View style={[s.searchContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <MaterialCommunityIcons name="magnify" size={20} color={colors.primary} />
        <Field
          style={s.searchField}
          placeholder="Search chats, study groups, room channels..."
          value={query}
          onChangeText={setQuery}
        />
        {query ? (
          <Pressable onPress={() => setQuery("")}>
            <MaterialCommunityIcons name="close-circle" size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      {/* Filter Tabs */}
      <Row>
        {(["all", "unread", "groups"] as const).map((item) => (
          <Pill
            key={item}
            tone={filter === item ? "primary" : "default"}
            onPress={() => setFilter(item)}
          >
            {item === "all" ? "All Messages" : item === "unread" ? "Unread Only" : "Study Groups"}
          </Pill>
        ))}
      </Row>

      {conversations.isLoading ? (
        <>
          <Skeleton height={86} />
          <Skeleton height={86} />
          <Skeleton height={86} />
        </>
      ) : null}
      {conversations.isError ? (
        <ErrorState detail={(conversations.error as Error).message} onRetry={() => conversations.refetch()} />
      ) : null}
      {conversations.isSuccess && visible.length === 0 ? (
        <Empty
          title={t("inbox.empty")}
          detail={t("inbox.emptyDetail")}
          actionTitle="Explore Network"
          onAction={() => router.push("/discover" as any)}
        />
      ) : null}

      {visible.map((conversation) => {
        const hasUnread = Boolean(conversation.unread_count && conversation.unread_count > 0);
        return (
          <Pressable
            key={conversation.id}
            onPress={() => {
              triggerHaptic();
              router.push(`/chat/${conversation.id}` as any);
            }}
            style={({ pressed }) => ({
              opacity: pressed ? 0.85 : 1,
              transform: [{ scale: pressed ? 0.985 : 1 }],
            })}
          >
            <Card tone={hasUnread ? "glow" : "default"}>
              <View style={s.row}>
                <View style={[s.avatar, { backgroundColor: colors.primarySoft }]}>
                  <MaterialCommunityIcons
                    name={
                      conversation.kind === "dm"
                        ? "account-outline"
                        : conversation.kind === "room"
                        ? "human-male-board"
                        : "account-group-outline"
                    }
                    size={24}
                    color={colors.primary}
                  />
                  {hasUnread ? <View style={[s.onlineDot, { backgroundColor: colors.primary }]} /> : null}
                </View>

                <View style={{ flex: 1, gap: 4 }}>
                  <Text
                    numberOfLines={1}
                    style={[s.title, { color: colors.text, fontWeight: hasUnread ? "900" : "700" }]}
                  >
                    {conversation.title ||
                      (conversation.kind === "dm"
                        ? "Direct Conversation"
                        : conversation.kind === "room"
                        ? "Room Classroom Chat"
                        : "Study Group")}
                  </Text>
                  <Muted numberOfLines={1}>
                    {conversation.kind === "room"
                      ? "Classroom stream & shared notes"
                      : conversation.kind === "group"
                      ? "Group conversation"
                      : "Direct peer message"}
                  </Muted>
                </View>

                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  <Muted style={{ fontSize: 12 }}>
                    {new Date(conversation.updated_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </Muted>
                  {hasUnread ? (
                    <View style={[s.unread, { backgroundColor: colors.primary }]}>
                      <Text style={s.unreadText}>
                        {conversation.unread_count! > 99 ? "99+" : conversation.unread_count}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}

const s = StyleSheet.create({
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    minHeight: 48,
    gap: 8,
  },
  searchField: { flex: 1, borderWidth: 0, paddingHorizontal: 0, minHeight: 44 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  onlineDot: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  title: { fontSize: 16 },
  unread: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
});
