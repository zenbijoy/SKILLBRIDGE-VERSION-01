import { useEffect, useRef, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { Message } from "@/types";
import { Field, Muted, Screen } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import { getSocket } from "@/lib/socket";
import { useSession } from "@/hooks/useSession";

type OutboxMessage = Message & { client_message_id?: string; pending?: boolean; failed?: boolean };
const OUTBOX_KEY = (id: string) => `@chat_outbox_${id}`;

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const { colors } = useTheme();
  const [body, setBody] = useState("");
  const [typing, setTyping] = useState<Record<string, boolean>>({});
  const qc = useQueryClient();
  const socket = getSocket();
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const messagesQuery = useQuery({
    queryKey: ["messages", id],
    queryFn: () => api<{ messages: OutboxMessage[] }>(`/chat/conversations/${id}/messages`),
    enabled: Boolean(id),
  });

  function replaceLocalMessage(clientId: string, message: OutboxMessage) {
    qc.setQueryData<{ messages: OutboxMessage[] }>(["messages", id], (old) => {
      const current = old?.messages ?? [];
      const withoutLocal = current.filter((item) => item.client_message_id !== clientId && item.id !== clientId);
      if (withoutLocal.some((item) => item.id === message.id)) return { messages: withoutLocal };
      return { messages: [...withoutLocal, { ...message, pending: false, failed: false }] };
    });
  }

  async function removeOutbox(clientId: string) {
    const raw = await AsyncStorage.getItem(OUTBOX_KEY(id));
    if (!raw) return;
    const outbox: OutboxMessage[] = JSON.parse(raw);
    await AsyncStorage.setItem(OUTBOX_KEY(id), JSON.stringify(outbox.filter((item) => item.client_message_id !== clientId)));
  }

  async function retryOutbox() {
    const raw = await AsyncStorage.getItem(OUTBOX_KEY(id));
    if (!raw) return;
    try {
      const outbox: OutboxMessage[] = JSON.parse(raw);
      if (!outbox.length) return;
      qc.setQueryData<{ messages: OutboxMessage[] }>(["messages", id], (old) => {
        const current = old?.messages ?? [];
        const merged = [...current];
        for (const pending of outbox) {
          if (!merged.some((item) => item.client_message_id === pending.client_message_id || item.id === pending.id)) merged.push(pending);
        }
        return { messages: merged };
      });
      for (const pending of outbox) {
        if (!pending.client_message_id) continue;
        try {
          const sent = await api<OutboxMessage>(`/chat/conversations/${id}/messages`, {
            method: "POST",
            body: JSON.stringify({ body: pending.body, client_message_id: pending.client_message_id }),
          });
          replaceLocalMessage(pending.client_message_id, sent);
          await removeOutbox(pending.client_message_id);
        } catch {
          qc.setQueryData<{ messages: OutboxMessage[] }>(["messages", id], (old) => ({
            messages: (old?.messages ?? []).map((item) => item.client_message_id === pending.client_message_id ? { ...item, pending: false, failed: true } : item),
          }));
        }
      }
    } catch (error) {
      console.warn("Could not restore chat outbox", error);
    }
  }

  useEffect(() => {
    if (!id) return;
    let active = true;
    let reconnectBound = false;

    void api(`/chat/conversations/${id}/read`, { method: "PATCH" }).catch(() => undefined);
    void retryOutbox();

    if (!socket) return () => { active = false; };

    const onMessage = (message: OutboxMessage) => {
      if (message.conversation_id !== id) return;
      if (message.client_message_id) replaceLocalMessage(message.client_message_id, message);
      else {
        qc.setQueryData<{ messages: OutboxMessage[] }>(["messages", id], (old) => {
          const current = old?.messages ?? [];
          if (current.some((item) => item.id === message.id)) return old;
          return { messages: [...current, message] };
        });
      }
    };
    const onTypingStart = ({ conversationId, userId }: { conversationId: string; userId: string }) => {
      if (conversationId === id && userId !== session?.user.id) setTyping((prev) => ({ ...prev, [userId]: true }));
    };
    const onTypingStop = ({ conversationId, userId }: { conversationId: string; userId: string }) => {
      if (conversationId === id) setTyping((prev) => ({ ...prev, [userId]: false }));
    };
    const onReconnect = () => void retryOutbox();

    void supabase.auth.getSession().then(({ data }) => {
      if (!active || !data.session) return;
      socket.auth = { token: data.session.access_token };
      socket.connect();
      socket.emit("conversation:join", { conversationId: id });
      socket.on("message:new", onMessage);
      socket.on("typing:start", onTypingStart);
      socket.on("typing:stop", onTypingStop);
      socket.io.on("reconnect", onReconnect);
      reconnectBound = true;
    });

    return () => {
      active = false;
      socket.off("message:new", onMessage);
      socket.off("typing:start", onTypingStart);
      socket.off("typing:stop", onTypingStop);
      if (reconnectBound) socket.io.off("reconnect", onReconnect);
      socket.emit("conversation:leave", { conversationId: id });
      if (typingTimeout.current) clearTimeout(typingTimeout.current);
    };
    // retryOutbox/replaceLocalMessage are intentionally scoped to this conversation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, qc, socket, session?.user.id]);

  function handleTyping(text: string) {
    setBody(text);
    if (!socket) return;
    socket.emit("typing:start", { conversationId: id });
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => socket.emit("typing:stop", { conversationId: id }), 1600);
  }

  async function send() {
    const text = body.trim();
    if (!text) return;
    setBody("");
    if (socket && typingTimeout.current) {
      clearTimeout(typingTimeout.current);
      socket.emit("typing:stop", { conversationId: id });
    }

    const clientId = uuidv4();
    const temp: OutboxMessage = {
      id: clientId,
      body: text,
      conversation_id: id,
      sender_id: session?.user.id ?? "me",
      created_at: new Date().toISOString(),
      client_message_id: clientId,
      pending: true,
    };
    qc.setQueryData<{ messages: OutboxMessage[] }>(["messages", id], (old) => ({ messages: [...(old?.messages ?? []), temp] }));

    try {
      const raw = await AsyncStorage.getItem(OUTBOX_KEY(id));
      const outbox: OutboxMessage[] = raw ? JSON.parse(raw) : [];
      await AsyncStorage.setItem(OUTBOX_KEY(id), JSON.stringify([...outbox, temp]));
    } catch (error) {
      console.warn("Could not persist pending message", error);
    }

    try {
      const sent = await api<OutboxMessage>(`/chat/conversations/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: text, client_message_id: clientId }),
      });
      replaceLocalMessage(clientId, sent);
      await removeOutbox(clientId);
    } catch {
      qc.setQueryData<{ messages: OutboxMessage[] }>(["messages", id], (old) => ({
        messages: (old?.messages ?? []).map((item) => item.client_message_id === clientId ? { ...item, pending: false, failed: true } : item),
      }));
    }
  }

  const typingUsers = Object.keys(typing).filter((key) => typing[key]);
  const data = messagesQuery.data?.messages ?? [];

  return (
    <Screen scroll={false} contentStyle={{ paddingBottom: 8 }}>
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={s.messages}
        data={data}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(message) => message.client_message_id || message.id}
        renderItem={({ item }) => {
          const mine = item.sender_id === session?.user.id || item.sender_id === "me";
          return (
            <View style={[s.messageRow, { justifyContent: mine ? "flex-end" : "flex-start" }]}>
              <View style={[s.bubble, { backgroundColor: mine ? colors.primary : colors.surface, borderColor: mine ? colors.primary : colors.border }, item.failed && { borderColor: colors.danger }]}>
                <Text style={{ color: mine ? colors.white : colors.text, fontSize: 15, lineHeight: 21 }}>{item.body}</Text>
                <Text style={{ color: mine ? "#E5EDFF" : colors.muted, fontSize: 10, alignSelf: "flex-end" }}>
                  {item.pending ? "Sending…" : item.failed ? "Failed · tap to retry later" : new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>
            </View>
          );
        }}
      />
      {typingUsers.length ? <Muted style={{ paddingHorizontal: 4 }}>Someone is typing…</Muted> : null}
      <View style={s.composer}>
        <View style={{ flex: 1 }}><Field placeholder="Message…" value={body} onChangeText={handleTyping} onSubmitEditing={() => void send()} returnKeyType="send" /></View>
        <Pressable accessibilityLabel="Send message" onPress={() => void send()} disabled={!body.trim()} style={({ pressed }) => [s.send, { backgroundColor: body.trim() ? colors.primary : colors.surface2, opacity: pressed ? 0.72 : 1 }]}>
          <MaterialCommunityIcons name="send" size={20} color={body.trim() ? colors.white : colors.muted} />
        </Pressable>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  messages: { gap: 8, paddingBottom: 12 },
  messageRow: { flexDirection: "row" },
  bubble: { maxWidth: "82%", borderRadius: radius.lg, paddingHorizontal: 13, paddingVertical: 10, borderWidth: 1, gap: 5 },
  composer: { flexDirection: "row", alignItems: "center", gap: 8 },
  send: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
});
