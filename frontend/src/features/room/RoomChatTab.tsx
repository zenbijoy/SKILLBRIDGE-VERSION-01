import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
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
import { Audio } from "expo-av";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { v4 as uuidv4 } from "uuid";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { optimizeImageForUpload, OPTIMIZATION_PRESETS } from "@/lib/imageOptimizer";
import { useKeyboardHeight } from "@/hooks/useKeyboardHeight";
import { useSession } from "@/hooks/useSession";
import { useTheme, spacing, radius } from "@/theme";
import { Empty, Muted, Row, triggerHaptic } from "@/components/ui";
import type { Message, RoomChannel } from "@/types";

type OutboxMsg = Omit<Message, "attachment"> & {
  pending?: boolean;
  failed?: boolean;
  client_message_id?: string;
  attachment?: {
    id?: string;
    url: string;
    type: string;
    name?: string;
    size?: number;
    duration?: number;
    storagePath?: string;
  } | null;
};

type PendingAttachment = {
  url: string;
  type: "image" | "file" | "voice";
  name: string;
  size?: number;
  duration?: number;
  storagePath?: string;
};

interface Props {
  conversationId: string | null | undefined;
  isMember: boolean;
  channel?: RoomChannel | null;
  isEducator?: boolean;
}

const COMMON_EMOJIS = ["👍", "❤️", "😂", "🔥", "🎉", "💡"];

export function RoomChatTab({ conversationId, isMember, channel, isEducator }: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const { session } = useSession();
  const qc = useQueryClient();

  // Composer States
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);

  // Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  // Message Action Sheet (long-press)
  const [selectedMsg, setSelectedMsg] = useState<OutboxMsg | null>(null);

  // Voice Note Recording
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  const voiceRecordingRef = useRef<Audio.Recording | null>(null);
  const voiceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Voice Note Playback
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const voiceSoundRef = useRef<Audio.Sound | null>(null);

  // Real-time Typing Indicators
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const listRef = useRef<FlatList<OutboxMsg>>(null);
  const socket = getSocket();

  const queryKey = ["room-chat", conversationId];

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () =>
      api<{ messages: OutboxMsg[] }>(`/chat/conversations/${conversationId}/messages`),
    enabled: Boolean(conversationId) && isMember,
    staleTime: 30_000,
  });

  const messages = data?.messages ?? [];
  const myId = session?.user?.id;
  const myName =
    session?.user?.user_metadata?.full_name ||
    session?.user?.user_metadata?.username ||
    "Someone";
  const isAnnouncementReadOnly = channel?.type === "announcement" && !isEducator;

  // Filter messages if search is active
  const displayedMessages = searchQuery.trim()
    ? messages.filter((m) =>
        m.body?.toLowerCase().includes(searchQuery.toLowerCase().trim())
      )
    : messages;

  // Clean voice sound on unmount
  useEffect(() => {
    return () => {
      if (voiceSoundRef.current) {
        voiceSoundRef.current.unloadAsync().catch(() => {});
        voiceSoundRef.current = null;
      }
      if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
    };
  }, []);

  // Real-time socket synchronization engine
  useEffect(() => {
    if (!conversationId || !socket) return;

    // Join channel conversation
    socket.emit("join_conversation", { conversation_id: conversationId });

    // Handle reconnect: re-join and invalidate stale messages
    const onConnect = () => {
      socket.emit("join_conversation", { conversation_id: conversationId });
      qc.invalidateQueries({ queryKey });
    };

    // 1. New Message Listener with Deduplication
    const onMessage = (payload: any) => {
      const msg: OutboxMsg = payload?.message ?? payload;
      if (!msg || msg.conversation_id !== conversationId) return;

      qc.setQueryData<{ messages: OutboxMsg[] }>(queryKey, (old) => {
        const current = old?.messages ?? [];
        const matchIndex = current.findIndex(
          (m) =>
            (m.id && msg.id && m.id === msg.id) ||
            (m.client_message_id &&
              msg.client_message_id &&
              m.client_message_id === msg.client_message_id)
        );

        if (matchIndex >= 0) {
          const next = [...current];
          next[matchIndex] = { ...next[matchIndex], ...msg, pending: false };
          return { messages: next };
        }
        return { messages: [...current, msg] };
      });
    };

    // 2. Typing Indicators
    const onTypingStart = ({ userId: uId, conversationId: cId, userName }: any) => {
      if (cId !== conversationId || uId === myId) return;
      setTypingUsers((prev) => ({ ...prev, [uId]: userName || "Someone" }));
    };

    const onTypingStop = ({ userId: uId, conversationId: cId }: any) => {
      if (cId !== conversationId) return;
      setTypingUsers((prev) => {
        const next = { ...prev };
        delete next[uId];
        return next;
      });
    };

    // 3. Reactions Add / Remove
    const onReactionAdd = ({ messageId, reaction }: any) => {
      if (!messageId || !reaction) return;
      qc.setQueryData<{ messages: OutboxMsg[] }>(queryKey, (old) => {
        const msgs = old?.messages ?? [];
        return {
          messages: msgs.map((m) => {
            if (m.id !== messageId) return m;
            const existing = m.reactions ?? [];
            if (
              existing.some(
                (r) =>
                  r.id === reaction.id ||
                  (r.user_id === reaction.user_id && r.reaction === reaction.reaction)
              )
            ) {
              return m;
            }
            return { ...m, reactions: [...existing, reaction] };
          }),
        };
      });
    };

    const onReactionRemove = ({ messageId, reaction, userId: rUserId }: any) => {
      if (!messageId || !reaction) return;
      qc.setQueryData<{ messages: OutboxMsg[] }>(queryKey, (old) => {
        const msgs = old?.messages ?? [];
        return {
          messages: msgs.map((m) => {
            if (m.id !== messageId) return m;
            return {
              ...m,
              reactions: (m.reactions ?? []).filter(
                (r) => !(r.user_id === rUserId && r.reaction === reaction)
              ),
            };
          }),
        };
      });
    };

    // 4. Message Deleted / Soft-Deleted
    const onMessageDeleted = ({ messageId }: any) => {
      if (!messageId) return;
      qc.setQueryData<{ messages: OutboxMsg[] }>(queryKey, (old) => {
        const msgs = old?.messages ?? [];
        return {
          messages: msgs.map((m) =>
            m.id === messageId
              ? { ...m, body: "This message was deleted.", attachment: null }
              : m
          ),
        };
      });
    };

    socket.on("connect", onConnect);
    socket.on("message:new", onMessage);
    socket.on("typing:start", onTypingStart);
    socket.on("typing:stop", onTypingStop);
    socket.on("message:reaction:add", onReactionAdd);
    socket.on("message:reaction:remove", onReactionRemove);
    socket.on("message:deleted", onMessageDeleted);
    socket.on("message:delete", onMessageDeleted);

    return () => {
      socket.off("connect", onConnect);
      socket.off("message:new", onMessage);
      socket.off("typing:start", onTypingStart);
      socket.off("typing:stop", onTypingStop);
      socket.off("message:reaction:add", onReactionAdd);
      socket.off("message:reaction:remove", onReactionRemove);
      socket.off("message:deleted", onMessageDeleted);
      socket.off("message:delete", onMessageDeleted);
      socket.emit("leave_conversation", { conversation_id: conversationId });
    };
  }, [conversationId, socket, myId, qc, queryKey]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (displayedMessages.length > 0 && !isSearching) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [displayedMessages.length, isSearching]);

  // Text Change with real-time typing broadcast
  function handleTextChange(text: string) {
    setBody(text);
    if (!conversationId || !socket) return;

    if (text.trim()) {
      socket.emit("typing:start", { conversationId, userName: myName });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit("typing:stop", { conversationId });
      }, 2500);
    } else {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      socket.emit("typing:stop", { conversationId });
    }
  }

  // Cloudflare R2 Upload Pipeline
  async function uploadToR2(
    uploadUri: string,
    fileName: string,
    mimeType: string,
    fileSize: number,
    type: "image" | "file" | "voice",
    duration?: number
  ) {
    if (!conversationId) return;
    setUploadingMedia(true);
    try {
      const ticketRes = await api<{
        url?: string;
        uploadUrl?: string;
        publicUrl?: string;
        signedUrl?: string;
        storagePath: string;
      }>(`/chat/conversations/${conversationId}/attachment-ticket`, {
        method: "POST",
        body: JSON.stringify({
          filename: fileName,
          contentType: mimeType,
          sizeBytes: fileSize || 1024,
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

      if (!putRes.ok) {
        throw new Error(`Upload failed (${putRes.status}). Please try again.`);
      }

      const finalUrl = ticketRes.signedUrl || ticketRes.publicUrl;
      if (!finalUrl) {
        throw new Error("Could not resolve a readable link for the uploaded file.");
      }

      const pending: PendingAttachment = {
        url: finalUrl,
        type,
        name: fileName,
        size: fileSize,
        duration,
        storagePath: ticketRes.storagePath,
      };

      setPendingAttachment(pending);
      triggerHaptic();
      return pending;
    } catch (err: any) {
      Alert.alert(
        "Attachment Upload Failed",
        err?.message || "Could not upload attachment to Cloudflare R2 storage."
      );
      return null;
    } finally {
      setUploadingMedia(false);
    }
  }

  // Voice Note Recording
  async function startVoiceRecording() {
    triggerHaptic();
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Permission Required",
          "Please allow microphone access to record voice notes."
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
          if (sec + 1 >= 300) void finishVoiceRecording();
          return sec + 1;
        });
      }, 1000);
    } catch (err: any) {
      Alert.alert("Microphone Unavailable", err?.message || "Could not start recording.");
      voiceRecordingRef.current = null;
      setIsRecordingVoice(false);
    }
  }

  async function cancelVoiceRecording() {
    triggerHaptic();
    setIsRecordingVoice(false);
    if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
    setVoiceSeconds(0);
    const rec = voiceRecordingRef.current;
    voiceRecordingRef.current = null;
    if (rec) {
      try {
        await rec.stopAndUnloadAsync();
      } catch {}
    }
  }

  async function finishVoiceRecording() {
    triggerHaptic();
    setIsRecordingVoice(false);
    if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
    const duration = Math.max(voiceSeconds, 1);
    setVoiceSeconds(0);

    const rec = voiceRecordingRef.current;
    voiceRecordingRef.current = null;
    if (!rec) return;

    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      if (!uri) throw new Error("Could not get voice recording URI.");

      const rawFileName = `voice_${Date.now()}.m4a`;
      const uploaded = await uploadToR2(
        uri,
        rawFileName,
        "audio/m4a",
        1024 * duration,
        "voice",
        duration
      );

      // Auto-send voice note once recorded and uploaded
      if (uploaded) {
        await sendDirectAttachment(uploaded);
      }
    } catch (err: any) {
      Alert.alert("Voice Note Failed", err?.message || "Could not process voice note.");
    }
  }

  // Voice Note Playback
  async function togglePlayVoiceNote(url: string, messageId: string) {
    triggerHaptic();
    if (playingVoiceId === messageId) {
      if (voiceSoundRef.current) {
        await voiceSoundRef.current.pauseAsync().catch(() => {});
        setPlayingVoiceId(null);
      }
      return;
    }

    if (voiceSoundRef.current) {
      await voiceSoundRef.current.stopAsync().catch(() => {});
      await voiceSoundRef.current.unloadAsync().catch(() => {});
      voiceSoundRef.current = null;
    }

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri: url },
        { shouldPlay: true },
        (status) => {
          if (status.isLoaded && status.didJustFinish) {
            setPlayingVoiceId(null);
            sound.unloadAsync().catch(() => {});
            voiceSoundRef.current = null;
          }
        }
      );

      voiceSoundRef.current = sound;
      setPlayingVoiceId(messageId);
    } catch (err: any) {
      setPlayingVoiceId(null);
      Alert.alert("Playback Error", "Could not play voice note.");
    }
  }

  // Pick Photo from Library
  async function pickPhoto() {
    setShowAttachmentMenu(false);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Permission Required",
          "Please allow photo library access to share photos in room chat."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]?.uri) return;
      triggerHaptic();

      const asset = result.assets[0];
      const rawFileName = asset.fileName || `photo_${Date.now()}.jpg`;
      const optimized = await optimizeImageForUpload(
        asset.uri,
        OPTIMIZATION_PRESETS.CHAT_PHOTO,
        rawFileName
      );

      await uploadToR2(
        optimized.uri || asset.uri,
        optimized.fileName || rawFileName,
        optimized.mimeType || "image/jpeg",
        optimized.fileSizeBytes || asset.fileSize || 180 * 1024,
        "image"
      );
    } catch (err: any) {
      Alert.alert("Photo Pick Error", err?.message || "Could not select photo.");
    }
  }

  // Capture Photo with Camera
  async function takePhoto() {
    setShowAttachmentMenu(false);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Camera Permission Required",
          "Please allow camera access to take and share photos in room chat."
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      triggerHaptic();

      const asset = result.assets[0];
      const rawFileName = asset.fileName || `camera_${Date.now()}.jpg`;
      const optimized = await optimizeImageForUpload(
        asset.uri,
        OPTIMIZATION_PRESETS.CHAT_PHOTO,
        rawFileName
      );

      await uploadToR2(
        optimized.uri || asset.uri,
        optimized.fileName || rawFileName,
        optimized.mimeType || "image/jpeg",
        optimized.fileSizeBytes || asset.fileSize || 180 * 1024,
        "image"
      );
    } catch (err: any) {
      Alert.alert("Camera Error", err?.message || "Could not capture photo.");
    }
  }

  // Pick Document / PDF
  async function pickDocument() {
    setShowAttachmentMenu(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "text/plain",
          "application/zip",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]?.uri) return;
      triggerHaptic();

      const doc = result.assets[0];
      const mimeType = doc.mimeType || "application/pdf";
      const fileName = doc.name || `doc_${Date.now()}.pdf`;
      const fileSize = doc.size ?? 1024 * 100;

      await uploadToR2(doc.uri, fileName, mimeType, fileSize, "file");
    } catch (err: any) {
      Alert.alert("Document Pick Error", err?.message || "Could not pick document.");
    }
  }

  // Open or Download Attachment
  async function handleOpenAttachment(attachment: NonNullable<OutboxMsg["attachment"]>) {
    triggerHaptic();
    if (!attachment) return;

    try {
      if (attachment.storagePath && conversationId) {
        try {
          const res = await api<{ url: string }>(
            `/chat/conversations/${conversationId}/attachments/${attachment.id || "current"}/download?storagePath=${encodeURIComponent(attachment.storagePath)}`
          );
          if (res?.url) {
            Linking.openURL(res.url).catch(() => {
              Alert.alert("Error", "Could not open document link.");
            });
            return;
          }
        } catch {}
      }

      if (attachment.url) {
        Linking.openURL(attachment.url).catch(() => {
          Alert.alert("Error", "Could not open attachment link.");
        });
      }
    } catch (err: any) {
      Alert.alert("Cannot open file", err?.message || "Failed to open attachment.");
    }
  }

  // Emoji Reactions Toggle
  async function toggleReaction(messageId: string, emoji: string) {
    triggerHaptic();
    const msg = messages.find((m) => m.id === messageId);
    const existing = msg?.reactions?.find(
      (r) => r.user_id === myId && r.reaction === emoji
    );

    if (existing) {
      // Optimistic removal
      qc.setQueryData<{ messages: OutboxMsg[] }>(queryKey, (old) => ({
        messages: (old?.messages ?? []).map((m) =>
          m.id === messageId
            ? {
                ...m,
                reactions: (m.reactions ?? []).filter(
                  (r) => !(r.user_id === myId && r.reaction === emoji)
                ),
              }
            : m
        ),
      }));

      try {
        await api(`/chat/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, {
          method: "DELETE",
        });
      } catch {}
    } else {
      // Optimistic add
      const tempReaction = {
        id: uuidv4(),
        message_id: messageId,
        user_id: myId || "me",
        reaction: emoji,
      };

      qc.setQueryData<{ messages: OutboxMsg[] }>(queryKey, (old) => ({
        messages: (old?.messages ?? []).map((m) =>
          m.id === messageId
            ? { ...m, reactions: [...(m.reactions ?? []), tempReaction] }
            : m
        ),
      }));

      try {
        await api(`/chat/messages/${messageId}/reactions`, {
          method: "POST",
          body: JSON.stringify({ reaction: emoji }),
        });
      } catch {}
    }
  }

  // Delete / Moderate Message
  async function handleDeleteMessage(msg: OutboxMsg) {
    triggerHaptic();
    Alert.alert(
      "Delete Message",
      msg.sender_id === myId
        ? "Are you sure you want to delete this message?"
        : "Delete this message as staff moderator?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setSelectedMsg(null);
            // Optimistic update
            qc.setQueryData<{ messages: OutboxMsg[] }>(queryKey, (old) => ({
              messages: (old?.messages ?? []).map((m) =>
                m.id === msg.id
                  ? { ...m, body: "This message was deleted.", attachment: null }
                  : m
              ),
            }));

            try {
              await api(`/chat/messages/${msg.id}`, { method: "DELETE" });
            } catch (err: any) {
              Alert.alert("Delete Failed", err?.message || "Could not delete message.");
              qc.invalidateQueries({ queryKey });
            }
          },
        },
      ]
    );
  }

  // Direct Attachment Send (for voice notes)
  async function sendDirectAttachment(attachment: PendingAttachment) {
    if (!conversationId) return;
    const clientId = uuidv4();
    const optimisticMsg: OutboxMsg = {
      id: clientId,
      client_message_id: clientId,
      conversation_id: conversationId,
      sender_id: myId || "me",
      body: "",
      created_at: new Date().toISOString(),
      pending: true,
      attachment,
      sender: {
        id: myId || "me",
        full_name: myName,
        avatar_url: session?.user?.user_metadata?.avatar_url,
      },
    };

    qc.setQueryData<{ messages: OutboxMsg[] }>(queryKey, (old) => ({
      messages: [...(old?.messages ?? []), optimisticMsg],
    }));

    try {
      const res = await api<OutboxMsg>(`/chat/conversations/${conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          body: "",
          client_message_id: clientId,
          attachment,
        }),
      });

      if (res && res.id) {
        qc.setQueryData<{ messages: OutboxMsg[] }>(queryKey, (old) => {
          const current = old?.messages ?? [];
          return {
            messages: current.map((m) =>
              m.client_message_id === clientId || m.id === res.id
                ? { ...res, pending: false }
                : m
            ),
          };
        });
      }
    } catch {
      qc.setQueryData<{ messages: OutboxMsg[] }>(queryKey, (old) => ({
        messages: (old?.messages ?? []).filter((m) => m.client_message_id !== clientId),
      }));
    }
  }

  // Send Message with optimistic UI
  async function sendMessage() {
    const text = body.trim();
    const currentAttachment = pendingAttachment;
    if ((!text && !currentAttachment) || !conversationId || sending) return;

    if (isAnnouncementReadOnly) {
      Alert.alert(
        "Announcements Only",
        "Only teachers and room administrators can post in this announcement channel."
      );
      return;
    }

    if (socket) {
      socket.emit("typing:stop", { conversationId });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    }

    const clientId = uuidv4();
    const optimisticMsg: OutboxMsg = {
      id: clientId,
      client_message_id: clientId,
      conversation_id: conversationId,
      sender_id: myId || "me",
      body: text,
      created_at: new Date().toISOString(),
      pending: true,
      attachment: currentAttachment || undefined,
      sender: {
        id: myId || "me",
        full_name: myName,
        avatar_url: session?.user?.user_metadata?.avatar_url,
      },
    };

    setBody("");
    setPendingAttachment(null);
    setSending(true);

    qc.setQueryData<{ messages: OutboxMsg[] }>(queryKey, (old) => ({
      messages: [...(old?.messages ?? []), optimisticMsg],
    }));

    try {
      const res = await api<OutboxMsg>(`/chat/conversations/${conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          body: text,
          client_message_id: clientId,
          attachment: currentAttachment || undefined,
        }),
      });

      const resolvedMsg = res;
      if (resolvedMsg && resolvedMsg.id) {
        qc.setQueryData<{ messages: OutboxMsg[] }>(queryKey, (old) => {
          const current = old?.messages ?? [];
          return {
            messages: current.map((m) =>
              m.client_message_id === clientId || m.id === resolvedMsg.id
                ? { ...resolvedMsg, pending: false }
                : m
            ),
          };
        });
      }
    } catch (err: any) {
      Alert.alert(
        "Failed to send message",
        err?.message || "Please check your network connection and try again."
      );
      setBody(text);
      if (currentAttachment) setPendingAttachment(currentAttachment);
      qc.setQueryData<{ messages: OutboxMsg[] }>(queryKey, (old) => ({
        messages: (old?.messages ?? []).filter((m) => m.client_message_id !== clientId),
      }));
    } finally {
      setSending(false);
    }
  }

  // Format typing users text
  const typingUserNames = Object.values(typingUsers);
  const typingText =
    typingUserNames.length === 1
      ? `${typingUserNames[0]} is typing…`
      : typingUserNames.length === 2
      ? `${typingUserNames[0]} and ${typingUserNames[1]} are typing…`
      : typingUserNames.length > 2
      ? `${typingUserNames[0]} and ${typingUserNames.length - 1} others are typing…`
      : "";

  if (!conversationId) {
    return (
      <View style={[s.centered, { backgroundColor: colors.bg }]}>
        <Empty
          title="Chat channel not linked"
          detail="This channel does not have an active conversation yet."
        />
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
    <View style={[s.container, { backgroundColor: colors.bg }]}>
      {/* Search Header Bar (when active) */}
      {isSearching && (
        <Row
          style={[
            s.searchHeaderBar,
            { backgroundColor: colors.surface, borderBottomColor: colors.border },
          ]}
        >
          <MaterialCommunityIcons name="magnify" size={18} color={colors.muted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search channel messages…"
            placeholderTextColor={colors.muted}
            style={[s.searchInput, { color: colors.text }]}
            autoFocus
          />
          {Boolean(searchQuery) && (
            <Pressable onPress={() => setSearchQuery("")} style={s.searchIconBtn}>
              <MaterialCommunityIcons name="close" size={16} color={colors.muted} />
            </Pressable>
          )}
          <Pressable
            onPress={() => {
              setIsSearching(false);
              setSearchQuery("");
            }}
            style={s.searchCancelBtn}
          >
            <Text style={{ fontSize: 13, color: colors.primary, fontWeight: "700" }}>
              Done
            </Text>
          </Pressable>
        </Row>
      )}

      {/* Privacy / Announcements Information Banner */}
      {channel?.is_private && (
        <View
          style={[
            s.channelBanner,
            { backgroundColor: colors.danger + "12", borderColor: colors.danger + "30" },
          ]}
        >
          <MaterialCommunityIcons name="shield-lock" size={16} color={colors.danger} />
          <Text style={[s.channelBannerText, { color: colors.danger }]}>
            Private Channel: Visible only to teachers, admins, and moderators.
          </Text>
        </View>
      )}

      {channel?.type === "announcement" && (
        <View
          style={[
            s.channelBanner,
            { backgroundColor: colors.primary + "12", borderColor: colors.primary + "30" },
          ]}
        >
          <MaterialCommunityIcons name="bullhorn" size={16} color={colors.primary} />
          <Text style={[s.channelBannerText, { color: colors.primary }]}>
            {isEducator
              ? "Announcements Channel: Post broadcasts for all room members."
              : "Announcements Channel: Read-only for learners. Only educators post here."}
          </Text>
        </View>
      )}

      {isLoading ? (
        <View style={s.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Muted style={{ marginTop: 10 }}>Loading channel messages…</Muted>
        </View>
      ) : isError ? (
        <View style={s.centered}>
          <Empty
            title="Could not load messages"
            detail="Please check your connection and pull to retry."
          />
        </View>
      ) : displayedMessages.length === 0 ? (
        <View style={s.centered}>
          <Empty
            title={
              searchQuery
                ? "No matching messages"
                : channel?.is_private
                ? "Private Staff Chat"
                : "No messages yet"
            }
            detail={
              searchQuery
                ? "Try searching for a different keyword."
                : channel?.is_private
                ? "Start a discussion with room teachers and moderators."
                : "Be the first to say hello in this channel!"
            }
          />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={displayedMessages}
          keyExtractor={(m) => m.client_message_id ?? m.id}
          contentContainerStyle={[s.listContent, { paddingBottom: 90 + keyboardHeight }]}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => {
            if (!isSearching) listRef.current?.scrollToEnd({ animated: false });
          }}
          renderItem={({ item }) => {
            const isMe = item.sender_id === myId;
            const senderName =
              (item as any).sender?.full_name ??
              (item as any).sender?.username ??
              "Member";
            const senderAvatar = (item as any).sender?.avatar_url;
            const myAvatar = session?.user?.user_metadata?.avatar_url;
            const myInitial = (session?.user?.user_metadata?.full_name || "Y")
              .charAt(0)
              .toUpperCase();
            const isDeleted = item.body === "This message was deleted.";

            // Group reactions
            const reactionCounts: Record<string, { count: number; hasMine: boolean }> = {};
            for (const r of item.reactions ?? []) {
              if (!reactionCounts[r.reaction]) {
                reactionCounts[r.reaction] = { count: 0, hasMine: false };
              }
              reactionCounts[r.reaction].count += 1;
              if (r.user_id === myId) {
                reactionCounts[r.reaction].hasMine = true;
              }
            }

            return (
              <View
                style={[
                  s.messageRow,
                  { justifyContent: isMe ? "flex-end" : "flex-start" },
                ]}
              >
                {/* Incoming Avatar on Left */}
                {!isMe && (
                  <View style={s.avatarCol}>
                    {senderAvatar ? (
                      <Image source={{ uri: senderAvatar }} style={s.avatarImg} />
                    ) : (
                      <View
                        style={[
                          s.avatarImg,
                          s.placeholderAvatar,
                          { backgroundColor: colors.primarySoft },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: "700",
                            color: colors.primary,
                          }}
                        >
                          {senderName.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                <Pressable
                  onLongPress={() => {
                    triggerHaptic();
                    if (!isDeleted) setSelectedMsg(item);
                  }}
                  delayLongPress={250}
                  style={[
                    s.bubbleBody,
                    {
                      backgroundColor: isDeleted
                        ? colors.surface2
                        : isMe
                        ? isDark
                          ? colors.surface2
                          : colors.primarySoft
                        : colors.surface,
                      borderColor: colors.border,
                      borderWidth: 1,
                      borderTopRightRadius: isMe ? 4 : 18,
                      borderTopLeftRadius: isMe ? 18 : 4,
                    },
                  ]}
                >
                  {!isMe && (
                    <Text
                      style={[s.senderName, { color: colors.primary }]}
                      numberOfLines={1}
                    >
                      {senderName}
                    </Text>
                  )}

                  {/* Image Attachment Rendering */}
                  {item.attachment && item.attachment.type === "image" && (
                    <Pressable
                      onPress={() => handleOpenAttachment(item.attachment!)}
                      style={s.imageAttachmentWrap}
                    >
                      <Image
                        source={{ uri: item.attachment.url }}
                        style={s.attachmentImage}
                        resizeMode="cover"
                      />
                    </Pressable>
                  )}

                  {/* Voice Note Attachment Rendering */}
                  {item.attachment && item.attachment.type === "voice" && (
                    <View
                      style={[
                        s.voiceNoteCard,
                        {
                          backgroundColor: isDark ? colors.surface : colors.surface2,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <Pressable
                        onPress={() =>
                          togglePlayVoiceNote(item.attachment!.url, item.id)
                        }
                        style={[
                          s.voicePlayBtn,
                          { backgroundColor: colors.primary },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={
                            playingVoiceId === item.id ? "pause" : "play"
                          }
                          size={18}
                          color={colors.white}
                        />
                      </Pressable>
                      <View style={{ flex: 1, gap: 4 }}>
                        <Row style={{ alignItems: "center", gap: 3 }}>
                          {[6, 14, 22, 10, 18, 24, 12, 16, 8, 20, 12].map(
                            (h, idx) => (
                              <View
                                key={idx}
                                style={[
                                  s.waveformBar,
                                  {
                                    height: h,
                                    backgroundColor:
                                      playingVoiceId === item.id
                                        ? colors.primary
                                        : colors.muted,
                                  },
                                ]}
                              />
                            )
                          )}
                        </Row>
                        <Text style={[s.voiceMetaText, { color: colors.muted }]}>
                          Voice message ·{" "}
                          {item.attachment.duration
                            ? `${Math.floor(item.attachment.duration / 60)}:${String(
                                item.attachment.duration % 60
                              ).padStart(2, "0")}`
                            : "0:10"}
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Document / PDF / File Attachment Card */}
                  {item.attachment &&
                    item.attachment.type !== "image" &&
                    item.attachment.type !== "voice" && (
                      <Pressable
                        onPress={() => handleOpenAttachment(item.attachment!)}
                        style={[
                          s.fileCardModern,
                          {
                            backgroundColor: isDark ? colors.surface : colors.surface2,
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        <View
                          style={[
                            s.fileIconBadge,
                            {
                              backgroundColor: item.attachment.name?.endsWith(".pdf")
                                ? colors.danger
                                : colors.primary,
                            },
                          ]}
                        >
                          <MaterialCommunityIcons
                            name={
                              item.attachment.name?.endsWith(".pdf")
                                ? "file-pdf-box"
                                : "file-document-outline"
                            }
                            size={24}
                            color={colors.white}
                          />
                        </View>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text
                            style={[s.fileNameModern, { color: colors.text }]}
                            numberOfLines={1}
                          >
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
                        <View
                          style={[
                            s.fileDownloadCircle,
                            { backgroundColor: colors.primarySoft },
                          ]}
                        >
                          <MaterialCommunityIcons
                            name="arrow-down"
                            size={18}
                            color={colors.primary}
                          />
                        </View>
                      </Pressable>
                    )}

                  {Boolean(item.body) && (
                    <Text
                      style={[
                        s.msgText,
                        {
                          color: isDeleted ? colors.muted : colors.text,
                          fontStyle: isDeleted ? "italic" : "normal",
                        },
                      ]}
                    >
                      {item.body}
                    </Text>
                  )}

                  <View style={s.timeRow}>
                    <Text style={[s.msgTime, { color: colors.muted }]}>
                      {new Date(item.created_at).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
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

                  {/* Reaction Badges Container */}
                  {Object.keys(reactionCounts).length > 0 && (
                    <Row style={s.reactionsRow}>
                      {Object.entries(reactionCounts).map(([emoji, rInfo]) => (
                        <Pressable
                          key={emoji}
                          onPress={() => toggleReaction(item.id, emoji)}
                          style={[
                            s.reactionBadge,
                            {
                              backgroundColor: rInfo.hasMine
                                ? colors.primary + "20"
                                : colors.surface2,
                              borderColor: rInfo.hasMine
                                ? colors.primary
                                : colors.border,
                            },
                          ]}
                        >
                          <Text style={s.reactionEmojiText}>{emoji}</Text>
                          <Text
                            style={[
                              s.reactionCountText,
                              {
                                color: rInfo.hasMine ? colors.primary : colors.text,
                              },
                            ]}
                          >
                            {rInfo.count}
                          </Text>
                        </Pressable>
                      ))}
                    </Row>
                  )}
                </Pressable>

                {/* Outgoing Avatar on Right */}
                {isMe && (
                  <View style={s.avatarColRight}>
                    {myAvatar ? (
                      <Image source={{ uri: myAvatar }} style={s.avatarImg} />
                    ) : (
                      <View
                        style={[
                          s.avatarImg,
                          s.placeholderAvatar,
                          { backgroundColor: colors.primarySoft },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: "700",
                            color: colors.primary,
                          }}
                        >
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

      {/* Real-time Typing Indicator Pill */}
      {Boolean(typingText) && (
        <View
          style={[
            s.typingBar,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={[s.typingDot, { backgroundColor: colors.primary }]} />
          <Text style={[s.typingText, { color: colors.muted }]} numberOfLines={1}>
            {typingText}
          </Text>
        </View>
      )}

      {/* Floating Attachment / Composer Container */}
      <View
        style={[
          s.composerContainer,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            paddingBottom: Math.max(insets.bottom, 10) + 4,
            bottom: keyboardHeight,
          },
        ]}
      >
        {/* Voice Note Recording Live Bar */}
        {isRecordingVoice ? (
          <Row style={[s.voiceRecordingBar, { backgroundColor: colors.surface2 }]}>
            <View style={s.recBlinkingDot} />
            <Text style={[s.recTimeText, { color: colors.danger }]}>
              {`${Math.floor(voiceSeconds / 60)}:${String(
                voiceSeconds % 60
              ).padStart(2, "0")}`}
            </Text>
            <Text style={[s.recStatusText, { color: colors.muted }]}>
              Recording voice note…
            </Text>
            <Row style={{ alignItems: "center", gap: 10, marginLeft: "auto" }}>
              <Pressable
                onPress={cancelVoiceRecording}
                style={[s.recCancelBtn, { backgroundColor: colors.border }]}
              >
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text }}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={finishVoiceRecording}
                style={[s.recSendBtn, { backgroundColor: colors.primary }]}
              >
                <MaterialCommunityIcons name="send" size={16} color={colors.white} />
              </Pressable>
            </Row>
          </Row>
        ) : (
          <>
            {/* Uploading Progress Bar */}
            {uploadingMedia && (
              <View
                style={[
                  s.uploadProgressRow,
                  { backgroundColor: colors.surface2, borderColor: colors.border },
                ]}
              >
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={{ fontSize: 12, color: colors.text, fontWeight: "600" }}>
                  Uploading attachment to Cloudflare R2 storage…
                </Text>
              </View>
            )}

            {/* Pending Attachment Preview Bar */}
            {pendingAttachment && !uploadingMedia && (
              <View
                style={[
                  s.pendingAttachmentBar,
                  { backgroundColor: colors.surface2, borderColor: colors.border },
                ]}
              >
                {pendingAttachment.type === "image" ? (
                  <Image
                    source={{ uri: pendingAttachment.url }}
                    style={s.pendingThumb}
                  />
                ) : (
                  <View
                    style={[
                      s.pendingThumb,
                      s.pendingFileIcon,
                      { backgroundColor: colors.surface },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={
                        pendingAttachment.name?.endsWith(".pdf")
                          ? "file-pdf-box"
                          : "file-document"
                      }
                      size={20}
                      color={colors.primary}
                    />
                  </View>
                )}
                <View style={{ flex: 1, gap: 1 }}>
                  <Text
                    style={[s.pendingName, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {pendingAttachment.name}
                  </Text>
                  <Text style={[s.pendingMeta, { color: colors.muted }]}>
                    Ready to send · Cloudflare R2
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    triggerHaptic();
                    setPendingAttachment(null);
                  }}
                  style={s.removePendingBtn}
                  hitSlop={8}
                >
                  <MaterialCommunityIcons
                    name="close-circle"
                    size={20}
                    color={colors.danger}
                  />
                </Pressable>
              </View>
            )}

            {/* Normal Input Row */}
            <View style={s.inputRow}>
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  setShowAttachmentMenu(true);
                }}
                disabled={isAnnouncementReadOnly || uploadingMedia}
                style={[
                  s.plusBtn,
                  {
                    backgroundColor: isAnnouncementReadOnly
                      ? colors.muted
                      : colors.primary,
                    opacity: isAnnouncementReadOnly ? 0.5 : 1,
                  },
                ]}
              >
                <MaterialCommunityIcons name="plus" size={20} color={colors.white} />
              </Pressable>

              <Pressable
                onPress={() => {
                  triggerHaptic();
                  setShowAttachmentMenu(true);
                }}
                disabled={isAnnouncementReadOnly || uploadingMedia}
                style={[
                  s.composerActionIconBtn,
                  { opacity: isAnnouncementReadOnly ? 0.4 : 1 },
                ]}
                accessibilityLabel="Attach file"
              >
                <MaterialCommunityIcons
                  name="paperclip"
                  size={22}
                  color={colors.muted}
                />
              </Pressable>

              <Pressable
                onPress={startVoiceRecording}
                disabled={isAnnouncementReadOnly || uploadingMedia}
                style={[
                  s.composerActionIconBtn,
                  { opacity: isAnnouncementReadOnly ? 0.4 : 1 },
                ]}
                accessibilityLabel="Record voice note"
              >
                <MaterialCommunityIcons
                  name="microphone-outline"
                  size={22}
                  color={colors.muted}
                />
              </Pressable>

              <View
                style={[
                  s.inputWrap,
                  {
                    backgroundColor: colors.surface2,
                    borderColor: colors.border,
                    opacity: isAnnouncementReadOnly ? 0.6 : 1,
                  },
                ]}
              >
                <TextInput
                  value={body}
                  onChangeText={handleTextChange}
                  placeholder={
                    isAnnouncementReadOnly
                      ? "Only educators can post announcements"
                      : "Type a message..."
                  }
                  placeholderTextColor={colors.muted}
                  style={[s.input, { color: colors.text }]}
                  multiline
                  maxLength={2000}
                  editable={!isAnnouncementReadOnly}
                  returnKeyType="default"
                  onSubmitEditing={sendMessage}
                  blurOnSubmit={false}
                />
              </View>

              <Pressable
                onPress={sendMessage}
                disabled={
                  (!body.trim() && !pendingAttachment) ||
                  sending ||
                  uploadingMedia ||
                  isAnnouncementReadOnly
                }
                style={[
                  s.sendBtn,
                  {
                    backgroundColor: colors.primary,
                    opacity:
                      (body.trim() || pendingAttachment) &&
                      !sending &&
                      !uploadingMedia &&
                      !isAnnouncementReadOnly
                        ? 1
                        : 0.5,
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
          </>
        )}
      </View>

      {/* Attachment Options Action Modal */}
      <Modal
        visible={showAttachmentMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAttachmentMenu(false)}
      >
        <Pressable
          style={s.modalBackdrop}
          onPress={() => setShowAttachmentMenu(false)}
        >
          <Pressable
            style={[
              s.attachmentMenuCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[s.menuTitle, { color: colors.text }]}>Add Attachment</Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 14 }}>
              Uploaded files are stored securely on Cloudflare R2 storage.
            </Text>

            <Pressable
              onPress={takePhoto}
              style={[s.menuOption, { borderColor: colors.border }]}
            >
              <View style={[s.menuIconCircle, { backgroundColor: colors.primary + "18" }]}>
                <MaterialCommunityIcons name="camera" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.menuOptionTitle, { color: colors.text }]}>Take Photo</Text>
                <Text style={[s.menuOptionSub, { color: colors.muted }]}>
                  Use camera to capture and send a picture
                </Text>
              </View>
            </Pressable>

            <Pressable
              onPress={pickPhoto}
              style={[s.menuOption, { borderColor: colors.border }]}
            >
              <View style={[s.menuIconCircle, { backgroundColor: colors.success + "18" }]}>
                <MaterialCommunityIcons
                  name="image-multiple"
                  size={20}
                  color={colors.success}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.menuOptionTitle, { color: colors.text }]}>
                  Choose from Gallery
                </Text>
                <Text style={[s.menuOptionSub, { color: colors.muted }]}>
                  Share photos and screenshots
                </Text>
              </View>
            </Pressable>

            <Pressable
              onPress={pickDocument}
              style={[s.menuOption, { borderColor: colors.border }]}
            >
              <View style={[s.menuIconCircle, { backgroundColor: colors.accent + "18" }]}>
                <MaterialCommunityIcons
                  name="file-document"
                  size={20}
                  color={colors.accent}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.menuOptionTitle, { color: colors.text }]}>
                  Upload Document / PDF
                </Text>
                <Text style={[s.menuOptionSub, { color: colors.muted }]}>
                  Share notes, assignments, and PDFs
                </Text>
              </View>
            </Pressable>

            <Pressable
              onPress={() => setShowAttachmentMenu(false)}
              style={[s.cancelBtn, { backgroundColor: colors.surface2 }]}
            >
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.text }}>
                Cancel
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Message Context Action Sheet (Long-Press) */}
      <Modal
        visible={Boolean(selectedMsg)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedMsg(null)}
      >
        <Pressable style={s.modalBackdrop} onPress={() => setSelectedMsg(null)}>
          <Pressable
            style={[
              s.actionSheetCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[s.actionSheetTitle, { color: colors.text }]}>
              Message Actions
            </Text>

            {/* Quick Emoji Reaction Bar */}
            <Row style={s.emojiReactionBar}>
              {COMMON_EMOJIS.map((emoji) => (
                <Pressable
                  key={emoji}
                  onPress={() => {
                    if (selectedMsg) {
                      toggleReaction(selectedMsg.id, emoji);
                      setSelectedMsg(null);
                    }
                  }}
                  style={s.emojiBtn}
                >
                  <Text style={{ fontSize: 24 }}>{emoji}</Text>
                </Pressable>
              ))}
            </Row>

            {/* Copy Message Text */}
            {Boolean(selectedMsg?.body) && (
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  if (selectedMsg?.body) {
                    Clipboard.setStringAsync(selectedMsg.body);
                    Alert.alert("Copied", "Message text copied to clipboard.");
                  }
                  setSelectedMsg(null);
                }}
                style={[s.actionSheetItem, { borderColor: colors.border }]}
              >
                <MaterialCommunityIcons
                  name="content-copy"
                  size={18}
                  color={colors.text}
                />
                <Text style={[s.actionSheetItemText, { color: colors.text }]}>
                  Copy Text
                </Text>
              </Pressable>
            )}

            {/* Delete / Moderation Action */}
            {(selectedMsg?.sender_id === myId || isEducator) && (
              <Pressable
                onPress={() => {
                  if (selectedMsg) handleDeleteMessage(selectedMsg);
                }}
                style={[s.actionSheetItem, { borderColor: colors.danger + "40" }]}
              >
                <MaterialCommunityIcons
                  name="trash-can-outline"
                  size={18}
                  color={colors.danger}
                />
                <Text style={[s.actionSheetItemText, { color: colors.danger }]}>
                  {selectedMsg?.sender_id === myId
                    ? "Delete Message"
                    : "Delete Message (Staff Moderation)"}
                </Text>
              </Pressable>
            )}

            <Pressable
              onPress={() => setSelectedMsg(null)}
              style={[s.cancelBtn, { backgroundColor: colors.surface2 }]}
            >
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.text }}>
                Cancel
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  searchHeaderBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 4,
  },
  searchIconBtn: {
    padding: 4,
  },
  searchCancelBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  channelBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  channelBannerText: {
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  listContent: {
    padding: spacing.md,
    gap: 10,
    paddingBottom: spacing.sm,
  },
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
    maxWidth: "78%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 4,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  senderName: { fontSize: 12, fontWeight: "700", marginBottom: 2 },
  msgText: { fontSize: 15, lineHeight: 21 },
  imageAttachmentWrap: {
    borderRadius: 12,
    overflow: "hidden",
    marginVertical: 4,
  },
  attachmentImage: {
    width: 220,
    height: 160,
    borderRadius: 12,
  },
  voiceNoteCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    marginVertical: 4,
    minWidth: 200,
  },
  voicePlayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  waveformBar: {
    width: 3,
    borderRadius: 1.5,
  },
  voiceMetaText: {
    fontSize: 11,
    fontWeight: "500",
  },
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
  reactionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 4,
  },
  reactionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  reactionEmojiText: {
    fontSize: 12,
  },
  reactionCountText: {
    fontSize: 11,
    fontWeight: "800",
  },
  typingBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderTopWidth: 1,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  typingText: {
    fontSize: 12,
    fontStyle: "italic",
  },
  composerContainer: {
    borderTopWidth: 1,
    paddingTop: 6,
  },
  voiceRecordingBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 12,
    marginBottom: 6,
    borderRadius: radius.md,
  },
  recBlinkingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#EF4444",
  },
  recTimeText: {
    fontSize: 14,
    fontWeight: "800",
  },
  recStatusText: {
    fontSize: 12,
  },
  recCancelBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  recSendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  uploadProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginHorizontal: 12,
    marginBottom: 6,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  pendingAttachmentBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 12,
    marginBottom: 6,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  pendingThumb: {
    width: 38,
    height: 38,
    borderRadius: 8,
  },
  pendingFileIcon: {
    alignItems: "center",
    justifyContent: "center",
  },
  pendingName: {
    fontSize: 13,
    fontWeight: "700",
  },
  pendingMeta: {
    fontSize: 11,
  },
  removePendingBtn: {
    padding: 4,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  attachmentMenuCard: {
    width: "100%",
    maxWidth: 380,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 18,
    gap: 10,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  menuOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  menuIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  menuOptionTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  menuOptionSub: {
    fontSize: 11,
    marginTop: 2,
  },
  cancelBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: radius.md,
    marginTop: 6,
  },
  actionSheetCard: {
    width: "100%",
    maxWidth: 380,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  actionSheetTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  emojiReactionBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  emojiBtn: {
    padding: 6,
  },
  actionSheetItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  actionSheetItemText: {
    fontSize: 14,
    fontWeight: "700",
  },
});
