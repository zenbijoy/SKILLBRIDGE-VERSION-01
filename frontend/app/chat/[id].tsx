import { useEffect, useMemo, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { io } from "socket.io-client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { Message } from "@/types";
import { Button, Field, Muted, Screen } from "@/components/ui";
import { colors, radius } from "@/theme";
export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [body, setBody] = useState("");
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["messages", id],
    queryFn: () =>
      api<{ messages: Message[] }>(`/chat/conversations/${id}/messages`),
    enabled: !!id,
  });
  const socket = useMemo(
    () =>
      io(
        (
          process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000/api/v1"
        ).replace("/api/v1", ""),
        { autoConnect: false },
      ),
    [],
  );
  useEffect(() => {
    api(`/chat/conversations/${id}/read`, { method: "PATCH" }).catch(
      () => undefined,
    );
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active || !data.session) return;
      socket.auth = { token: data.session.access_token };
      socket.connect();
      socket.emit("conversation:join", { conversationId: id });
      socket.on("message:new", (m: Message) => {
        if (m.conversation_id === id)
          qc.setQueryData<{ messages: Message[] }>(["messages", id], (old) => ({
            messages: [...(old?.messages ?? []), m],
          }));
      });
    });
    return () => {
      active = false;
      socket.disconnect();
    };
  }, [id, qc, socket]);
  async function send() {
    const text = body.trim();
    if (!text) return;
    setBody("");
    await api(`/chat/conversations/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ body: text }),
    });
  }
  return (
    <Screen scroll={false}>
      <FlatList
        style={s.list}
        contentContainerStyle={s.messages}
        data={q.data?.messages ?? []}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => (
          <View style={s.bubble}>
            <Text style={s.body}>{item.body}</Text>
            <Muted>{new Date(item.created_at).toLocaleTimeString()}</Muted>
          </View>
        )}
      />
      <View style={s.composer}>
        <Field
          style={s.field}
          placeholder="Message…"
          value={body}
          onChangeText={setBody}
        />
        <Button title="Send" onPress={send} />
      </View>
    </Screen>
  );
}
const s = StyleSheet.create({
  list: { flex: 1 },
  messages: { gap: 10, paddingBottom: 16 },
  bubble: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  body: { color: colors.text, fontSize: 15 },
  composer: { flexDirection: "row", gap: 8 },
  field: { flex: 1 },
});
