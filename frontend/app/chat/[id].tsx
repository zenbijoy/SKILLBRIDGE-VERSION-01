import { useEffect, useState, useRef } from "react";
import { useLocalSearchParams } from "expo-router";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { Message } from "@/types";
import { Button, Field, Muted, Screen } from "@/components/ui";
import { colors, radius } from "@/theme";
import { getSocket } from "@/lib/socket";
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";

type OutboxMessage = Message & { client_message_id: string; pending?: boolean };

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [body, setBody] = useState("");
  const [typing, setTyping] = useState<Record<string, boolean>>({});
  const qc = useQueryClient();
  const socket = getSocket();

  const q = useQuery({
    queryKey: ["messages", id],
    queryFn: () =>
      api<{ messages: OutboxMessage[] }>(`/chat/conversations/${id}/messages`),
    enabled: !!id,
  });

  const typingTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    api(`/chat/conversations/${id}/read`, { method: "PATCH" }).catch(
      () => undefined,
    );

    let active = true;
    if (!socket) return;

    supabase.auth.getSession().then(({ data }) => {
      if (!active || !data.session) return;
      socket.auth = { token: data.session.access_token };
      socket.connect();
      socket.emit("conversation:join", { conversationId: id });

      socket.on("message:new", (m: OutboxMessage) => {
        if (m.conversation_id === id) {
          qc.setQueryData<{ messages: OutboxMessage[] }>(["messages", id], (old) => {
            const messages = old?.messages ?? [];
            // Remove local pending message if present
            const filtered = messages.filter(
              (msg) => msg.client_message_id !== m.client_message_id
            );
            return { messages: [...filtered, m] };
          });
        }
      });

      socket.on("typing:start", ({ conversationId, userId }) => {
        if (conversationId === id) {
          setTyping((prev) => ({ ...prev, [userId]: true }));
        }
      });

      socket.on("typing:stop", ({ conversationId, userId }) => {
        if (conversationId === id) {
          setTyping((prev) => ({ ...prev, [userId]: false }));
        }
      });
    });

    return () => {
      active = false;
      socket.off("message:new");
      socket.off("typing:start");
      socket.off("typing:stop");
      // Don't disconnect socket globally, just leave the room or keep it.
      socket.emit("conversation:leave", { conversationId: id });
    };
  }, [id, qc, socket]);

  function handleTyping(text: string) {
    setBody(text);
    if (!socket) return;

    socket.emit("typing:start", { conversationId: id });

    if (typingTimeout.current) {
      clearTimeout(typingTimeout.current);
    }
    typingTimeout.current = setTimeout(() => {
      socket.emit("typing:stop", { conversationId: id });
    }, 2000);
  }

  async function send() {
    const text = body.trim();
    if (!text) return;
    setBody("");

    if (socket && typingTimeout.current) {
      clearTimeout(typingTimeout.current);
      socket.emit("typing:stop", { conversationId: id });
    }

    const client_message_id = uuidv4();
    const tempMessage: OutboxMessage = {
      id: client_message_id,
      body: text,
      conversation_id: id,
      sender_id: "me", // Temporary sender ID
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      client_message_id,
      pending: true,
    };

    qc.setQueryData<{ messages: OutboxMessage[] }>(["messages", id], (old) => ({
      messages: [...(old?.messages ?? []), tempMessage],
    }));

    try {
      await api(`/chat/conversations/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: text, client_message_id }),
      });
    } catch (err) {
      // Offline outbox - in a real app we might persist this to SQLite to retry later
      console.warn("Failed to send message", err);
    }
  }

  const typingUsers = Object.keys(typing).filter((k) => typing[k]);

  return (
    <Screen scroll={false}>
      <FlatList
        style={s.list}
        contentContainerStyle={s.messages}
        data={q.data?.messages ?? []}
        keyExtractor={(m) => m.client_message_id || m.id}
        renderItem={({ item }) => (
          <View style={[s.bubble, item.pending && s.bubblePending]}>
            <Text style={s.body}>{item.body}</Text>
            <Muted>{new Date(item.created_at).toLocaleTimeString()}</Muted>
          </View>
        )}
      />
      {typingUsers.length > 0 && (
        <View style={s.typingContainer}>
          <Text style={s.typingText}>Someone is typing...</Text>
        </View>
      )}
      <View style={s.composer}>
        <Field
          style={s.field}
          placeholder="Message…"
          value={body}
          onChangeText={handleTyping}
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
  bubblePending: {
    opacity: 0.5,
  },
  body: { color: colors.text, fontSize: 15 },
  composer: { flexDirection: "row", gap: 8 },
  field: { flex: 1 },
  typingContainer: {
    padding: 8,
  },
  typingText: {
    color: colors.textMuted,
    fontStyle: "italic",
    fontSize: 12,
  },
});
