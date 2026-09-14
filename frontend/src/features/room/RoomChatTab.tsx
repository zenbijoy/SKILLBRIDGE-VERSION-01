import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { useSession } from "@/hooks/useSession";
import { useTheme, radius, spacing } from "@/theme";
import { Empty, Muted } from "@/components/ui";
import type { Message } from "@/types";

type OutboxMsg = Message & { pending?: boolean; failed?: boolean; client_message_id?: string };

interface Props {
  conversationId: string | null | undefined;
  isMember: boolean;
}

export function RoomChatTab({ conversationId, isMember }: Props) {
  const { colors } = useTheme();
  const { session } = useSession();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<OutboxMsg>>(null);
  const socket = getSocket();

  const queryKey = ["room-chat", conversationId];

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => api<{ messages: OutboxMsg[] }>(`/chat/conversations/${conversationId}/messages`),
    enabled: Boolean(conversationId) && isMember,
    staleTime: 30_000,
  });

  const messages = data?.messages ?? [];
  const myId = session?.user?.id;

  // Lazy socket — only joins room when this tab is mounted
  useEffect(() => {
    if (!conversationId || !socket) return;
    socket.emit("join_conversation", { conversation_id: conversationId });

    const onMessage = (msg: OutboxMsg) => {
      if (msg.conversation_id !== conversationId) return;
      qc.setQueryData<{ messages: OutboxMsg[] }>(queryKey, (old) => {
        const current = old?.messages ?? [];
        if (current.some((m) => m.id === msg.id)) return old;
        return { messages: [...current, msg] };
      });
    };

    socket.on("new_message", onMessage);
    return () => {
      socket.off("new_message", onMessage);
      socket.emit("leave_conversation", { conversation_id: conversationId });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages.length]);

  async function sendMessage() {
    const text = body.trim();
    if (!text || !conversationId || sending) return;
    setBody("");
    setSending(true);
    try {
      const res = await api<{ message: OutboxMsg }>(`/chat/conversations/${conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: text }),
      });
      qc.setQueryData<{ messages: OutboxMsg[] }>(queryKey, (old) => {
        const current = old?.messages ?? [];
        if (current.some((m) => m.id === res.message.id)) return old;
        return { messages: [...current, res.message] };
      });
    } catch {
      setBody(text); // restore on failure
    } finally {
      setSending(false);
    }
  }

  if (!conversationId) {
    return (
      <View style={[s.centered, { backgroundColor: colors.bg }]}>
        <Empty title="Chat not available" detail="This room does not have a linked conversation yet." />
      </View>
    );
  }

  if (!isMember) {
    return (
      <View style={[s.centered, { backgroundColor: colors.bg }]}>
        <Empty title="Members only" detail="Join the room to access the room chat." />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[s.container, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 110 : 0}
    >
      {isLoading ? (
        <View style={s.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Muted style={{ marginTop: 10 }}>Loading messages…</Muted>
        </View>
      ) : isError ? (
        <View style={s.centered}>
          <Empty title="Could not load chat" detail="Pull to retry." />
        </View>
      ) : messages.length === 0 ? (
        <View style={s.centered}>
          <Empty title="No messages yet" detail="Be the first to say something!" />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.client_message_id ?? m.id}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            const isMe = item.sender_id === myId;
            return (
              <View style={[s.bubble, isMe ? s.bubbleMe : s.bubbleThem]}>
                {!isMe && item.sender_id && (
                  <Text style={[s.senderName, { color: colors.primary }]}>
                    {(item as any).sender?.full_name ?? (item as any).sender?.username ?? "Member"}
                  </Text>
                )}
                <View
                  style={[
                    s.bubbleBody,
                    {
                      backgroundColor: isMe ? colors.primary : colors.surface2,
                      borderBottomRightRadius: isMe ? 4 : radius.md,
                      borderBottomLeftRadius: isMe ? radius.md : 4,
                    },
                  ]}
                >
                  <Text style={[s.msgText, { color: isMe ? colors.white : colors.text }]}>
                    {item.body}
                  </Text>
                  <Text style={[s.msgTime, { color: isMe ? "rgba(255,255,255,0.6)" : colors.muted }]}>
                    {new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    {item.pending ? " ···" : ""}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}

      <View style={[s.inputRow, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Message room…"
          placeholderTextColor={colors.muted}
          style={[s.input, { color: colors.text, backgroundColor: colors.surface2 }]}
          multiline
          maxLength={2000}
          returnKeyType="default"
          onSubmitEditing={sendMessage}
          blurOnSubmit={false}
        />
        <Pressable
          onPress={sendMessage}
          disabled={!body.trim() || sending}
          style={[s.sendBtn, { backgroundColor: body.trim() ? colors.primary : colors.surface2 }]}
        >
          {sending ? (
            <ActivityIndicator size={18} color={colors.white} />
          ) : (
            <MaterialCommunityIcons
              name="send"
              size={20}
              color={body.trim() ? colors.white : colors.muted}
            />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  listContent: { padding: spacing.md, gap: 6, paddingBottom: spacing.sm },
  bubble: { marginVertical: 2 },
  bubbleMe: { alignItems: "flex-end" },
  bubbleThem: { alignItems: "flex-start" },
  senderName: { fontSize: 11, fontWeight: "700", marginBottom: 3, marginLeft: 2 },
  bubbleBody: { maxWidth: "80%", borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, gap: 3 },
  msgText: { fontSize: 15, lineHeight: 21 },
  msgTime: { fontSize: 10, textAlign: "right" },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    padding: spacing.sm,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    fontSize: 15,
    maxHeight: 120,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Platform.OS === "ios" ? 1 : 0,
  },
});
