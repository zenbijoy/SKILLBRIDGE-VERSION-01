import { useQuery } from "@tanstack/react-query";
import { Pressable, StyleSheet, Text } from "react-native";
import { router } from "expo-router";
import { api } from "@/lib/api";
import type { Conversation } from "@/types";
import { Card, H1, Muted, Screen } from "@/components/ui";
import { colors } from "@/theme";
export default function Inbox() {
  const q = useQuery({
    queryKey: ["conversations"],
    queryFn: () =>
      api<{ conversations: Conversation[] }>("/chat/conversations"),
  });
  return (
    <Screen>
      <H1>Inbox</H1>
      <Muted>Direct messages, learning-room chat and club conversations.</Muted>
      {q.data?.conversations?.map((c) => (
        <Pressable key={c.id} onPress={() => router.push(`/chat/${c.id}`)}>
          <Card>
            <Text style={s.title}>{c.title || "Conversation"}</Text>
            <Muted>
              {c.kind} · {new Date(c.updated_at).toLocaleString()}
            </Muted>
            {c.unread_count ? (
              <Text style={s.unread}>{c.unread_count} unread</Text>
            ) : null}
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
const s = StyleSheet.create({
  title: { color: colors.text, fontSize: 16, fontWeight: "800" },
  unread: { color: colors.accent, fontWeight: "800" },
});
