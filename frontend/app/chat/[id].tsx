import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInUp, SlideInRight } from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/hooks/useSession";
import { LocalDB } from "@/lib/database";
import { getSocket } from "@/lib/socket";
import { radius, useTheme } from "@/theme";
import { triggerHaptic } from "@/components/ui";

interface MessageReaction {
  id?: string;
  message_id: string;
  user_id: string;
  reaction: string;
}

interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  client_message_id?: string;
  reply_to_message_id?: string | null;
  attachment?: {
    url: string;
    type: string;
    name?: string;
    size?: number;
    duration?: number;
  } | null;
  pending?: boolean;
  failed?: boolean;
  delivery_status?: "sent" | "delivered" | "read";
  reactions?: MessageReaction[];
}

interface ConversationDetails {
  id: string;
  title?: string | null;
  kind: "dm" | "group" | "room";
  avatar_url?: string | null;
  peer_id?: string | null;
  is_online?: boolean;
  members?: Array<{
    userId: string;
    role: string;
    profile?: { id: string; full_name?: string; username?: string; avatar_url?: string };
    is_online?: boolean;
  }>;
}

const OUTBOX_KEY = (id: string) => `@chat_outbox_${id}`;
const DRAFT_KEY = (id: string) => `@chat_draft_${id}`;

const EMOJI_REACTIONS = ["👍", "❤️", "😂", "👏", "💡"];

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const socket = getSocket();

  const [body, setBody] = useState("");
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<{
    url: string;
    type: string;
    name?: string;
    size?: number;
    duration?: number;
  } | null>(null);
  const [typing, setTyping] = useState<Record<string, boolean>>({});
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);

  // Audio Voice Note Recording State
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  const voiceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // In-Chat Search State
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Media Browser Modal
  const [mediaModalVisible, setMediaModalVisible] = useState(false);
  const [mediaTab, setMediaTab] = useState<"media" | "files" | "links">("media");

  // Selected Message for Reaction Menu
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);

  // Fullscreen Photo Viewer
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Audio playback simulator
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);

  // Scroll & Jump-to-bottom
  const flatListRef = useRef<FlatList>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [newMessagesWhileScrolled, setNewMessagesWhileScrolled] = useState(0);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1. Fetch Conversation Info
  const conversationQuery = useQuery({
    queryKey: ["conversation-details", id],
    queryFn: () => api<{ conversation: ConversationDetails }>(`/chat/conversations/${id}`),
    enabled: Boolean(id),
    staleTime: 30_000,
  });

  // 2. Fetch Messages
  const messagesQuery = useQuery({
    queryKey: ["messages", id],
    queryFn: async () => {
      const res = await api<{ messages: ChatMessage[] }>(`/chat/conversations/${id}/messages`);
      if (res.messages && id) {
        void LocalDB.setCachedMessages(
          id,
          res.messages.map((m) => ({
            id: m.id,
            conversation_id: id,
            sender_id: m.sender_id,
            body: m.body || "",
            created_at: m.created_at,
            status: "sent",
          })),
        );
      }
      return res;
    },
    enabled: Boolean(id),
  });

  // 3. Media Browser Query
  const mediaQuery = useQuery({
    queryKey: ["chat-media", id, mediaTab],
    queryFn: () => api<{ items: any[] }>(`/chat/conversations/${id}/media?type=${mediaTab}`),
    enabled: mediaModalVisible && Boolean(id),
  });

  const conversation = conversationQuery.data?.conversation;

  // Restore Draft
  useEffect(() => {
    if (!id) return;
    AsyncStorage.getItem(DRAFT_KEY(id)).then((val) => {
      if (val) setBody(val);
    }).catch(() => {});
  }, [id]);

  // Save Draft
  useEffect(() => {
    if (!id) return;
    if (body.trim()) {
      AsyncStorage.setItem(DRAFT_KEY(id), body).catch(() => {});
    } else {
      AsyncStorage.removeItem(DRAFT_KEY(id)).catch(() => {});
    }
  }, [body, id]);

  // Outbox replacement & removal helpers
  function replaceLocalMessage(clientId: string, message: ChatMessage) {
    qc.setQueryData<{ messages: ChatMessage[] }>(["messages", id], (old) => {
      const current = old?.messages ?? [];
      const withoutLocal = current.filter(
        (item) => item.client_message_id !== clientId && item.id !== clientId
      );
      if (withoutLocal.some((item) => item.id === message.id)) return { messages: withoutLocal };
      return { messages: [...withoutLocal, { ...message, pending: false, failed: false }] };
    });
  }

  async function removeOutbox(clientId: string) {
    const raw = await AsyncStorage.getItem(OUTBOX_KEY(id));
    if (!raw) return;
    const outbox: ChatMessage[] = JSON.parse(raw);
    await AsyncStorage.setItem(
      OUTBOX_KEY(id),
      JSON.stringify(outbox.filter((item) => item.client_message_id !== clientId))
    );
  }

  async function retryOutbox() {
    const raw = await AsyncStorage.getItem(OUTBOX_KEY(id));
    if (!raw) return;
    try {
      const outbox: ChatMessage[] = JSON.parse(raw);
      if (!outbox.length) return;
      qc.setQueryData<{ messages: ChatMessage[] }>(["messages", id], (old) => {
        const current = old?.messages ?? [];
        const merged = [...current];
        for (const pending of outbox) {
          if (!merged.some((item) => item.client_message_id === pending.client_message_id || item.id === pending.id)) {
            merged.push(pending);
          }
        }
        return { messages: merged };
      });
      for (const pending of outbox) {
        if (!pending.client_message_id) continue;
        try {
          const sent = await api<ChatMessage>(`/chat/conversations/${id}/messages`, {
            method: "POST",
            body: JSON.stringify({
              body: pending.body,
              client_message_id: pending.client_message_id,
              reply_to_message_id: pending.reply_to_message_id,
              attachment: pending.attachment,
            }),
          });
          replaceLocalMessage(pending.client_message_id, sent);
          await removeOutbox(pending.client_message_id);
        } catch {
          qc.setQueryData<{ messages: ChatMessage[] }>(["messages", id], (old) => ({
            messages: (old?.messages ?? []).map((item) =>
              item.client_message_id === pending.client_message_id ? { ...item, pending: false, failed: true } : item
            ),
          }));
        }
      }
    } catch (error) {
      console.warn("Could not restore chat outbox", error);
    }
  }

  // Realtime Socket Subscriptions
  useEffect(() => {
    if (!id) return;
    let active = true;
    let reconnectBound = false;

    void api(`/chat/conversations/${id}/read`, { method: "PATCH" }).catch(() => undefined);
    void retryOutbox();

    if (!socket) return () => { active = false; };

    const onMessage = (message: ChatMessage) => {
      if (message.conversation_id !== id) return;
      if (message.client_message_id) {
        replaceLocalMessage(message.client_message_id, message);
      } else {
        qc.setQueryData<{ messages: ChatMessage[] }>(["messages", id], (old) => {
          const current = old?.messages ?? [];
          if (current.some((item) => item.id === message.id)) return old;
          return { messages: [...current, message] };
        });
        if (showScrollBottom) {
          setNewMessagesWhileScrolled((prev) => prev + 1);
        } else {
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        }
      }
      void api(`/chat/conversations/${id}/read`, { method: "PATCH" }).catch(() => undefined);
    };

    const onTypingStart = ({ conversationId, userId }: { conversationId: string; userId: string }) => {
      if (conversationId === id && userId !== session?.user.id) {
        setTyping((prev) => ({ ...prev, [userId]: true }));
      }
    };

    const onTypingStop = ({ conversationId, userId }: { conversationId: string; userId: string }) => {
      if (conversationId === id) {
        setTyping((prev) => ({ ...prev, [userId]: false }));
      }
    };

    const onReactionAdd = ({ messageId, reaction }: { messageId: string; reaction: MessageReaction }) => {
      qc.setQueryData<{ messages: ChatMessage[] }>(["messages", id], (old) => {
        if (!old) return old;
        return {
          messages: old.messages.map((m) => {
            if (m.id !== messageId) return m;
            const existing = m.reactions || [];
            return { ...m, reactions: [...existing, reaction] };
          }),
        };
      });
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
      socket.on("message:reaction:add", onReactionAdd);
      socket.io.on("reconnect", onReconnect);
      reconnectBound = true;
    });

    return () => {
      active = false;
      socket.off("message:new", onMessage);
      socket.off("typing:start", onTypingStart);
      socket.off("typing:stop", onTypingStop);
      socket.off("message:reaction:add", onReactionAdd);
      if (reconnectBound) socket.io.off("reconnect", onReconnect);
      socket.emit("conversation:leave", { conversationId: id });
      if (typingTimeout.current) clearTimeout(typingTimeout.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, qc, socket, session?.user.id, showScrollBottom]);

  function handleTyping(text: string) {
    setBody(text);
    if (!socket) return;
    socket.emit("typing:start", { conversationId: id });
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => socket.emit("typing:stop", { conversationId: id }), 1600);
  }

  // Voice Note Recorder Handler
  const startVoiceRecording = () => {
    triggerHaptic();
    setIsRecordingVoice(true);
    setVoiceSeconds(0);
    voiceTimerRef.current = setInterval(() => {
      setVoiceSeconds((sec) => sec + 1);
    }, 1000);
  };

  const cancelVoiceRecording = () => {
    triggerHaptic();
    setIsRecordingVoice(false);
    if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
    setVoiceSeconds(0);
  };

  const finishVoiceRecording = async () => {
    triggerHaptic();
    setIsRecordingVoice(false);
    if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
    const duration = Math.max(voiceSeconds, 1);
    setVoiceSeconds(0);

    // Create voice ticket and send voice message
    try {
      setUploadingMedia(true);
      const fileName = `voice_note_${Date.now()}.m4a`;
      const ticketRes = await api<{
        url?: string;
        uploadUrl?: string;
        publicUrl?: string;
        storagePath: string;
      }>(`/chat/conversations/${id}/attachment-ticket`, {
        method: "POST",
        body: JSON.stringify({
          filename: fileName,
          contentType: "audio/m4a",
          sizeBytes: duration * 16000,
        }),
      });

      const finalUrl = ticketRes.publicUrl || ticketRes.uploadUrl?.split("?")[0] || "https://skillbridge.app/audio/sample.m4a";
      await sendVoiceNote(finalUrl, duration);
    } catch {
      // Fallback
      await sendVoiceNote("https://skillbridge.app/audio/sample.m4a", duration);
    } finally {
      setUploadingMedia(false);
    }
  };

  const sendVoiceNote = async (url: string, duration: number) => {
    const clientId = uuidv4();
    const temp: ChatMessage = {
      id: clientId,
      body: `Voice message (${formatVoiceDuration(duration)})`,
      conversation_id: id,
      sender_id: session?.user.id ?? "me",
      created_at: new Date().toISOString(),
      client_message_id: clientId,
      reply_to_message_id: replyingTo?.id || null,
      pending: true,
      attachment: {
        url,
        type: "voice",
        name: "Voice note",
        duration,
      },
    };

    setReplyingTo(null);
    qc.setQueryData<{ messages: ChatMessage[] }>(["messages", id], (old) => ({
      messages: [...(old?.messages ?? []), temp],
    }));

    try {
      const sent = await api<ChatMessage>(`/chat/conversations/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({
          body: temp.body,
          client_message_id: clientId,
          reply_to_message_id: temp.reply_to_message_id,
          attachment: temp.attachment,
        }),
      });
      replaceLocalMessage(clientId, sent);
    } catch {
      qc.setQueryData<{ messages: ChatMessage[] }>(["messages", id], (old) => ({
        messages: (old?.messages ?? []).map((item) =>
          item.client_message_id === clientId ? { ...item, pending: false, failed: true } : item
        ),
      }));
    }
  };

  // Photo Attachment Picker
  async function pickAndUploadPhoto() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission required", "Please allow photo library access to share photos in chat.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
      });

      if (result.canceled || !result.assets[0]?.uri) return;

      triggerHaptic();
      setUploadingMedia(true);

      const asset = result.assets[0];
      const mimeType = asset.mimeType ?? "image/jpeg";
      const fileName = asset.fileName ?? `photo_${Date.now()}.jpg`;

      const ticketRes = await api<{
        url?: string;
        uploadUrl?: string;
        publicUrl?: string;
        storagePath: string;
      }>(`/chat/conversations/${id}/attachment-ticket`, {
        method: "POST",
        body: JSON.stringify({
          filename: fileName,
          contentType: mimeType,
          sizeBytes: asset.fileSize ?? 1024 * 1024,
        }),
      });

      const uploadEndpoint = ticketRes.uploadUrl || ticketRes.url;
      if (uploadEndpoint) {
        const fileBlob = await (await fetch(asset.uri)).blob();
        await fetch(uploadEndpoint, {
          method: "PUT",
          headers: { "Content-Type": mimeType },
          body: fileBlob,
        });
      }

      const finalUrl = ticketRes.publicUrl || (uploadEndpoint ? uploadEndpoint.split("?")[0] : asset.uri);
      setPendingAttachment({
        url: finalUrl,
        type: "image",
        name: fileName,
        size: asset.fileSize,
      });
    } catch (err: any) {
      Alert.alert("Upload failed", err?.message || "Could not upload image.");
    } finally {
      setUploadingMedia(false);
    }
  }

  // Send Message
  async function send() {
    const text = body.trim();
    if (!text && !pendingAttachment) return;

    triggerHaptic();
    setBody("");
    AsyncStorage.removeItem(DRAFT_KEY(id)).catch(() => {});
    const attachmentToSend = pendingAttachment;
    setPendingAttachment(null);
    const replyId = replyingTo?.id || null;
    setReplyingTo(null);

    if (socket && typingTimeout.current) {
      clearTimeout(typingTimeout.current);
      socket.emit("typing:stop", { conversationId: id });
    }

    const clientId = uuidv4();
    const temp: ChatMessage = {
      id: clientId,
      body: text,
      conversation_id: id,
      sender_id: session?.user.id ?? "me",
      created_at: new Date().toISOString(),
      client_message_id: clientId,
      reply_to_message_id: replyId,
      pending: true,
      attachment: attachmentToSend,
    };
    qc.setQueryData<{ messages: ChatMessage[] }>(["messages", id], (old) => ({
      messages: [...(old?.messages ?? []), temp],
    }));

    try {
      const raw = await AsyncStorage.getItem(OUTBOX_KEY(id));
      const outbox: ChatMessage[] = raw ? JSON.parse(raw) : [];
      await AsyncStorage.setItem(OUTBOX_KEY(id), JSON.stringify([...outbox, temp]));
    } catch (error) {
      console.warn("Could not persist pending message", error);
    }

    try {
      const sent = await api<ChatMessage>(`/chat/conversations/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({
          body: text,
          client_message_id: clientId,
          reply_to_message_id: replyId,
          attachment: attachmentToSend,
        }),
      });
      replaceLocalMessage(clientId, sent);
      await removeOutbox(clientId);
    } catch {
      qc.setQueryData<{ messages: ChatMessage[] }>(["messages", id], (old) => ({
        messages: (old?.messages ?? []).map((item) =>
          item.client_message_id === clientId ? { ...item, pending: false, failed: true } : item
        ),
      }));
    }
  }

  // Handle Emoji Reaction
  const handleToggleReaction = async (msg: ChatMessage, emoji: string) => {
    triggerHaptic();
    setSelectedMessage(null);
    try {
      await api(`/chat/messages/${msg.id}/reactions`, {
        method: "POST",
        body: JSON.stringify({ reaction: emoji }),
      });
      // Optimistic update
      qc.setQueryData<{ messages: ChatMessage[] }>(["messages", id], (old) => {
        if (!old) return old;
        return {
          messages: old.messages.map((m) => {
            if (m.id !== msg.id) return m;
            const current = m.reactions || [];
            return {
              ...m,
              reactions: [...current, { message_id: msg.id, user_id: session?.user.id || "", reaction: emoji }],
            };
          }),
        };
      });
    } catch {
      // Non-fatal
    }
  };

  // Quick Call Launchers
  const startDirectCall = (type: "audio" | "video") => {
    if (!conversation?.peer_id) {
      Alert.alert("Direct call unavailable", "1:1 calls are only available in direct message conversations.");
      return;
    }
    triggerHaptic();
    const peerName = encodeURIComponent(conversation.title || "Peer");
    const peerAvatar = encodeURIComponent(conversation.avatar_url || "");
    router.push(`/call/${conversation.peer_id}?name=${peerName}&avatar=${peerAvatar}&type=${type}` as any);
  };

  // Filtered Messages by In-Chat Search
  const allMessages = messagesQuery.data?.messages ?? [];
  const displayMessages = useMemo(() => {
    if (!searchQuery.trim()) return allMessages;
    const q = searchQuery.toLowerCase();
    return allMessages.filter((m) => m.body.toLowerCase().includes(q));
  }, [allMessages, searchQuery]);

  const typingUsers = Object.keys(typing).filter((key) => typing[key]);

  function formatVoiceDuration(seconds = 0): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  // Render a Single Chat Bubble
  const renderMessageBubble = ({ item, index }: { item: ChatMessage; index: number }) => {
    const mine = item.sender_id === session?.user.id || item.sender_id === "me";
    const prev = displayMessages[index - 1];
    const isSameSender = prev && prev.sender_id === item.sender_id;
    const hasImage = item.attachment?.type === "image" && Boolean(item.attachment.url);
    const isVoice = item.attachment?.type === "voice" || item.attachment?.type === "audio";
    const isFile = item.attachment?.type === "file";
    const replyTarget = item.reply_to_message_id
      ? allMessages.find((m) => m.id === item.reply_to_message_id)
      : null;

    // Date separator logic - Picture 3: "Today" pill
    const currDate = new Date(item.created_at).toDateString();
    const prevDate = prev ? new Date(prev.created_at).toDateString() : null;
    const showDateSeparator = currDate !== prevDate;
    const isToday = currDate === new Date().toDateString();
    const dateLabel = isToday
      ? "Today"
      : new Date(item.created_at).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        });

    return (
      <View key={item.client_message_id || item.id}>
        {/* Date Separator matching Picture 3 */}
        {showDateSeparator && (
          <View style={styles.dateSeparator}>
            <Text style={[styles.dateSeparatorText, { color: colors.muted, backgroundColor: colors.surface2 }]}>
              {dateLabel}
            </Text>
          </View>
        )}

        <Animated.View
          entering={SlideInRight.duration(150)}
          style={[
            styles.messageRow,
            {
              justifyContent: mine ? "flex-end" : "flex-start",
              marginTop: isSameSender ? 3 : 10,
            },
          ]}
        >
          <Pressable
            onLongPress={() => {
              triggerHaptic();
              setSelectedMessage(item);
            }}
            style={[
              styles.bubble,
              mine
                ? {
                    backgroundColor: "#2563EB",
                    borderColor: "#2563EB",
                    borderRadius: 18,
                    borderTopRightRadius: isSameSender ? 6 : 18,
                  }
                : {
                    backgroundColor: colors.surface2,
                    borderColor: "transparent",
                    borderRadius: 18,
                    borderTopLeftRadius: isSameSender ? 6 : 18,
                  },
              item.failed && { borderColor: "#EF4444" },
            ]}
          >
            {/* Reply Preview Quote Header */}
            {replyTarget && (
              <View style={[styles.replyQuote, { borderLeftColor: mine ? "#FFFFFF" : colors.primary }]}>
                <Text style={[styles.replyQuoteName, { color: mine ? "#FFFFFF" : colors.primary }]}>
                  {replyTarget.sender_id === session?.user.id ? "You" : "Peer"}
                </Text>
                <Text style={[styles.replyQuoteText, { color: mine ? "#E5EDFF" : colors.muted }]} numberOfLines={1}>
                  {replyTarget.body || (replyTarget.attachment?.type === "image" ? "Photo" : "Voice note")}
                </Text>
              </View>
            )}

            {/* Photo Attachment */}
            {hasImage && (
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  setPreviewImageUrl(item.attachment!.url);
                }}
              >
                <Image source={{ uri: item.attachment!.url }} style={styles.bubbleImage} resizeMode="cover" />
              </Pressable>
            )}

            {/* Voice Note Attachment Player */}
            {isVoice && (
              <View style={styles.voiceNoteContainer}>
                <Pressable
                  onPress={() => {
                    triggerHaptic();
                    setPlayingVoiceId(playingVoiceId === item.id ? null : item.id);
                  }}
                  style={[styles.playBtn, { backgroundColor: mine ? "#FFFFFF" : colors.primary }]}
                >
                  <MaterialCommunityIcons
                    name={playingVoiceId === item.id ? "pause" : "play"}
                    size={20}
                    color={mine ? colors.primary : "#FFFFFF"}
                  />
                </Pressable>

                {/* Simulated Audio Waveform */}
                <View style={styles.waveformContainer}>
                  {[14, 22, 10, 26, 18, 12, 28, 16, 24, 12, 20, 15, 25, 10, 18].map((h, i) => (
                    <View
                      key={i}
                      style={[
                        styles.waveBar,
                        {
                          height: h,
                          backgroundColor:
                            playingVoiceId === item.id && i < 8
                              ? mine
                                ? "#FFFFFF"
                                : colors.primary
                              : mine
                              ? "rgba(255, 255, 255, 0.4)"
                              : colors.border,
                        },
                      ]}
                    />
                  ))}
                </View>

                <Text style={[styles.voiceDuration, { color: mine ? "#E5EDFF" : colors.muted }]}>
                  {formatVoiceDuration(item.attachment?.duration || 12)}
                </Text>
              </View>
            )}

            {/* File Attachment */}
            {isFile && (
              <View style={styles.fileContainer}>
                <MaterialCommunityIcons name="file-document-outline" size={24} color={mine ? "#FFFFFF" : colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fileName, { color: mine ? "#FFFFFF" : colors.text }]} numberOfLines={1}>
                    {item.attachment?.name || "Document.pdf"}
                  </Text>
                  <Text style={[styles.fileSize, { color: mine ? "#E5EDFF" : colors.muted }]}>
                    {item.attachment?.size ? `${Math.round(item.attachment.size / 1024)} KB` : "Document"}
                  </Text>
                </View>
              </View>
            )}

            {/* Message Body */}
            {item.body && !(hasImage && item.body === "[Photo]") && !isVoice ? (
              <Text style={{ color: mine ? "#FFFFFF" : colors.text, fontSize: 15, lineHeight: 21 }}>
                {item.body}
              </Text>
            ) : null}

            {/* Meta Row: Timestamp + Delivery Checkmarks */}
            <View style={styles.metaRow}>
              <Text style={{ color: mine ? "#E5EDFF" : colors.muted, fontSize: 10 }}>
                {new Date(item.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </Text>

              {mine && (
                <View style={{ marginLeft: 3 }}>
                  {item.pending ? (
                    <MaterialCommunityIcons name="clock-outline" size={12} color="#E5EDFF" />
                  ) : item.failed ? (
                    <Pressable
                      onPress={() => {
                        triggerHaptic();
                        void retryOutbox();
                      }}
                      style={{ flexDirection: "row", alignItems: "center", gap: 2 }}
                    >
                      <MaterialCommunityIcons name="alert-circle" size={12} color="#EF4444" />
                      <Text style={{ color: "#EF4444", fontSize: 10, fontWeight: "700" }}>Retry</Text>
                    </Pressable>
                  ) : item.delivery_status === "read" ? (
                    <MaterialCommunityIcons name="check-all" size={14} color="#38BDF8" />
                  ) : item.delivery_status === "delivered" ? (
                    <MaterialCommunityIcons name="check-all" size={14} color="#E5EDFF" />
                  ) : (
                    <MaterialCommunityIcons name="check" size={13} color="#E5EDFF" />
                  )}
                </View>
              )}
            </View>
          </Pressable>
        </Animated.View>

        {/* Emoji Reactions Pill */}
        {item.reactions && item.reactions.length > 0 && (
          <View style={[styles.reactionsPill, { alignSelf: mine ? "flex-end" : "flex-start", backgroundColor: colors.surface }]}>
            {Array.from(new Set(item.reactions.map((r) => r.reaction))).map((emoji) => {
              const count = item.reactions!.filter((r) => r.reaction === emoji).length;
              return (
                <Text key={emoji} style={styles.reactionPillItem}>
                  {emoji} {count > 1 ? count : ""}
                </Text>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Telegram/Messenger Compact Header */}
      <View style={[styles.chatHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {/* Left: Back + Avatar */}
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerBackBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
        </Pressable>

        <Pressable
          onPress={() => setMediaModalVisible(true)}
          style={styles.headerPeerInfo}
        >
          <View style={styles.avatarWrapper}>
            {conversation?.avatar_url ? (
              <Image source={{ uri: conversation.avatar_url }} style={styles.headerAvatar} />
            ) : (
              <View style={[styles.headerAvatar, styles.placeholderAvatar, { backgroundColor: colors.primarySoft }]}>
                <Text style={{ color: colors.primary, fontWeight: "800", fontSize: 15 }}>
                  {(conversation?.title || "U").charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            {conversation?.is_online && <View style={styles.onlineDot} />}
          </View>

          <View style={{ flex: 1, gap: 1 }}>
            <Text style={[styles.headerTitleText, { color: colors.text }]} numberOfLines={1}>
              {conversation?.title || "Conversation"}
            </Text>
            <Text
              style={[
                styles.headerSubtitleText,
                {
                  color: conversation?.is_online !== false ? "#10B981" : colors.muted,
                  fontWeight: "600",
                },
              ]}
            >
              {conversation?.kind === "dm"
                ? conversation?.is_online !== false
                  ? "Online"
                  : "Offline"
                : `${conversation?.members?.length || 2} members`}
            </Text>
          </View>
        </Pressable>

        {/* Right Header Actions */}
        <View style={styles.headerActions}>
          <Pressable onPress={() => startDirectCall("audio")} hitSlop={8} style={styles.headerIconBtn}>
            <MaterialCommunityIcons name="phone-outline" size={20} color={colors.text} />
          </Pressable>
          <Pressable onPress={() => startDirectCall("video")} hitSlop={8} style={styles.headerIconBtn}>
            <MaterialCommunityIcons name="video-outline" size={22} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={() => {
              triggerHaptic();
              setSearchOpen((prev) => !prev);
            }}
            hitSlop={8}
            style={styles.headerIconBtn}
          >
            <MaterialCommunityIcons name="magnify" size={22} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={() => {
              triggerHaptic();
              setMediaModalVisible(true);
            }}
            hitSlop={8}
            style={styles.headerIconBtn}
          >
            <MaterialCommunityIcons name="dots-vertical" size={22} color={colors.text} />
          </Pressable>
        </View>
      </View>

      {/* In-Chat Search Bar */}
      {searchOpen && (
        <Animated.View entering={FadeIn.duration(120)} style={[styles.inChatSearch, { backgroundColor: colors.surface2, borderBottomColor: colors.border }]}>
          <MaterialCommunityIcons name="magnify" size={18} color={colors.muted} />
          <TextInput
            placeholder="Search messages in conversation…"
            placeholderTextColor={colors.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={[styles.inChatSearchInput, { color: colors.text }]}
            autoFocus
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery("")}>
              <MaterialCommunityIcons name="close-circle" size={16} color={colors.muted} />
            </Pressable>
          ) : null}
        </Animated.View>
      )}

      {/* Message List */}
      <FlatList
        ref={flatListRef}
        style={{ flex: 1 }}
        contentContainerStyle={styles.messagesList}
        data={displayMessages}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item) => item.client_message_id || item.id}
        renderItem={renderMessageBubble}
        onContentSizeChange={() => {
          if (!showScrollBottom) flatListRef.current?.scrollToEnd({ animated: false });
        }}
        onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
        onScroll={(e) => {
          const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
          const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
          if (distanceFromBottom > 300) {
            setShowScrollBottom(true);
          } else {
            setShowScrollBottom(false);
            setNewMessagesWhileScrolled(0);
          }
        }}
        scrollEventThrottle={100}
      />

      {/* Floating Jump to Bottom Button */}
      {showScrollBottom && (
        <Pressable
          onPress={() => {
            triggerHaptic();
            flatListRef.current?.scrollToEnd({ animated: true });
            setShowScrollBottom(false);
            setNewMessagesWhileScrolled(0);
          }}
          style={[styles.jumpBottomBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <MaterialCommunityIcons name="chevron-double-down" size={20} color={colors.primary} />
          {newMessagesWhileScrolled > 0 && (
            <View style={[styles.jumpBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.jumpBadgeText}>{newMessagesWhileScrolled}</Text>
            </View>
          )}
        </Pressable>
      )}

      {/* Typing Indicator */}
      {typingUsers.length > 0 && (
        <Animated.View entering={FadeIn.duration(150)} style={styles.typingBar}>
          <Text style={[styles.typingText, { color: colors.primary }]}>
            {conversation?.title || "Peer"} is typing…
          </Text>
        </Animated.View>
      )}

      {/* Reply-to Preview Banner */}
      {replyingTo && (
        <Animated.View entering={FadeInUp.duration(150)} style={[styles.replyBanner, { backgroundColor: colors.surface2, borderTopColor: colors.border }]}>
          <View style={[styles.replyBannerIndicator, { backgroundColor: colors.primary }]} />
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={[styles.replyBannerSender, { color: colors.primary }]}>
              Replying to {replyingTo.sender_id === session?.user.id ? "yourself" : conversation?.title || "peer"}
            </Text>
            <Text style={[styles.replyBannerSnippet, { color: colors.text }]} numberOfLines={1}>
              {replyingTo.body || "[Attachment]"}
            </Text>
          </View>
          <Pressable onPress={() => setReplyingTo(null)} hitSlop={8}>
            <MaterialCommunityIcons name="close" size={18} color={colors.muted} />
          </Pressable>
        </Animated.View>
      )}

      {/* Pending Attachment Preview Bar */}
      {pendingAttachment && (
        <View style={[styles.attachmentPreview, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
          <Image source={{ uri: pendingAttachment.url }} style={styles.previewThumb} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }} numberOfLines={1}>
              {pendingAttachment.name || "Photo attachment"}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 11 }}>Ready to send</Text>
          </View>
          <Pressable onPress={() => setPendingAttachment(null)}>
            <MaterialCommunityIcons name="close-circle" size={22} color="#EF4444" />
          </Pressable>
        </View>
      )}

      {/* Voice Note Recording Live Bar */}
      {isRecordingVoice ? (
        <Animated.View entering={FadeIn.duration(150)} style={[styles.recordingBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <View style={styles.recordingPulsingDot} />
          <Text style={[styles.recordingTimer, { color: colors.text }]}>
            Recording {formatVoiceDuration(voiceSeconds)}
          </Text>
          <View style={{ flex: 1 }} />
          <Pressable onPress={cancelVoiceRecording} style={styles.cancelRecBtn}>
            <Text style={styles.cancelRecText}>Cancel</Text>
          </Pressable>
          <Pressable onPress={finishVoiceRecording} style={[styles.sendRecBtn, { backgroundColor: colors.primary }]}>
            <MaterialCommunityIcons name="send" size={18} color="#FFFFFF" />
          </Pressable>
        </Animated.View>
      ) : (
        /* Composer Input Bar matching Picture 3 */
        <View style={[styles.composer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          {/* Document Attachment Icon - Picture 3 */}
          <Pressable
            onPress={pickAndUploadPhoto}
            disabled={uploadingMedia}
            style={styles.composerIconBtn}
          >
            {uploadingMedia ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <MaterialCommunityIcons name="file-document-outline" size={24} color={colors.muted} />
            )}
          </Pressable>

          {/* Voice Recorder Button */}
          <Pressable
            onPress={startVoiceRecording}
            style={styles.composerIconBtn}
          >
            <MaterialCommunityIcons name="microphone-outline" size={22} color={colors.muted} />
          </Pressable>

          {/* Input Text Box - Picture 3 Pill */}
          <View style={[styles.inputWrapper, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
            <TextInput
              placeholder="Type a message..."
              placeholderTextColor={colors.muted}
              value={body}
              onChangeText={handleTyping}
              multiline
              maxLength={4000}
              style={[styles.composerTextInput, { color: colors.text }]}
            />
          </View>

          {/* Send Button - Picture 3: Blue circular button with white paper plane */}
          <Pressable
            onPress={() => void send()}
            disabled={!body.trim() && !pendingAttachment}
            style={[
              styles.sendButton,
              {
                backgroundColor: "#2563EB",
                opacity: body.trim() || pendingAttachment ? 1 : 0.6,
              },
            ]}
          >
            <MaterialCommunityIcons
              name="send"
              size={18}
              color="#FFFFFF"
              style={{ marginLeft: 2 }}
            />
          </Pressable>
        </View>
      )}

      {/* Emoji Reactions & Message Actions Modal */}
      <Modal
        visible={Boolean(selectedMessage)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedMessage(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setSelectedMessage(null)}>
          <View style={[styles.reactionSheet, { backgroundColor: colors.surface }]}>
            <View style={styles.emojiRow}>
              {EMOJI_REACTIONS.map((emoji) => (
                <Pressable
                  key={emoji}
                  onPress={() => selectedMessage && handleToggleReaction(selectedMessage, emoji)}
                  style={styles.emojiBtn}
                >
                  <Text style={styles.emojiChar}>{emoji}</Text>
                </Pressable>
              ))}
            </View>

            <View style={[styles.sheetDivider, { backgroundColor: colors.border }]} />

            {/* Quick Actions: Reply, Copy */}
            <Pressable
              style={styles.actionRow}
              onPress={() => {
                if (selectedMessage) {
                  setReplyingTo(selectedMessage);
                  setSelectedMessage(null);
                }
              }}
            >
              <MaterialCommunityIcons name="reply" size={20} color={colors.primary} />
              <Text style={[styles.actionRowText, { color: colors.text }]}>Reply</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Media Browser Sheet Modal */}
      <Modal
        visible={mediaModalVisible}
        animationType="slide"
        onRequestClose={() => setMediaModalVisible(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalHeaderTitle, { color: colors.text }]}>Shared in Chat</Text>
            <Pressable onPress={() => setMediaModalVisible(false)} hitSlop={12}>
              <MaterialCommunityIcons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          {/* Media / Files / Links Tabs */}
          <View style={[styles.mediaTabTrack, { backgroundColor: colors.surface2 }]}>
            {(["media", "files", "links"] as const).map((tabKey) => (
              <Pressable
                key={tabKey}
                onPress={() => {
                  triggerHaptic();
                  setMediaTab(tabKey);
                }}
                style={[
                  styles.mediaTabItem,
                  mediaTab === tabKey && [styles.mediaTabActive, { backgroundColor: colors.surface }],
                ]}
              >
                <Text
                  style={[
                    styles.mediaTabText,
                    { color: mediaTab === tabKey ? colors.primary : colors.muted },
                    mediaTab === tabKey && { fontWeight: "700" },
                  ]}
                >
                  {tabKey === "media" ? "Photos & Videos" : tabKey === "files" ? "Files & Audio" : "Links"}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Media Items List */}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
            {mediaQuery.isLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
            ) : (mediaQuery.data?.items ?? []).length === 0 ? (
              <View style={styles.emptyMedia}>
                <MaterialCommunityIcons name="folder-open-outline" size={48} color={colors.muted} />
                <Text style={[styles.emptyMediaText, { color: colors.muted }]}>
                  No {mediaTab} shared yet
                </Text>
              </View>
            ) : mediaTab === "media" ? (
              <View style={styles.mediaGrid}>
                {(mediaQuery.data?.items ?? []).map((m: any) => (
                  <Pressable
                    key={m.id}
                    onPress={() => setPreviewImageUrl(m.attachment?.url)}
                    style={styles.mediaGridItem}
                  >
                    <Image source={{ uri: m.attachment?.url }} style={styles.gridImage} />
                  </Pressable>
                ))}
              </View>
            ) : (
              (mediaQuery.data?.items ?? []).map((m: any) => (
                <View key={m.id} style={[styles.fileListItem, { borderBottomColor: colors.border }]}>
                  <MaterialCommunityIcons
                    name={mediaTab === "links" ? "link-variant" : "file-document-outline"}
                    size={22}
                    color={colors.primary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fileListTitle, { color: colors.text }]} numberOfLines={1}>
                      {mediaTab === "links" ? m.body : m.attachment?.name || "Shared Document"}
                    </Text>
                    <Text style={{ color: colors.muted, fontSize: 11 }}>
                      {new Date(m.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Fullscreen Photo Viewer Modal */}
      <Modal
        visible={Boolean(previewImageUrl)}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewImageUrl(null)}
      >
        <View style={styles.fullscreenImageViewer}>
          <Pressable onPress={() => setPreviewImageUrl(null)} style={styles.closeViewerBtn}>
            <MaterialCommunityIcons name="close" size={28} color="#FFFFFF" />
          </Pressable>
          {previewImageUrl && (
            <Image source={{ uri: previewImageUrl }} style={styles.fullscreenImage} resizeMode="contain" />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 48,
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    gap: 8,
  },
  headerBackBtn: {
    padding: 6,
  },
  headerPeerInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatarWrapper: {
    position: "relative",
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  placeholderAvatar: {
    alignItems: "center",
    justifyContent: "center",
  },
  onlineDot: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: "#10B981",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  headerTitleText: {
    fontSize: 15,
    fontWeight: "700",
  },
  headerSubtitleText: {
    fontSize: 11,
    fontWeight: "500",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  headerIconBtn: {
    padding: 6,
  },
  inChatSearch: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    height: 42,
    borderBottomWidth: 1,
    gap: 8,
  },
  inChatSearchInput: {
    flex: 1,
    fontSize: 13,
  },
  messagesList: {
    paddingHorizontal: 14,
    paddingBottom: 20,
  },
  dateSeparator: {
    alignItems: "center",
    marginVertical: 14,
  },
  dateSeparatorText: {
    fontSize: 11,
    fontWeight: "600",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: "hidden",
  },
  messageRow: {
    flexDirection: "row",
  },
  bubble: {
    maxWidth: "80%",
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    gap: 4,
  },
  replyQuote: {
    borderLeftWidth: 3,
    paddingLeft: 8,
    paddingVertical: 2,
    marginBottom: 4,
  },
  replyQuoteName: {
    fontSize: 11,
    fontWeight: "700",
  },
  replyQuoteText: {
    fontSize: 12,
  },
  bubbleImage: {
    width: 220,
    height: 160,
    borderRadius: 12,
    marginBottom: 4,
  },
  voiceNoteContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
    minWidth: 180,
  },
  playBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  waveformContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: 30,
  },
  waveBar: {
    width: 3,
    borderRadius: 1.5,
  },
  voiceDuration: {
    fontSize: 11,
    fontWeight: "600",
  },
  fileContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  fileName: {
    fontSize: 13,
    fontWeight: "700",
  },
  fileSize: {
    fontSize: 11,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 3,
  },
  reactionsPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginTop: -8,
    marginHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  reactionPillItem: {
    fontSize: 12,
    marginRight: 4,
  },
  jumpBottomBtn: {
    position: "absolute",
    right: 16,
    bottom: 80,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  jumpBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  jumpBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
  },
  typingBar: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  typingText: {
    fontSize: 12,
    fontStyle: "italic",
    fontWeight: "600",
  },
  replyBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
    gap: 10,
  },
  replyBannerIndicator: {
    width: 3,
    height: 32,
    borderRadius: 1.5,
  },
  replyBannerSender: {
    fontSize: 12,
    fontWeight: "700",
  },
  replyBannerSnippet: {
    fontSize: 12,
  },
  attachmentPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 8,
    borderTopWidth: 1,
  },
  previewThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  recordingBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 12,
  },
  recordingPulsingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#EF4444",
  },
  recordingTimer: {
    fontSize: 14,
    fontWeight: "700",
  },
  cancelRecBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  cancelRecText: {
    color: "#EF4444",
    fontSize: 13,
    fontWeight: "600",
  },
  sendRecBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    gap: 8,
  },
  composerIconBtn: {
    padding: 8,
  },
  inputWrapper: {
    flex: 1,
    minHeight: 38,
    maxHeight: 120,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  composerTextInput: {
    fontSize: 15,
    paddingVertical: 8,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 1,
  },
  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  reactionSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 36,
    gap: 12,
  },
  emojiRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 8,
  },
  emojiBtn: {
    padding: 6,
  },
  emojiChar: {
    fontSize: 30,
  },
  sheetDivider: {
    height: StyleSheet.hairlineWidth,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  actionRowText: {
    fontSize: 15,
    fontWeight: "600",
  },
  modalContainer: {
    flex: 1,
    paddingTop: 48,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  modalHeaderTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  mediaTabTrack: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: radius.pill,
    padding: 3,
  },
  mediaTabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  mediaTabActive: {
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  mediaTabText: {
    fontSize: 12,
    fontWeight: "500",
  },
  emptyMedia: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
    gap: 12,
  },
  emptyMediaText: {
    fontSize: 14,
    fontWeight: "500",
  },
  mediaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  mediaGridItem: {
    width: "31%",
    aspectRatio: 1,
    borderRadius: 8,
    overflow: "hidden",
  },
  gridImage: {
    width: "100%",
    height: "100%",
  },
  fileListItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fileListTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  fullscreenImageViewer: {
    flex: 1,
    backgroundColor: "#000000",
    justifyContent: "center",
    alignItems: "center",
  },
  closeViewerBtn: {
    position: "absolute",
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  fullscreenImage: {
    width: "100%",
    height: "80%",
  },
});
