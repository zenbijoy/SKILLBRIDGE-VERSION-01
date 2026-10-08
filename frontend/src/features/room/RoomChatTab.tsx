import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { useSession } from "@/hooks/useSession";
import { useTheme, spacing } from "@/theme";
import { Empty, Muted, triggerHaptic } from "@/components/ui";
import type { Message } from "@/types";

type OutboxMsg = Message & { pending?: boolean; failed?: boolean; client_message_id?: string };

interface Props {
  conversationId: string | null | undefined;
  isMember: boolean;
}

export function RoomChatTab({ conversationId, isMember }: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
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

    const onMessage = (payload: any) => {
      const msg: OutboxMsg = payload?.message ?? payload;
      if (!msg || msg.conversation_id !== conversationId) return;
      qc.setQueryData<{ messages: OutboxMsg[] }>(queryKey, (old) => {
        const current = old?.messages ?? [];
        if (current.some((m) => m.id === msg.id)) return old;
        return { messages: [...current, msg] };
      });
    };

    socket.on("message:new", onMessage);
    socket.on("new_message", onMessage);
    return () => {
      socket.off("message:new", onMessage);
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
      const res = await api<OutboxMsg>(`/chat/conversations/${conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: text }),
      });
      const resolvedMsg = res;
      if (resolvedMsg && resolvedMsg.id) {
        qc.setQueryData<{ messages: OutboxMsg[] }>(queryKey, (old) => {
          const current = old?.messages ?? [];
          if (current.some((m) => m.id === resolvedMsg.id)) return old;
          return { messages: [...current, resolvedMsg] };
        });
      }
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
            const senderName = (item as any).sender?.full_name ?? (item as any).sender?.username ?? "Member";
            const senderAvatar = (item as any).sender?.avatar_url;
            const myAvatar = session?.user?.user_metadata?.avatar_url;
            const myInitial = (session?.user?.user_metadata?.full_name || "Y").charAt(0).toUpperCase();

            return (
              <View style={[s.messageRow, { justifyContent: isMe ? "flex-end" : "flex-start" }]}>
                {/* Incoming Avatar on Left */}
                {!isMe && (
                  <View style={s.avatarCol}>
                    {senderAvatar ? (
                      <Image source={{ uri: senderAvatar }} style={s.avatarImg} />
                    ) : (
                      <View style={[s.avatarImg, s.placeholderAvatar, { backgroundColor: colors.primarySoft }]}>
                        <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>
                          {senderName.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                <View
                  style={[
                    s.bubbleBody,
                    {
                      backgroundColor: isMe ? (isDark ? colors.surface2 : colors.primarySoft) : colors.surface,
                      borderColor: colors.border,
                      borderWidth: 1,
                      borderTopRightRadius: isMe ? 4 : 18,
                      borderTopLeftRadius: isMe ? 18 : 4,
                    },
                  ]}
                >
                  {!isMe && (
                    <Text style={[s.senderName, { color: colors.primary }]} numberOfLines={1}>
                      {senderName}
                    </Text>
                  )}

                  {/* Document/File Attachment Card (Matching screenshot) */}
                  {item.attachment && (
                    <Pressable
                      onPress={() => {
                        triggerHaptic();
                        if (item.attachment?.url) {
                          Linking.openURL(item.attachment.url).catch(() => {});
                        }
                      }}
                      style={[
                        s.fileCardModern,
                        {
                          backgroundColor: isDark ? colors.surface : colors.surface2,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <View style={[s.fileIconBadge, { backgroundColor: colors.danger }]}>
                        <MaterialCommunityIcons name="file-pdf-box" size={26} color={colors.white} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[s.fileNameModern, { color: colors.text }]} numberOfLines={1}>
                          {item.attachment.name || "document.pdf"}
                        </Text>
                        <Text style={[s.fileSizeModern, { color: colors.muted }]}>
                          {item.attachment.size
                            ? item.attachment.size > 1024 * 1024
                              ? `${(item.attachment.size / (1024 * 1024)).toFixed(1)} MB`
                              : `${Math.round(item.attachment.size / 1024)} KB`
                            : "Document"}
                        </Text>
                      </View>
                      <View style={[s.fileDownloadCircle, { backgroundColor: colors.primarySoft }]}>
                        <MaterialCommunityIcons name="arrow-down" size={18} color={colors.primary} />
                      </View>
                    </Pressable>
                  )}

                  {item.body ? (
                    <Text style={[s.msgText, { color: colors.text }]}>
                      {item.body}
                    </Text>
                  ) : null}

                  <View style={s.timeRow}>
                    <Text style={[s.msgTime, { color: colors.muted }]}>
                      {new Date(item.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </Text>
                    {isMe && (
                      <MaterialCommunityIcons
                        name={item.pending ? "clock-outline" : "check-all"}
                        size={13}
                        color={item.pending ? colors.muted : colors.primary}
                        style={{ marginLeft: 3 }}
                      />
                    )}
                  </View>
                </View>

                {/* Outgoing Avatar on Right */}
                {isMe && (
                  <View style={s.avatarColRight}>
                    {myAvatar ? (
                      <Image source={{ uri: myAvatar }} style={s.avatarImg} />
                    ) : (
                      <View style={[s.avatarImg, s.placeholderAvatar, { backgroundColor: colors.primarySoft }]}>
                        <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>
                          {myInitial}
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          }}
        />
      )}

      {/* Floating/Docked Modern Composer with Safe Area Insets */}
      <View
        style={[
          s.inputRow,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            paddingBottom: Math.max(insets.bottom, 10) + 4,
          },
        ]}
      >
        <Pressable
          onPress={() => {
            triggerHaptic();
          }}
          style={[s.plusBtn, { backgroundColor: colors.primary }]}
        >
          <MaterialCommunityIcons name="plus" size={20} color={colors.white} />
        </Pressable>

        <Pressable
          onPress={() => {
            triggerHaptic();
          }}
          style={s.composerActionIconBtn}
          accessibilityLabel="Share a file"
        >
          <MaterialCommunityIcons name="paperclip" size={22} color={colors.muted} />
        </Pressable>

        <Pressable
          onPress={() => {
            triggerHaptic();
          }}
          style={s.composerActionIconBtn}
          accessibilityLabel="Record voice note"
        >
          <MaterialCommunityIcons name="microphone-outline" size={22} color={colors.muted} />
        </Pressable>

        <View style={[s.inputWrap, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Type a message..."
            placeholderTextColor={colors.muted}
            style={[s.input, { color: colors.text }]}
            multiline
            maxLength={2000}
            returnKeyType="default"
            onSubmitEditing={sendMessage}
            blurOnSubmit={false}
          />
        </View>

        <Pressable
          onPress={sendMessage}
          disabled={!body.trim() || sending}
          style={[
            s.sendBtn,
            {
              backgroundColor: colors.primary,
              opacity: body.trim() ? 1 : 0.6,
            },
          ]}
        >
          {sending ? (
            <ActivityIndicator size={16} color={colors.white} />
          ) : (
            <MaterialCommunityIcons
              name="send"
              size={18}
              color={colors.white}
              style={{ marginLeft: 2 }}
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
  listContent: { padding: spacing.md, gap: 10, paddingBottom: spacing.sm },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginVertical: 2,
  },
  avatarCol: {
    width: 32,
    marginBottom: 2,
  },
  avatarColRight: {
    width: 32,
    marginBottom: 2,
  },
  avatarImg: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  placeholderAvatar: {
    alignItems: "center",
    justifyContent: "center",
  },
  bubbleBody: {
    maxWidth: "76%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 3,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  senderName: { fontSize: 12, fontWeight: "700", marginBottom: 2 },
  msgText: { fontSize: 15, lineHeight: 21 },
  fileCardModern: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    marginVertical: 4,
    minWidth: 200,
  },
  fileIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  fileNameModern: {
    fontSize: 13,
    fontWeight: "700",
  },
  fileSizeModern: {
    fontSize: 11,
    fontWeight: "500",
  },
  fileDownloadCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 2,
  },
  msgTime: { fontSize: 10 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  plusBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  composerActionIconBtn: {
    padding: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  inputWrap: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 14,
    minHeight: 40,
    maxHeight: 120,
    justifyContent: "center",
  },
  input: {
    fontSize: 15,
    paddingVertical: Platform.OS === "ios" ? 8 : 6,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
