import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInUp, SlideInRight } from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as WebBrowser from "expo-web-browser";
import { Audio } from "expo-av";
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";
import { api } from "@/lib/api";
import { optimizeImageForUpload, OPTIMIZATION_PRESETS } from "@/lib/imageOptimizer";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/hooks/useSession";
import { LocalDB } from "@/lib/database";
import { getSocket } from "@/lib/socket";
import { radius, useTheme } from "@/theme";
import { triggerHaptic } from "@/components/ui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUserPresence } from "@/features/presence/usePresence";

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
    /** Storage key for private-bucket files; used to mint a fresh signed read URL. */
    storagePath?: string;
  } | null;
  pending?: boolean;
  failed?: boolean;
  delivery_status?: "sent" | "delivered" | "read";
  reactions?: MessageReaction[];
}

interface ConversationMember {
  userId: string;
  role: "admin" | "member" | string;
  is_admin?: boolean;
  is_creator?: boolean;
  profile?: { id: string; full_name?: string; username?: string; avatar_url?: string; headline?: string };
  is_online?: boolean;
  created_at?: string;
}

interface ConversationDetails {
  id: string;
  title?: string | null;
  kind: "dm" | "group" | "room";
  avatar_url?: string | null;
  description?: string | null;
  created_by?: string | null;
  peer_id?: string | null;
  is_online?: boolean;
  is_admin?: boolean;
  my_role?: "admin" | "member" | string;
  members?: ConversationMember[];
}

const OUTBOX_KEY = (id: string) => `@chat_outbox_${id}`;
const DRAFT_KEY = (id: string) => `@chat_draft_${id}`;

const EMOJI_REACTIONS = ["👍", "❤️", "😂", "👏", "💡"];

/**
 * Mint a fresh signed read URL for a private attachment.
 * Attachments live in a private bucket, so the URL captured at upload time
 * expires (1h). Without this refresh, older photos/voice notes would render
 * as broken images once the signature lapsed.
 */
async function resolveAttachmentUrl(
  conversationId: string,
  storagePath: string,
  fallback: string,
): Promise<string> {
  try {
    // Route path is /attachments/:attachmentId/download but the server reads the
    // storage key from ?storagePath and ignores :attachmentId. Pass a constant
    // segment so storage keys containing "/" never need to live in the path.
    const res = await api<{ url: string }>(
      `/chat/conversations/${conversationId}/attachments/file/download?storagePath=${encodeURIComponent(storagePath)}`,
    );
    return res.url || fallback;
  } catch {
    return fallback;
  }
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [plusMenuVisible, setPlusMenuVisible] = useState(false);
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
    storagePath?: string;
  } | null>(null);
  const voiceRecordingRef = useRef<Audio.Recording | null>(null);
  const voiceSoundRef = useRef<Audio.Sound | null>(null);
  const [, setIsVoicePlaying] = useState(false);
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

  // Group Chat Management States
  const [groupInfoModalVisible, setGroupInfoModalVisible] = useState(false);
  const [addMembersModalVisible, setAddMembersModalVisible] = useState(false);
  const [memberActionMember, setMemberActionMember] = useState<ConversationMember | null>(null);
  const [editTitleModalVisible, setEditTitleModalVisible] = useState(false);
  const [newGroupTitle, setNewGroupTitle] = useState("");
  const [selectedNewMembers, setSelectedNewMembers] = useState<string[]>([]);
  const [addMemberSearch, setAddMemberSearch] = useState("");
  const [groupActionLoading, setGroupActionLoading] = useState(false);

  // 1. Fetch Conversation Info
  const conversationQuery = useQuery({
    queryKey: ["conversation-details", id],
    queryFn: () => api<{ conversation: ConversationDetails }>(`/chat/conversations/${id}`),
    enabled: Boolean(id),
    staleTime: 30_000,
  });

  // 1b. Fetch Connections for Adding Members
  const connectionsQuery = useQuery({
    queryKey: ["connections-contacts"],
    queryFn: () =>
      api<{ connections: Array<{ id: string; full_name?: string; username?: string; avatar_url?: string; headline?: string }> }>(
        "/connections"
      ),
    enabled: addMembersModalVisible,
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
  const isPeerOnline = useUserPresence(conversation?.peer_id, conversation?.is_online);

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

    const onMembersUpdated = (data: { conversationId: string }) => {
      if (data.conversationId === id) {
        qc.invalidateQueries({ queryKey: ["conversation-details", id] });
        qc.invalidateQueries({ queryKey: ["messages", id] });
      }
    };

    const onRoleUpdated = (data: { conversationId: string }) => {
      if (data.conversationId === id) {
        qc.invalidateQueries({ queryKey: ["conversation-details", id] });
      }
    };

    const onConversationUpdated = (data: { conversationId: string }) => {
      if (data.conversationId === id) {
        qc.invalidateQueries({ queryKey: ["conversation-details", id] });
      }
    };

    const onRemovedFromGroup = (data: { conversationId: string; userId: string }) => {
      if (data.conversationId === id && data.userId === session?.user.id) {
        Alert.alert("Removed from Group", "You have been removed from this group.", [
          { text: "OK", onPress: () => router.replace("/(tabs)/inbox") },
        ]);
      }
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
      socket.on("conversation:members_updated", onMembersUpdated);
      socket.on("conversation:role_updated", onRoleUpdated);
      socket.on("conversation:updated", onConversationUpdated);
      socket.on("chat:removed_from_group", onRemovedFromGroup);
      socket.io.on("reconnect", onReconnect);
      reconnectBound = true;
    });

    return () => {
      active = false;
      socket.off("message:new", onMessage);
      socket.off("typing:start", onTypingStart);
      socket.off("typing:stop", onTypingStop);
      socket.off("message:reaction:add", onReactionAdd);
      socket.off("conversation:members_updated", onMembersUpdated);
      socket.off("conversation:role_updated", onRoleUpdated);
      socket.off("conversation:updated", onConversationUpdated);
      socket.off("chat:removed_from_group", onRemovedFromGroup);
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

  // Voice Note Recorder Handler - real microphone capture via expo-av
  const startVoiceRecording = async () => {
    triggerHaptic();
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Permission required",
          "Please allow microphone access to send voice notes.",
        );
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });
      await recording.startAsync();
      voiceRecordingRef.current = recording;

      setIsRecordingVoice(true);
      setVoiceSeconds(0);
      voiceTimerRef.current = setInterval(() => {
        setVoiceSeconds((sec) => {
          // Stop automatically at 5 minutes to avoid unbounded recordings.
          if (sec + 1 >= 300) void finishVoiceRecording();
          return sec + 1;
        });
      }, 1000);
    } catch (err: any) {
      Alert.alert(
        "Could not start recording",
        err?.message || "Microphone is unavailable right now.",
      );
      voiceRecordingRef.current = null;
      setIsRecordingVoice(false);
    }
  };

  const cancelVoiceRecording = async () => {
    triggerHaptic();
    setIsRecordingVoice(false);
    if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
    setVoiceSeconds(0);

    const recording = voiceRecordingRef.current;
    voiceRecordingRef.current = null;
    if (recording) {
      try {
        await recording.stopAndUnloadAsync();
      } catch {
        // Recorder may already be stopped.
      }
    }
  };

  const finishVoiceRecording = async () => {
    triggerHaptic();
    setIsRecordingVoice(false);
    if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
    const duration = Math.max(voiceSeconds, 1);
    setVoiceSeconds(0);

    const recording = voiceRecordingRef.current;
    voiceRecordingRef.current = null;

    if (!recording) {
      Alert.alert("Nothing recorded", "Please try recording your voice note again.");
      return;
    }

    try {
      setUploadingMedia(true);

      // Stop the recorder and obtain the real captured file.
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      if (!uri) throw new Error("Recording file was not created.");

      const status = await recording.getStatusAsync();
      const measuredMs = "durationMillis" in status ? status.durationMillis : undefined;
      const realDuration = measuredMs ? Math.max(1, Math.round(measuredMs / 1000)) : duration;

      const fileName = `voice_note_${Date.now()}.m4a`;

      const ticketRes = await api<{
        url?: string;
        uploadUrl?: string;
        publicUrl?: string;
        signedUrl?: string;
        storagePath: string;
      }>(`/chat/conversations/${id}/attachment-ticket`, {
        method: "POST",
        body: JSON.stringify({
          filename: fileName,
          contentType: "audio/m4a",
          // Declared size must be >= 1; the server cap is 15MB.
          sizeBytes: 1024,
        }),
      });

      const uploadEndpoint = ticketRes.uploadUrl || ticketRes.url;
      if (!uploadEndpoint) throw new Error("Upload ticket did not include an upload URL.");

      const audioBlob = await (await fetch(uri)).blob();
      const putRes = await fetch(uploadEndpoint, {
        method: "PUT",
        headers: { "Content-Type": "audio/m4a" },
        body: audioBlob,
      });
      if (!putRes.ok) {
        throw new Error(`Voice upload failed (${putRes.status}).`);
      }

      const finalUrl = ticketRes.signedUrl || ticketRes.publicUrl;
      if (!finalUrl) throw new Error("Could not resolve a readable link for the voice note.");

      await sendVoiceNote(finalUrl, realDuration, ticketRes.storagePath);
    } catch (err: any) {
      // Never send a placeholder: a failed recording must surface, not lie.
      Alert.alert(
        "Voice note failed",
        err?.message || "Could not upload your voice note. Please try again.",
      );
    } finally {
      setUploadingMedia(false);
    }
  };

  const sendVoiceNote = async (url: string, duration: number, storagePath?: string) => {
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
        storagePath,
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

  // Generic File Attachment Picker (PDF / text / zip — matches backend allow-list).
  // Previously the composer only exposed a photo picker, so file sharing inside
  // chat was effectively unavailable despite backend + media-browser support.
  async function pickAndUploadFile() {
    try {
      let docPickerModule: any = null;
      try {
        docPickerModule = await import("expo-document-picker");
      } catch {
        docPickerModule = null;
      }
      if (!docPickerModule?.getDocumentAsync) {
        Alert.alert(
          "File picking unavailable",
          "File picking is not supported in this client build. Please share a photo instead.",
        );
        return;
      }
      const result = await docPickerModule.getDocumentAsync({
        type: ["application/pdf", "text/plain", "application/zip"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      triggerHaptic();
      setUploadingMedia(true);
      const doc = result.assets[0];
      const mimeType: string = doc.mimeType || "application/pdf";
      const fileName: string = doc.name || `file_${Date.now()}.pdf`;
      const ticketRes = await api<{
        url?: string;
        uploadUrl?: string;
        publicUrl?: string;
        signedUrl?: string;
        storagePath: string;
      }>(`/chat/conversations/${id}/attachment-ticket`, {
        method: "POST",
        body: JSON.stringify({
          filename: fileName,
          contentType: mimeType,
          sizeBytes: doc.size ?? 1024 * 100,
        }),
      });
      const uploadEndpoint = ticketRes.uploadUrl || ticketRes.url;
      if (!uploadEndpoint) throw new Error("Upload ticket did not include an upload URL.");
      const fileBlob = await (await fetch(doc.uri)).blob();
      const putRes = await fetch(uploadEndpoint, {
        method: "PUT",
        headers: { "Content-Type": mimeType },
        body: fileBlob,
      });
      if (!putRes.ok) throw new Error(`Upload failed (${putRes.status}). Please try again.`);
      const finalUrl = ticketRes.signedUrl || ticketRes.publicUrl;
      if (!finalUrl) throw new Error("Could not resolve a readable link for the uploaded file.");
      setPendingAttachment({
        url: finalUrl,
        type: "file",
        name: fileName,
        size: doc.size,
        storagePath: ticketRes.storagePath,
      });
    } catch (err: any) {
      Alert.alert("Upload failed", err?.message || "Could not upload file.");
    } finally {
      setUploadingMedia(false);
    }
  }

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
      const rawFileName = asset.fileName ?? `photo_${Date.now()}.jpg`;
      const optimized = await optimizeImageForUpload(
        asset.uri,
        OPTIMIZATION_PRESETS.CHAT_PHOTO,
        rawFileName,
      );

      const mimeType = optimized.mimeType;
      const fileName = optimized.fileName;
      const uploadUri = optimized.uri || asset.uri;

      const ticketRes = await api<{
        url?: string;
        uploadUrl?: string;
        publicUrl?: string;
        signedUrl?: string;
        storagePath: string;
      }>(`/chat/conversations/${id}/attachment-ticket`, {
        method: "POST",
        body: JSON.stringify({
          filename: fileName,
          contentType: mimeType,
          sizeBytes: optimized.fileSizeBytes || asset.fileSize || 180 * 1024,
        }),
      });

      const uploadEndpoint = ticketRes.uploadUrl || ticketRes.url;
      if (!uploadEndpoint) {
        throw new Error("Upload ticket did not include an upload URL.");
      }

      const fileBlob = await (await fetch(uploadUri)).blob();
      const putRes = await fetch(uploadEndpoint, {
        method: "PUT",
        headers: { "Content-Type": mimeType },
        body: fileBlob,
      });

      // The old code ignored the PUT result, so failed uploads still produced a
      // "sent" message pointing at an object that was never stored.
      if (!putRes.ok) {
        throw new Error(`Upload failed (${putRes.status}). Please try again.`);
      }

      // Always use a real read URL. Never fall back to the signed *upload* URL.
      const finalUrl = ticketRes.signedUrl || ticketRes.publicUrl;
      if (!finalUrl) {
        throw new Error("Could not resolve a readable link for the uploaded image.");
      }

      setPendingAttachment({
        url: finalUrl,
        type: "image",
        name: fileName,
        size: asset.fileSize,
        storagePath: ticketRes.storagePath,
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

  // Sync group title to state
  useEffect(() => {
    if (conversation?.title) {
      setNewGroupTitle(conversation.title);
    }
  }, [conversation?.title]);

  // Lookup map for group members (for avatars, names, roles)
  const memberMap = useMemo(() => {
    const map: Record<string, { name: string; avatarUrl?: string; role?: string; is_admin?: boolean }> = {};
    if (conversation?.members) {
      for (const m of conversation.members) {
        map[m.userId] = {
          name: m.profile?.full_name || m.profile?.username || "Member",
          avatarUrl: m.profile?.avatar_url,
          role: m.role,
          is_admin: m.is_admin || m.role === "admin",
        };
      }
    }
    return map;
  }, [conversation?.members]);

  const existingMemberIds = useMemo(() => {
    return new Set((conversation?.members || []).map((m) => m.userId));
  }, [conversation?.members]);

  const onlineCount = useMemo(() => {
    return (conversation?.members || []).filter((m) => m.is_online).length;
  }, [conversation?.members]);

  const availableConnections = useMemo(() => {
    const all = connectionsQuery.data?.connections || [];
    const notMembers = all.filter((c) => !existingMemberIds.has(c.id));
    if (!addMemberSearch.trim()) return notMembers;
    const q = addMemberSearch.toLowerCase();
    return notMembers.filter(
      (c) =>
        c.full_name?.toLowerCase().includes(q) ||
        c.username?.toLowerCase().includes(q) ||
        c.headline?.toLowerCase().includes(q)
    );
  }, [connectionsQuery.data?.connections, existingMemberIds, addMemberSearch]);

  // Add Members Mutation
  const handleAddMembers = async () => {
    if (selectedNewMembers.length === 0) return;
    setGroupActionLoading(true);
    try {
      await api(`/chat/conversations/${id}/members`, {
        method: "POST",
        body: JSON.stringify({ memberIds: selectedNewMembers }),
      });
      triggerHaptic();
      setSelectedNewMembers([]);
      setAddMembersModalVisible(false);
      qc.invalidateQueries({ queryKey: ["conversation-details", id] });
      qc.invalidateQueries({ queryKey: ["messages", id] });
      Alert.alert("Success", "New members added to group!");
    } catch (err: any) {
      Alert.alert("Could not add members", err?.message || "Failed to add members");
    } finally {
      setGroupActionLoading(false);
    }
  };

  // Change Role (Make Admin or Demote)
  const handleChangeRole = async (target: ConversationMember, newRole: "admin" | "member") => {
    setGroupActionLoading(true);
    try {
      await api(`/chat/conversations/${id}/members/${target.userId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role: newRole }),
      });
      triggerHaptic();
      setMemberActionMember(null);
      qc.invalidateQueries({ queryKey: ["conversation-details", id] });
      qc.invalidateQueries({ queryKey: ["messages", id] });
      Alert.alert("Role Updated", `${target.profile?.full_name || "Member"} is now a ${newRole}.`);
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to update member role");
    } finally {
      setGroupActionLoading(false);
    }
  };

  // Transfer Ownership
  const handleTransferOwnership = (target: ConversationMember) => {
    const name = target.profile?.full_name || target.profile?.username || "this member";
    Alert.alert(
      "Transfer Group Ownership",
      `Are you sure you want to make ${name} the primary group admin? You will remain in the group as a regular member.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Transfer",
          style: "destructive",
          onPress: async () => {
            setGroupActionLoading(true);
            try {
              await api(`/chat/conversations/${id}/members/${target.userId}/role`, {
                method: "PATCH",
                body: JSON.stringify({ role: "admin", isTransfer: true }),
              });
              triggerHaptic();
              setMemberActionMember(null);
              qc.invalidateQueries({ queryKey: ["conversation-details", id] });
              qc.invalidateQueries({ queryKey: ["messages", id] });
              Alert.alert("Ownership Transferred", `${name} is now the primary admin.`);
            } catch (err: any) {
              Alert.alert("Error", err?.message || "Failed to transfer ownership");
            } finally {
              setGroupActionLoading(false);
            }
          },
        },
      ]
    );
  };

  // Remove Member
  const handleRemoveMember = (target: ConversationMember) => {
    const name = target.profile?.full_name || target.profile?.username || "this member";
    Alert.alert(
      "Remove Member",
      `Are you sure you want to remove ${name} from this group?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setGroupActionLoading(true);
            try {
              await api(`/chat/conversations/${id}/members/${target.userId}`, {
                method: "DELETE",
              });
              triggerHaptic();
              setMemberActionMember(null);
              qc.invalidateQueries({ queryKey: ["conversation-details", id] });
              qc.invalidateQueries({ queryKey: ["messages", id] });
            } catch (err: any) {
              Alert.alert("Error", err?.message || "Failed to remove member");
            } finally {
              setGroupActionLoading(false);
            }
          },
        },
      ]
    );
  };

  // Leave Group
  const handleLeaveGroup = () => {
    Alert.alert(
      "Leave Group",
      "Are you sure you want to leave this group chat?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            try {
              await api(`/chat/conversations/${id}/leave`, { method: "POST" });
              triggerHaptic();
              setGroupInfoModalVisible(false);
              qc.invalidateQueries({ queryKey: ["conversations"] });
              router.replace("/(tabs)/inbox");
            } catch (err: any) {
              Alert.alert("Error", err?.message || "Failed to leave group");
            }
          },
        },
      ]
    );
  };

  // Update Group Title
  const handleSaveTitle = async () => {
    if (!newGroupTitle.trim()) return;
    setGroupActionLoading(true);
    try {
      await api(`/chat/conversations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: newGroupTitle.trim() }),
      });
      triggerHaptic();
      setEditTitleModalVisible(false);
      qc.invalidateQueries({ queryKey: ["conversation-details", id] });
      qc.invalidateQueries({ queryKey: ["messages", id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to update title");
    } finally {
      setGroupActionLoading(false);
    }
  };

  // Filtered Messages by In-Chat Search
  const allMessages = useMemo(() => messagesQuery.data?.messages ?? [], [messagesQuery.data]);
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

  // Real voice-note playback. Previously the play button only toggled an icon
  // and animated bars — no audio was ever produced.
  const toggleVoicePlayback = async (message: ChatMessage) => {
    triggerHaptic();
    const attachment = message.attachment;
    if (!attachment?.url) return;

    // Tapping the currently playing note pauses it.
    if (playingVoiceId === message.id) {
      const active = voiceSoundRef.current;
      if (active) {
        await active.pauseAsync().catch(() => {});
        setIsVoicePlaying(false);
      } else {
        setPlayingVoiceId(null);
      }
      return;
    }

    // Stop any previous note.
    const previous = voiceSoundRef.current;
    if (previous) {
      await previous.stopAsync().catch(() => {});
      voiceSoundRef.current = null;
    }

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      // Refresh the signed URL if the stored one has expired.
      const source =
        attachment.storagePath
          ? await resolveAttachmentUrl(id, attachment.storagePath, attachment.url)
          : attachment.url;

      const { sound } = await Audio.Sound.createAsync(
        { uri: source },
        { shouldPlay: true },
        (status) => {
          if (status.isLoaded && status.didJustFinish) {
            void sound.unloadAsync().catch(() => {});
            voiceSoundRef.current = null;
            setPlayingVoiceId(null);
            setIsVoicePlaying(false);
          }
        },
      );

      voiceSoundRef.current = sound;
      setPlayingVoiceId(message.id);
      setIsVoicePlaying(true);
    } catch (err: any) {
      setPlayingVoiceId(null);
      setIsVoicePlaying(false);
      Alert.alert(
        "Could not play voice note",
        err?.message || "The audio could not be loaded.",
      );
    }
  };

  // Always release the active sound when leaving the conversation.
  useEffect(() => {
    return () => {
      const sound = voiceSoundRef.current;
      voiceSoundRef.current = null;
      if (sound) void sound.unloadAsync().catch(() => {});
    };
  }, []);

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

    // Render system status message (e.g. John added Sarah, or Alex is admin)
    if (item.attachment?.type === "system") {
      return (
        <View key={item.client_message_id || item.id} style={styles.systemMsgContainer}>
          <View style={[styles.systemMsgPill, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="information-outline" size={13} color={colors.muted} style={{ marginRight: 5 }} />
            <Text style={[styles.systemMsgText, { color: colors.muted }]}>
              {item.body}
            </Text>
          </View>
        </View>
      );
    }

    const senderInfo = memberMap[item.sender_id];

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
              gap: 8,
            },
          ]}
        >
          {/* Incoming Avatar on the Left (Matching reference screenshot) */}
          {!mine && (
            <View style={styles.groupAvatarCol}>
              {!isSameSender ? (
                senderInfo?.avatarUrl || (conversation?.kind === "dm" && conversation?.avatar_url) ? (
                  <Image
                    source={{ uri: senderInfo?.avatarUrl || conversation?.avatar_url || "" }}
                    style={styles.groupSenderAvatar}
                  />
                ) : (
                  <View style={[styles.groupSenderAvatar, styles.placeholderGroupAvatar, { backgroundColor: colors.primarySoft }]}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>
                      {((senderInfo?.name || conversation?.title || "M").charAt(0)).toUpperCase()}
                    </Text>
                  </View>
                )
              ) : (
                <View style={{ width: 32 }} />
              )}
            </View>
          )}

          <Pressable
            onLongPress={() => {
              triggerHaptic();
              setSelectedMessage(item);
            }}
            style={[
              styles.bubble,
              mine
                ? {
                    backgroundColor: isDark ? colors.surface2 : colors.primarySoft,
                    borderColor: colors.border,
                    borderWidth: 1,
                    borderRadius: 18,
                    borderTopRightRadius: isSameSender ? 6 : 4,
                  }
                : {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    borderWidth: 1,
                    borderRadius: 18,
                    borderTopLeftRadius: isSameSender ? 6 : 4,
                  },
              item.failed && { borderColor: colors.danger },
            ]}
          >
            {/* Sender name above incoming message (e.g. Alex (Dev), Sarah (QA)) */}
            {!mine && !isSameSender && (
              <View style={styles.senderHeaderRow}>
                <Text style={[styles.senderNameText, { color: colors.primary }]} numberOfLines={1}>
                  {senderInfo?.name || (conversation?.kind === "dm" ? conversation?.title : null) || "Member"}
                </Text>
                {senderInfo?.is_admin && (
                  <View style={[styles.adminMiniBadge, { backgroundColor: isDark ? colors.surface2 : colors.primarySoft }]}>
                    <Text style={[styles.adminMiniBadgeText, { color: colors.primary }]}>ADMIN</Text>
                  </View>
                )}
              </View>
            )}

            {/* Reply Preview Quote Header */}
            {replyTarget && (
              <View style={[styles.replyQuote, { borderLeftColor: colors.primary }]}>
                <Text style={[styles.replyQuoteName, { color: colors.primary }]}>
                  {replyTarget.sender_id === session?.user.id ? "You" : (memberMap[replyTarget.sender_id]?.name || "Peer")}
                </Text>
                <Text style={[styles.replyQuoteText, { color: colors.muted }]} numberOfLines={1}>
                  {replyTarget.body || (replyTarget.attachment?.type === "image" ? "Photo" : "Voice note")}
                </Text>
              </View>
            )}

            {/* Photo Attachment */}
            {hasImage && (
              <Pressable
                onPress={async () => {
                  triggerHaptic();
                  const fresh = item.attachment?.storagePath
                    ? await resolveAttachmentUrl(id, item.attachment.storagePath, item.attachment!.url)
                    : item.attachment!.url;
                  setPreviewImageUrl(fresh);
                }}
              >
                <Image source={{ uri: item.attachment!.url }} style={styles.bubbleImage} resizeMode="cover" />
              </Pressable>
            )}

            {/* Voice Note Attachment Player */}
            {isVoice && (
              <View style={styles.voiceNoteContainer}>
                <Pressable
                  onPress={() => void toggleVoicePlayback(item)}
                  style={[styles.playBtn, { backgroundColor: colors.primary }]}
                >
                  <MaterialCommunityIcons
                    name={playingVoiceId === item.id ? "pause" : "play"}
                    size={20}
                    color={colors.white}
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
                              ? colors.primary
                              : colors.border,
                        },
                      ]}
                    />
                  ))}
                </View>

                <Text style={[styles.voiceDuration, { color: colors.muted }]}>
                  {formatVoiceDuration(item.attachment?.duration || 12)}
                </Text>
              </View>
            )}

            {/* Document/File Attachment (Matching Screenshot test_cases_v2.pdf) */}
            {isFile && (
              <Pressable
                onPress={async () => {
                  triggerHaptic();
                  const att = item.attachment!;
                  const fresh = att.storagePath
                    ? await resolveAttachmentUrl(id, att.storagePath, att.url)
                    : att.url;
                  try {
                    await WebBrowser.openBrowserAsync(fresh);
                  } catch {
                    setPreviewImageUrl(null);
                    Alert.alert("Could not open file", "The file link may have expired. Please try again.");
                  }
                }}
                style={[
                  styles.fileCardModern,
                  {
                    backgroundColor: isDark ? colors.surface : colors.surface2,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={[styles.fileIconBadge, { backgroundColor: colors.danger }]}>
                  <MaterialCommunityIcons name="file-pdf-box" size={26} color={colors.white} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.fileNameModern, { color: colors.text }]} numberOfLines={1}>
                    {item.attachment?.name || "test_cases_v2.pdf"}
                  </Text>
                  <Text style={[styles.fileSizeModern, { color: colors.muted }]}>
                    {item.attachment?.size
                      ? (item.attachment.size > 1024 * 1024
                          ? `${(item.attachment.size / (1024 * 1024)).toFixed(1)} MB`
                          : `${Math.round(item.attachment.size / 1024)} KB`)
                      : "2.4 MB"}
                  </Text>
                </View>
                <View style={[styles.fileDownloadCircle, { backgroundColor: colors.primarySoft }]}>
                  <MaterialCommunityIcons name="arrow-down" size={18} color={colors.primary} />
                </View>
              </Pressable>
            )}

            {/* Message Body */}
            {item.body && !(hasImage && item.body === "[Photo]") && !isVoice ? (
              <Text style={{ color: colors.text, fontSize: 15, lineHeight: 21 }}>
                {item.body}
              </Text>
            ) : null}

            {/* Meta Row: Timestamp + Delivery Checkmarks */}
            <View style={styles.metaRow}>
              <Text style={{ color: colors.muted, fontSize: 10 }}>
                {new Date(item.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </Text>

              {mine && (
                <View style={{ marginLeft: 3 }}>
                  {item.pending ? (
                    <MaterialCommunityIcons name="clock-outline" size={12} color={colors.muted} />
                  ) : item.failed ? (
                    <Pressable
                      onPress={() => {
                        triggerHaptic();
                        void retryOutbox();
                      }}
                      style={{ flexDirection: "row", alignItems: "center", gap: 2 }}
                    >
                      <MaterialCommunityIcons name="alert-circle" size={12} color={colors.danger} />
                      <Text style={{ color: colors.danger, fontSize: 10, fontWeight: "700" }}>Retry</Text>
                    </Pressable>
                  ) : item.delivery_status === "read" || item.delivery_status === "delivered" ? (
                    <MaterialCommunityIcons name="check-all" size={14} color={colors.primary} />
                  ) : (
                    <MaterialCommunityIcons name="check" size={13} color={colors.muted} />
                  )}
                </View>
              )}
            </View>
          </Pressable>

          {/* Outgoing Avatar on the Right (Matching reference screenshot) */}
          {mine && (
            <View style={styles.groupAvatarColRight}>
              {!isSameSender ? (
                session?.user?.user_metadata?.avatar_url ? (
                  <Image
                    source={{ uri: session.user.user_metadata.avatar_url }}
                    style={styles.groupSenderAvatar}
                  />
                ) : (
                  <View style={[styles.groupSenderAvatar, styles.placeholderGroupAvatar, { backgroundColor: colors.primarySoft }]}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>
                      {((session?.user?.user_metadata?.full_name || session?.user?.email || "Y").charAt(0)).toUpperCase()}
                    </Text>
                  </View>
                )
              ) : (
                <View style={{ width: 32 }} />
              )}
            </View>
          )}
        </Animated.View>

        {/* Emoji Reactions Pill (Matching reference screenshot) */}
        {item.reactions && item.reactions.length > 0 && (
          <View
            style={[
              styles.reactionsPill,
              {
                alignSelf: mine ? "flex-end" : "flex-start",
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            {Array.from(new Set(item.reactions.map((r) => r.reaction))).map((emoji) => {
              const count = item.reactions!.filter((r) => r.reaction === emoji).length;
              return (
                <Text key={emoji} style={styles.reactionPillItem}>
                  {emoji} {count > 1 ? count : ""}
                </Text>
              );
            })}
            <Pressable
              onPress={() => {
                triggerHaptic();
                setSelectedMessage(item);
              }}
              hitSlop={8}
              style={{ paddingLeft: 4 }}
            >
              <MaterialCommunityIcons name="emoticon-plus-outline" size={14} color={colors.muted} />
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      {/* Modern App Header with Safe Area Inset & Dynamic Theme Tokens */}
      <View
        style={[
          styles.chatHeader,
          {
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
            paddingTop: Math.max(insets.top, 12) + 4,
          },
        ]}
      >
        {/* Left: Back Arrow Button */}
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerBackBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
        </Pressable>

        <Pressable
          onPress={() => {
            if (conversation?.kind === "group") {
              setGroupInfoModalVisible(true);
            } else {
              setMediaModalVisible(true);
            }
          }}
          style={styles.headerPeerInfo}
        >
          <View style={styles.avatarWrapper}>
            {conversation?.avatar_url ? (
              <Image source={{ uri: conversation.avatar_url }} style={styles.headerAvatar} />
            ) : (
              <View
                style={[
                  styles.headerAvatar,
                  styles.placeholderAvatar,
                  {
                    backgroundColor:
                      conversation?.kind === "group"
                        ? (isDark ? colors.surface2 : colors.primarySoft)
                        : colors.primarySoft,
                  },
                ]}
              >
                <Text
                  style={{
                    color: conversation?.kind === "group" ? colors.primary : colors.primary,
                    fontWeight: "800",
                    fontSize: 16,
                  }}
                >
                  {(conversation?.title || "T").charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            {/* Online / Member Badge Dot */}
            <View
              style={[
                styles.onlineDot,
                {
                  backgroundColor:
                    conversation?.kind === "group"
                      ? colors.primary
                      : isPeerOnline
                      ? colors.success
                      : colors.muted,
                  borderColor: colors.surface,
                },
              ]}
            >
              <MaterialCommunityIcons
                name={conversation?.kind === "group" ? "account" : "check"}
                size={8}
                color={colors.white}
              />
            </View>
          </View>

          <View style={{ flex: 1, gap: 1 }}>
            <Text style={[styles.headerTitleText, { color: colors.text }]} numberOfLines={1}>
              {conversation?.title || (conversation?.kind === "group" ? "Test Engineering Group" : "Conversation")}
            </Text>
            <Text
              style={[
                styles.headerSubtitleText,
                {
                  color: conversation?.kind === "group" ? colors.muted : isPeerOnline ? colors.success : colors.muted,
                },
              ]}
              numberOfLines={1}
            >
              {conversation?.kind === "group"
                ? `${conversation?.members?.length || 0} members · ${onlineCount > 0 ? `${onlineCount} online` : "offline"}`
                : isPeerOnline
                ? "Online"
                : "Offline"}
            </Text>
          </View>
        </Pressable>

        {/* Right Header Actions (Search, Audio Call, Video Call, More) */}
        <View style={styles.headerActions}>
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
            onPress={() => startDirectCall("audio")}
            hitSlop={8}
            style={styles.headerIconBtn}
            accessibilityRole="button"
            accessibilityLabel="Audio Call"
          >
            <MaterialCommunityIcons name="phone-outline" size={21} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={() => startDirectCall("video")}
            hitSlop={8}
            style={styles.headerIconBtn}
            accessibilityRole="button"
            accessibilityLabel="Video Call"
          >
            <MaterialCommunityIcons name="video-outline" size={23} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={() => {
              triggerHaptic();
              if (conversation?.kind === "group") {
                setGroupInfoModalVisible(true);
              } else {
                setMediaModalVisible(true);
              }
            }}
            hitSlop={8}
            style={styles.headerIconBtn}
          >
            <MaterialCommunityIcons name="dots-vertical" size={22} color={colors.text} />
          </Pressable>
        </View>
      </View>

      {/* Pinned Discussion Topic Banner (Matching reference screenshot) */}
      <Pressable
        onPress={() => {
          triggerHaptic();
          if (conversation?.kind === "group") {
            setGroupInfoModalVisible(true);
          } else {
            setMediaModalVisible(true);
          }
        }}
        style={[
          styles.pinnedBanner,
          {
            backgroundColor: isDark ? colors.surface2 : colors.primarySoft,
            borderColor: colors.border,
          },
        ]}
      >
        <MaterialCommunityIcons
          name="account-group-outline"
          size={18}
          color={colors.primary}
          style={{ marginRight: 8 }}
        />
        <Text style={[styles.pinnedBannerText, { color: colors.text }]} numberOfLines={1}>
          {conversation?.description || "Team discussion, project updates and more..."}
        </Text>
        <MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} />
      </Pressable>

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
              <Text style={[styles.jumpBadgeText, { color: colors.white }]}>{newMessagesWhileScrolled}</Text>
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
          {pendingAttachment.type === "image" ? (
            <Image source={{ uri: pendingAttachment.url }} style={styles.previewThumb} />
          ) : (
            <View style={[styles.previewThumb, { alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }]}>
              <MaterialCommunityIcons name="file-document-outline" size={22} color={colors.primary} />
            </View>
          )}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }} numberOfLines={1}>
              {pendingAttachment.name || "Photo attachment"}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 11 }}>Ready to send</Text>
          </View>
          <Pressable onPress={() => setPendingAttachment(null)}>
            <MaterialCommunityIcons name="close-circle" size={22} color={colors.danger} />
          </Pressable>
        </View>
      )}

      {/* Voice Note Recording Live Bar */}
      {isRecordingVoice ? (
        <Animated.View entering={FadeIn.duration(150)} style={[styles.recordingBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <View style={[styles.recordingPulsingDot, { backgroundColor: colors.danger }]} />
          <Text style={[styles.recordingTimer, { color: colors.text }]}>
            Recording {formatVoiceDuration(voiceSeconds)}
          </Text>
          <View style={{ flex: 1 }} />
          <Pressable onPress={cancelVoiceRecording} style={styles.cancelRecBtn}>
            <Text style={[styles.cancelRecText, { color: colors.danger }]}>Cancel</Text>
          </Pressable>
          <Pressable onPress={finishVoiceRecording} style={[styles.sendRecBtn, { backgroundColor: colors.primary }]}>
            <MaterialCommunityIcons name="send" size={18} color={colors.white} />
          </Pressable>
        </Animated.View>
      ) : (
        /* Composer Input Bar matching Screenshot */
        <View
          style={[
            styles.composerModern,
            {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
              paddingBottom: Math.max(insets.bottom, 10) + 4,
            },
          ]}
        >
          {/* Action '+' Button (Matching screenshot) */}
          <Pressable
            onPress={() => {
              triggerHaptic();
              setPlusMenuVisible(true);
            }}
            style={[styles.plusCircleBtn, { backgroundColor: colors.primary }]}
            accessibilityLabel="More actions"
          >
            <MaterialCommunityIcons name="plus" size={22} color={colors.white} />
          </Pressable>

          {/* Document Attachment Icon (Paperclip) */}
          <Pressable
            onPress={pickAndUploadFile}
            disabled={uploadingMedia}
            style={styles.composerActionIconBtn}
            accessibilityLabel="Share a file"
          >
            <MaterialCommunityIcons name="paperclip" size={22} color={colors.muted} />
          </Pressable>

          {/* Voice Recorder Button (Microphone) */}
          <Pressable
            onPress={startVoiceRecording}
            style={styles.composerActionIconBtn}
            accessibilityLabel="Record voice note"
          >
            <MaterialCommunityIcons name="microphone-outline" size={22} color={colors.muted} />
          </Pressable>

          {/* Input Text Box Pill */}
          <View style={[styles.inputWrapperModern, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
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

          {/* Send Button: Circular button with paper plane in colors.primary */}
          <Pressable
            onPress={() => void send()}
            disabled={!body.trim() && !pendingAttachment}
            style={[
              styles.sendButtonModern,
              {
                backgroundColor: colors.primary,
                opacity: body.trim() || pendingAttachment ? 1 : 0.6,
              },
            ]}
          >
            <MaterialCommunityIcons
              name="send"
              size={18}
              color={colors.white}
              style={{ marginLeft: 2 }}
            />
          </Pressable>
        </View>
      )}

      {/* Quick Action Sheet Modal triggered by '+' button */}
      <Modal
        visible={plusMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPlusMenuVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setPlusMenuVisible(false)}
        >
          <View
            style={[
              styles.reactionSheet,
              {
                backgroundColor: colors.surface,
                paddingBottom: Math.max(insets.bottom, 16) + 12,
              },
            ]}
          >
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.muted, textAlign: "center", marginBottom: 8 }}>
              Share in Conversation
            </Text>
            <View style={styles.plusMenuGrid}>
              <Pressable
                onPress={() => {
                  setPlusMenuVisible(false);
                  void pickAndUploadPhoto();
                }}
                style={styles.plusMenuItem}
              >
                <View style={[styles.plusMenuIconCircle, { backgroundColor: colors.primarySoft }]}>
                  <MaterialCommunityIcons name="image-outline" size={24} color={colors.primary} />
                </View>
                <Text style={[styles.plusMenuLabel, { color: colors.text }]}>Photo</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setPlusMenuVisible(false);
                  void pickAndUploadFile();
                }}
                style={styles.plusMenuItem}
              >
                <View style={[styles.plusMenuIconCircle, { backgroundColor: colors.primarySoft }]}>
                  <MaterialCommunityIcons name="file-document-outline" size={24} color={colors.primary} />
                </View>
                <Text style={[styles.plusMenuLabel, { color: colors.text }]}>Document</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setPlusMenuVisible(false);
                  void startVoiceRecording();
                }}
                style={styles.plusMenuItem}
              >
                <View style={[styles.plusMenuIconCircle, { backgroundColor: colors.primarySoft }]}>
                  <MaterialCommunityIcons name="microphone-outline" size={24} color={colors.primary} />
                </View>
                <Text style={[styles.plusMenuLabel, { color: colors.text }]}>Voice Note</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setPlusMenuVisible(false);
                  setMediaModalVisible(true);
                }}
                style={styles.plusMenuItem}
              >
                <View style={[styles.plusMenuIconCircle, { backgroundColor: colors.primarySoft }]}>
                  <MaterialCommunityIcons name="folder-multiple-outline" size={24} color={colors.primary} />
                </View>
                <Text style={[styles.plusMenuLabel, { color: colors.text }]}>Media Hub</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>

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
        <View style={[styles.fullscreenImageViewer, { backgroundColor: colors.black }]}>
          <Pressable
            onPress={() => setPreviewImageUrl(null)}
            style={[styles.closeViewerBtn, { top: Math.max(insets.top, 20) + 12 }]}
          >
            <MaterialCommunityIcons name="close" size={28} color={colors.white} />
          </Pressable>
          {previewImageUrl && (
            <Image source={{ uri: previewImageUrl }} style={styles.fullscreenImage} resizeMode="contain" />
          )}
        </View>
      </Modal>

      {/* Group Info & Member Management Modal */}
      <Modal
        visible={groupInfoModalVisible}
        animationType="slide"
        onRequestClose={() => setGroupInfoModalVisible(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalHeaderTitle, { color: colors.text }]}>Group Info</Text>
            <Pressable onPress={() => setGroupInfoModalVisible(false)} hitSlop={12}>
              <MaterialCommunityIcons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Group Hero Card */}
            <View style={[styles.groupHeroCard, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
              <View style={styles.groupHeroAvatarWrapper}>
                {conversation?.avatar_url ? (
                  <Image source={{ uri: conversation.avatar_url }} style={styles.groupHeroAvatar} />
                ) : (
                  <View style={[styles.groupHeroAvatar, styles.placeholderGroupHero, { backgroundColor: colors.primarySoft }]}>
                    <MaterialCommunityIcons name="account-group" size={40} color={colors.primary} />
                  </View>
                )}
              </View>

              <View style={styles.groupHeroTitleRow}>
                <Text style={[styles.groupHeroTitle, { color: colors.text }]} numberOfLines={2}>
                  {conversation?.title || "Group Chat"}
                </Text>
                {conversation?.is_admin && (
                  <Pressable
                    onPress={() => {
                      triggerHaptic();
                      setNewGroupTitle(conversation?.title || "");
                      setEditTitleModalVisible(true);
                    }}
                    hitSlop={8}
                    style={styles.editTitleBtn}
                  >
                    <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.primary} />
                  </Pressable>
                )}
              </View>

              <Text style={[styles.groupHeroSub, { color: colors.muted }]}>
                {conversation?.members?.length || 0} members · {conversation?.is_admin ? "You are an Admin 👑" : "Member"}
              </Text>
              {conversation?.description ? (
                <Text style={[styles.groupDescText, { color: colors.muted }]}>
                  {conversation.description}
                </Text>
              ) : null}

              {/* Quick Actions Row */}
              <View style={styles.groupActionRow}>
                <Pressable
                  onPress={() => {
                    triggerHaptic();
                    setSelectedNewMembers([]);
                    setAddMembersModalVisible(true);
                  }}
                  style={[styles.groupActionBtn, { backgroundColor: colors.surface2 }]}
                >
                  <MaterialCommunityIcons name="account-plus" size={20} color={colors.primary} />
                  <Text style={[styles.groupActionBtnText, { color: colors.text }]}>Add Member</Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    triggerHaptic();
                    setGroupInfoModalVisible(false);
                    setMediaModalVisible(true);
                  }}
                  style={[styles.groupActionBtn, { backgroundColor: colors.surface2 }]}
                >
                  <MaterialCommunityIcons name="folder-image" size={20} color={colors.primary} />
                  <Text style={[styles.groupActionBtnText, { color: colors.text }]}>Shared Media</Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    triggerHaptic();
                    setGroupInfoModalVisible(false);
                    setSearchOpen(true);
                  }}
                  style={[styles.groupActionBtn, { backgroundColor: colors.surface2 }]}
                >
                  <MaterialCommunityIcons name="magnify" size={20} color={colors.primary} />
                  <Text style={[styles.groupActionBtnText, { color: colors.text }]}>Search</Text>
                </Pressable>
              </View>
            </View>

            {/* Member List Header */}
            <View style={styles.groupSectionHeader}>
              <Text style={[styles.groupSectionHeaderText, { color: colors.muted }]}>
                MEMBERS ({conversation?.members?.length || 0})
              </Text>
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  setSelectedNewMembers([]);
                  setAddMembersModalVisible(true);
                }}
                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                <MaterialCommunityIcons name="plus" size={16} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "700" }}>Add</Text>
              </Pressable>
            </View>

            {/* Members Rows */}
            <View style={{ backgroundColor: colors.surface }}>
              {(conversation?.members || []).map((m) => {
                const isMe = m.userId === session?.user.id;
                const isAdmin = m.role === "admin" || m.is_admin;
                const isCreator = m.is_creator || m.userId === conversation?.created_by;
                const p = m.profile;
                const name = p?.full_name || p?.username || "SkillBridge Member";

                return (
                  <View
                    key={m.userId}
                    style={[styles.memberListItem, { borderBottomColor: colors.border }]}
                  >
                    <View style={styles.memberAvatarWrapper}>
                      {p?.avatar_url ? (
                        <Image source={{ uri: p.avatar_url }} style={styles.memberAvatar} />
                      ) : (
                        <View style={[styles.memberAvatar, styles.placeholderMemberAvatar, { backgroundColor: colors.primarySoft }]}>
                          <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 14 }}>
                            {name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      {m.is_online && <View style={styles.memberOnlineDot} />}
                    </View>

                    <View style={styles.memberInfoCol}>
                      <View style={styles.memberNameRow}>
                        <Text style={[styles.memberNameText, { color: colors.text }]} numberOfLines={1}>
                          {name} {isMe ? "(You)" : ""}
                        </Text>
                        {isAdmin && (
                          <View style={[styles.adminBadgePill, { backgroundColor: isDark ? colors.surface2 : colors.warning + "22" }]}>
                            <MaterialCommunityIcons name="crown" size={12} color={colors.warning} style={{ marginRight: 2 }} />
                            <Text style={[styles.adminBadgeText, { color: colors.warning }]}>
                              {isCreator ? "Creator · Admin" : "Admin"}
                            </Text>
                          </View>
                        )}
                        {!isAdmin && (
                          <View style={[styles.memberBadgePill, { backgroundColor: colors.surface2 }]}>
                            <Text style={[styles.memberBadgeText, { color: colors.muted }]}>Member</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.memberHandleText, { color: colors.muted }]} numberOfLines={1}>
                        {p?.headline || (p?.username ? `@${p.username}` : "SkillBridge Student")}
                      </Text>
                    </View>

                    {/* Admin Action Menu Trigger for other members */}
                    {conversation?.is_admin && !isMe && (
                      <Pressable
                        onPress={() => {
                          triggerHaptic();
                          setMemberActionMember(m);
                        }}
                        hitSlop={12}
                        style={styles.memberActionTrigger}
                      >
                        <MaterialCommunityIcons name="dots-horizontal" size={22} color={colors.text} />
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>

            {/* Leave Group Button */}
            <View style={styles.leaveGroupContainer}>
              <Pressable
                onPress={handleLeaveGroup}
                style={[
                  styles.leaveGroupBtn,
                  {
                    borderColor: colors.danger,
                    backgroundColor: isDark ? colors.surface2 : colors.danger + "14",
                  },
                ]}
              >
                <MaterialCommunityIcons name="logout" size={18} color={colors.danger} style={{ marginRight: 6 }} />
                <Text style={[styles.leaveGroupBtnText, { color: colors.danger }]}>Leave Group Chat</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Member Action Sheet Modal (Admins Managing Members) */}
      <Modal
        visible={Boolean(memberActionMember)}
        transparent
        animationType="fade"
        onRequestClose={() => setMemberActionMember(null)}
      >
        <Pressable
          style={styles.actionSheetOverlay}
          onPress={() => setMemberActionMember(null)}
        >
          <View style={[styles.actionSheetContent, { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={[styles.actionSheetHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.actionSheetTitle, { color: colors.text }]}>
                Manage {memberActionMember?.profile?.full_name || memberActionMember?.profile?.username || "Member"}
              </Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                Current Role: {memberActionMember?.role === "admin" || memberActionMember?.is_admin ? "👑 Admin" : "Member"}
              </Text>
            </View>

            {/* Option 1: Make Admin or Demote */}
            {memberActionMember?.role !== "admin" && !memberActionMember?.is_admin ? (
              <Pressable
                onPress={() => memberActionMember && handleChangeRole(memberActionMember, "admin")}
                style={[styles.actionSheetRow, { borderBottomColor: colors.border }]}
              >
                <View style={[styles.actionSheetIconWrapper, { backgroundColor: isDark ? colors.surface2 : colors.warning + "22" }]}>
                  <MaterialCommunityIcons name="crown-outline" size={20} color={colors.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.actionSheetOptionTitle, { color: colors.text }]}>Make Group Admin</Text>
                  <Text style={[styles.actionSheetOptionSub, { color: colors.muted }]}>
                    Can add or remove members and update settings
                  </Text>
                </View>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => memberActionMember && handleChangeRole(memberActionMember, "member")}
                style={[styles.actionSheetRow, { borderBottomColor: colors.border }]}
              >
                <View style={[styles.actionSheetIconWrapper, { backgroundColor: colors.surface2 }]}>
                  <MaterialCommunityIcons name="account-arrow-down" size={20} color={colors.text} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.actionSheetOptionTitle, { color: colors.text }]}>Dismiss as Admin</Text>
                  <Text style={[styles.actionSheetOptionSub, { color: colors.muted }]}>
                    Revert this person to a standard member
                  </Text>
                </View>
              </Pressable>
            )}

            {/* Option 2: Transfer Ownership */}
            <Pressable
              onPress={() => memberActionMember && handleTransferOwnership(memberActionMember)}
              style={[styles.actionSheetRow, { borderBottomColor: colors.border }]}
            >
              <View style={[styles.actionSheetIconWrapper, { backgroundColor: colors.primarySoft }]}>
                <MaterialCommunityIcons name="swap-horizontal" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.actionSheetOptionTitle, { color: colors.text }]}>Transfer Ownership</Text>
                <Text style={[styles.actionSheetOptionSub, { color: colors.muted }]}>
                  Make this user the primary creator & admin
                </Text>
              </View>
            </Pressable>

            {/* Option 3: Remove from Group */}
            <Pressable
              onPress={() => memberActionMember && handleRemoveMember(memberActionMember)}
              style={styles.actionSheetRow}
            >
              <View style={[styles.actionSheetIconWrapper, { backgroundColor: isDark ? colors.surface2 : colors.danger + "18" }]}>
                <MaterialCommunityIcons name="account-remove-outline" size={20} color={colors.danger} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.actionSheetOptionTitle, { color: colors.danger }]}>Remove from Group</Text>
                <Text style={[styles.actionSheetOptionSub, { color: colors.muted }]}>
                  Member will no longer be able to read or send messages
                </Text>
              </View>
            </Pressable>

            <Pressable
              onPress={() => setMemberActionMember(null)}
              style={[styles.actionSheetCancelBtn, { backgroundColor: colors.surface2 }]}
            >
              <Text style={[styles.actionSheetCancelText, { color: colors.text }]}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Add Members to Existing Group Modal */}
      <Modal
        visible={addMembersModalVisible}
        animationType="slide"
        onRequestClose={() => setAddMembersModalVisible(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalHeaderTitle, { color: colors.text }]}>Add Members</Text>
            <Pressable onPress={() => setAddMembersModalVisible(false)} hitSlop={12}>
              <MaterialCommunityIcons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          {/* Search Contacts Bar */}
          <View style={[styles.inChatSearch, { backgroundColor: colors.surface2, borderBottomColor: colors.border }]}>
            <MaterialCommunityIcons name="magnify" size={18} color={colors.muted} />
            <TextInput
              placeholder="Search contacts..."
              placeholderTextColor={colors.muted}
              value={addMemberSearch}
              onChangeText={setAddMemberSearch}
              style={[styles.inChatSearchInput, { color: colors.text }]}
            />
            {addMemberSearch ? (
              <Pressable onPress={() => setAddMemberSearch("")}>
                <MaterialCommunityIcons name="close-circle" size={16} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>

          {/* Selected Member Chips */}
          {selectedNewMembers.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={[styles.selectedChipsBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
              contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}
            >
              {selectedNewMembers.map((uid) => {
                const conn = (connectionsQuery.data?.connections || []).find((c) => c.id === uid);
                return (
                  <View key={uid} style={[styles.selectedChip, { backgroundColor: colors.primarySoft }]}>
                    <Text style={[styles.selectedChipText, { color: colors.primary }]}>
                      {conn?.full_name || conn?.username || "Contact"}
                    </Text>
                    <Pressable
                      onPress={() => setSelectedNewMembers((prev) => prev.filter((uid2) => uid2 !== uid))}
                      hitSlop={6}
                    >
                      <MaterialCommunityIcons name="close-circle" size={16} color={colors.primary} />
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
          )}

          {/* Contacts List */}
          <ScrollView style={{ flex: 1 }}>
            {connectionsQuery.isLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
            ) : availableConnections.length === 0 ? (
              <View style={styles.emptyMedia}>
                <MaterialCommunityIcons name="account-search-outline" size={48} color={colors.muted} />
                <Text style={[styles.emptyMediaText, { color: colors.muted }]}>
                  {addMemberSearch ? "No matching contacts found" : "All your contacts are already in this group"}
                </Text>
              </View>
            ) : (
              availableConnections.map((c) => {
                const isSelected = selectedNewMembers.includes(c.id);
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => {
                      triggerHaptic();
                      setSelectedNewMembers((prev) =>
                        isSelected ? prev.filter((uid) => uid !== c.id) : [...prev, c.id]
                      );
                    }}
                    style={[
                      styles.addMemberRow,
                      { borderBottomColor: colors.border },
                      isSelected && { backgroundColor: colors.primarySoft + "22" },
                    ]}
                  >
                    <View style={styles.memberAvatarWrapper}>
                      {c.avatar_url ? (
                        <Image source={{ uri: c.avatar_url }} style={styles.memberAvatar} />
                      ) : (
                        <View style={[styles.memberAvatar, styles.placeholderMemberAvatar, { backgroundColor: colors.primarySoft }]}>
                          <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 14 }}>
                            {(c.full_name || c.username || "U").charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={[styles.memberNameText, { color: colors.text }]} numberOfLines={1}>
                        {c.full_name || c.username || "SkillBridge Student"}
                      </Text>
                      <Text style={[styles.memberHandleText, { color: colors.muted }]} numberOfLines={1}>
                        {c.headline || `@${c.username || "user"}`}
                      </Text>
                    </View>

                    <MaterialCommunityIcons
                      name={isSelected ? "checkbox-marked-circle" : "checkbox-blank-circle-outline"}
                      size={24}
                      color={isSelected ? colors.primary : colors.muted}
                    />
                  </Pressable>
                );
              })
            )}
          </ScrollView>

          {/* Submit Button */}
          <View style={[styles.modalFooter, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
            <Pressable
              onPress={handleAddMembers}
              disabled={selectedNewMembers.length === 0 || groupActionLoading}
              style={[
                styles.addMembersSubmitBtn,
                {
                  backgroundColor:
                    selectedNewMembers.length === 0 || groupActionLoading ? colors.border : colors.primary,
                },
              ]}
            >
              {groupActionLoading ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={[styles.addMembersSubmitBtnText, { color: colors.white }]}>
                  Add {selectedNewMembers.length > 0 ? `(${selectedNewMembers.length})` : ""} to Group
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Edit Group Name Modal */}
      <Modal
        visible={editTitleModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditTitleModalVisible(false)}
      >
        <Pressable
          style={styles.actionSheetOverlay}
          onPress={() => setEditTitleModalVisible(false)}
        >
          <View style={[styles.editTitleModalBox, { backgroundColor: colors.surface }]}>
            <Text style={[styles.editTitleModalTitle, { color: colors.text }]}>Change Group Name</Text>
            <TextInput
              value={newGroupTitle}
              onChangeText={setNewGroupTitle}
              placeholder="Enter group name..."
              placeholderTextColor={colors.muted}
              style={[styles.editTitleInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 }]}
              autoFocus
            />
            <View style={styles.editTitleModalBtns}>
              <Pressable
                onPress={() => setEditTitleModalVisible(false)}
                style={[styles.editTitleBtnAction, { backgroundColor: colors.surface2 }]}
              >
                <Text style={{ color: colors.text, fontWeight: "600" }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSaveTitle}
                disabled={!newGroupTitle.trim() || groupActionLoading}
                style={[styles.editTitleBtnAction, { backgroundColor: colors.primary }]}
              >
                {groupActionLoading ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Text style={{ color: colors.white, fontWeight: "700" }}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    gap: 8,
  },
  pinnedBanner: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  pinnedBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
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
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  placeholderAvatar: {
    alignItems: "center",
    justifyContent: "center",
  },
  onlineDot: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  headerTitleText: {
    fontSize: 16,
    fontWeight: "800",
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
  groupAvatarColRight: {
    width: 32,
    marginLeft: 6,
    alignSelf: "flex-end",
    marginBottom: 2,
  },
  fileCardModern: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    marginVertical: 4,
    minWidth: 220,
  },
  fileIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  fileNameModern: {
    fontSize: 14,
    fontWeight: "700",
  },
  fileSizeModern: {
    fontSize: 12,
  },
  fileDownloadCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
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
  composerModern: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    gap: 6,
  },
  plusCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  composerActionIconBtn: {
    padding: 6,
  },
  inputWrapperModern: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  composerTextInput: {
    fontSize: 15,
    paddingVertical: Platform.OS === "ios" ? 8 : 6,
  },
  sendButtonModern: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  plusMenuGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 12,
  },
  plusMenuItem: {
    alignItems: "center",
    gap: 6,
  },
  plusMenuIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  plusMenuLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  composer: {
    flexDirection: "row",
    alignItems: "center",
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
    justifyContent: "center",
    alignItems: "center",
  },
  closeViewerBtn: {
    position: "absolute",
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  fullscreenImage: {
    width: "100%",
    height: "80%",
  },
  // Group Chat Elements & Badges
  systemMsgContainer: {
    alignItems: "center",
    marginVertical: 10,
    paddingHorizontal: 20,
  },
  systemMsgPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  systemMsgText: {
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
  },
  groupAvatarCol: {
    width: 28,
    marginRight: 6,
    alignSelf: "flex-end",
    marginBottom: 2,
  },
  groupSenderAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  placeholderGroupAvatar: {
    alignItems: "center",
    justifyContent: "center",
  },
  senderHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  senderNameText: {
    fontSize: 12,
    fontWeight: "700",
  },
  adminMiniBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  adminMiniBadgeText: {
    fontSize: 8,
    fontWeight: "800",
  },
  groupBadgeHeader: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  groupBadgeHeaderText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  // Group Info Modal
  groupHeroCard: {
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  groupHeroAvatarWrapper: {
    position: "relative",
    marginBottom: 12,
  },
  groupHeroAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  placeholderGroupHero: {
    alignItems: "center",
    justifyContent: "center",
  },
  groupHeroTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  groupHeroTitle: {
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  editTitleBtn: {
    padding: 4,
  },
  groupHeroSub: {
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 6,
  },
  groupDescText: {
    fontSize: 13,
    textAlign: "center",
    marginTop: 4,
    paddingHorizontal: 20,
  },
  groupActionRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 14,
    marginTop: 18,
    width: "100%",
  },
  groupActionBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    minWidth: 90,
    gap: 4,
  },
  groupActionBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
  groupSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  groupSectionHeaderText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  memberListItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  memberAvatarWrapper: {
    position: "relative",
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  placeholderMemberAvatar: {
    alignItems: "center",
    justifyContent: "center",
  },
  memberOnlineDot: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 11,
    height: 11,
    borderRadius: 5.5,
    borderWidth: 2,
  },
  memberInfoCol: {
    flex: 1,
    gap: 2,
  },
  memberNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  memberNameText: {
    fontSize: 14,
    fontWeight: "700",
  },
  adminBadgePill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  adminBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  memberBadgePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  memberBadgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  memberHandleText: {
    fontSize: 12,
  },
  memberActionTrigger: {
    padding: 6,
  },
  leaveGroupContainer: {
    padding: 24,
    alignItems: "center",
  },
  leaveGroupBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: "100%",
  },
  leaveGroupBtnText: {
    fontSize: 14,
    fontWeight: "700",
  },
  // Member Action Sheet
  actionSheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  actionSheetContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 34,
  },
  actionSheetHeader: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionSheetTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  actionSheetRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionSheetIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  actionSheetOptionTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  actionSheetOptionSub: {
    fontSize: 11,
    marginTop: 2,
  },
  actionSheetCancelBtn: {
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  actionSheetCancelText: {
    fontSize: 14,
    fontWeight: "700",
  },
  // Add Members & Edit Title Modals
  selectedChipsBar: {
    borderBottomWidth: 1,
  },
  selectedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  selectedChipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  addMemberRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
  },
  addMembersSubmitBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  addMembersSubmitBtnText: {
    fontSize: 15,
    fontWeight: "700",
  },
  editTitleModalBox: {
    marginHorizontal: 24,
    marginBottom: "auto",
    marginTop: "auto",
    borderRadius: 16,
    padding: 20,
    gap: 16,
  },
  editTitleModalTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  editTitleInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  editTitleModalBtns: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  editTitleBtnAction: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
});
