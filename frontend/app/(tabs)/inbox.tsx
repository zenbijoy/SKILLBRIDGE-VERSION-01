import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { useAuth } from "@/features/auth/AuthProvider";
import { Empty, ErrorState, Skeleton, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import { useI18n } from "@/i18n";

type TabType = "chats" | "calls";
type ChatFilter = "all" | "unread" | "groups" | "archived";

interface ConversationItem {
  id: string;
  kind: "dm" | "group" | "room";
  title?: string | null;
  avatar_url?: string | null;
  peer_id?: string | null;
  is_online?: boolean;
  is_pinned?: boolean;
  is_archived?: boolean;
  muted_until?: string | null;
  unread_count?: number;
  last_message?: {
    id: string;
    body: string;
    sender_id: string;
    created_at: string;
  } | null;
  updated_at: string;
}

interface CallHistoryItem {
  id: string;
  caller_id: string;
  callee_id: string;
  type: "audio" | "video";
  status: string;
  duration_seconds: number;
  created_at: string;
  caller?: { full_name?: string; username?: string; avatar_url?: string } | null;
  callee?: { full_name?: string; username?: string; avatar_url?: string } | null;
}

interface ConnectionProfile {
  id: string;
  full_name?: string;
  username?: string;
  avatar_url?: string;
  headline?: string;
}

function formatChatTime(dateStr?: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) {
    return d.toLocaleDateString([], { weekday: "short" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatCallDuration(seconds: number): string {
  if (seconds <= 0) return "";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function Inbox() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Primary Tab: Chats vs Calls
  const [activeTab, setActiveTab] = useState<TabType>("chats");
  const [chatFilter, setChatFilter] = useState<ChatFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  // Modals & Action Sheet
  const [contextItem, setContextItem] = useState<ConversationItem | null>(null);
  const [mutePickerVisible, setMutePickerVisible] = useState(false);
  const [composeModalVisible, setComposeModalVisible] = useState(false);
  const [newCallModalVisible, setNewCallModalVisible] = useState(false);
  const [groupMode, setGroupMode] = useState(false);
  const [selectedPeers, setSelectedPeers] = useState<string[]>([]);
  const [groupTitle, setGroupTitle] = useState("");

  // 1. Conversations Query
  const conversationsQuery = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api<{ conversations: ConversationItem[] }>("/chat/conversations"),
    refetchInterval: 12_000,
  });

  // 2. Call History Query
  const callsQuery = useQuery({
    queryKey: ["calls-history"],
    queryFn: () => api<{ calls: CallHistoryItem[] }>("/calls/history?limit=40"),
    enabled: activeTab === "calls",
    refetchInterval: 15_000,
  });

  // 3. Connections Query (for Compose & New Call modals)
  const connectionsQuery = useQuery({
    queryKey: ["connections-contacts"],
    queryFn: () => api<{ connections: ConnectionProfile[] }>("/connections"),
    enabled: composeModalVisible || newCallModalVisible,
  });

  // Mutations
  const pinMutation = useMutation({
    mutationFn: ({ id, isPinned }: { id: string; isPinned: boolean }) =>
      api(`/chat/conversations/${id}/pin`, { method: "PATCH", body: JSON.stringify({ isPinned }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["conversations"] }),
  });

  const archiveMutation = useMutation({
    mutationFn: ({ id, isArchived }: { id: string; isArchived: boolean }) =>
      api(`/chat/conversations/${id}/archive`, { method: "PATCH", body: JSON.stringify({ isArchived }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["conversations"] }),
  });

  const muteMutation = useMutation({
    mutationFn: ({ id, duration }: { id: string; duration: string }) =>
      api(`/chat/conversations/${id}/mute`, { method: "PATCH", body: JSON.stringify({ duration }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["conversations"] }),
  });

  const unreadMutation = useMutation({
    mutationFn: ({ id, isUnread }: { id: string; isUnread: boolean }) =>
      api(`/chat/conversations/${id}/unread`, { method: "PATCH", body: JSON.stringify({ isUnread }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["conversations"] }),
  });

  const createConversationMutation = useMutation({
    mutationFn: (body: any) =>
      api<{ conversation: { id: string } }>("/chat/conversations", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setComposeModalVisible(false);
      setGroupMode(false);
      setSelectedPeers([]);
      setGroupTitle("");
      router.push(`/chat/${data.conversation.id}` as any);
    },
  });

  // Derived Totals
  const totalUnread = useMemo(() => {
    return (conversationsQuery.data?.conversations ?? []).reduce(
      (sum, item) => sum + (item.unread_count || 0),
      0
    );
  }, [conversationsQuery.data?.conversations]);

  const hasArchivedChats = useMemo(() => {
    return (conversationsQuery.data?.conversations ?? []).some((c) => c.is_archived);
  }, [conversationsQuery.data?.conversations]);

  // Filtered Chats
  const { pinnedList, normalList } = useMemo(() => {
    const list = conversationsQuery.data?.conversations ?? [];
    const q = searchQuery.trim().toLowerCase();

    const filtered = list.filter((conv) => {
      // Filter by archived status
      if (chatFilter === "archived") {
        if (!conv.is_archived) return false;
      } else {
        if (conv.is_archived) return false;
      }

      // Filter by unread
      if (chatFilter === "unread" && (!conv.unread_count || conv.unread_count <= 0)) {
        return false;
      }

      // Filter by groups
      if (chatFilter === "groups" && conv.kind === "dm") {
        return false;
      }

      // Search query
      if (q) {
        const titleMatch = (conv.title || "").toLowerCase().includes(q);
        const snippetMatch = (conv.last_message?.body || "").toLowerCase().includes(q);
        return titleMatch || snippetMatch;
      }

      return true;
    });

    const pinned = filtered.filter((c) => c.is_pinned);
    const normal = filtered.filter((c) => !c.is_pinned);

    return { pinnedList: pinned, normalList: normal };
  }, [conversationsQuery.data?.conversations, chatFilter, searchQuery]);

  // Handle Quick Call Trigger
  const handleStartCall = (peerId: string, peerName?: string, peerAvatar?: string, type: "audio" | "video" = "video") => {
    triggerHaptic();
    setNewCallModalVisible(false);
    const nameParam = encodeURIComponent(peerName || "SkillBridge Peer");
    const avatarParam = encodeURIComponent(peerAvatar || "");
    router.push(`/call/${peerId}?name=${nameParam}&avatar=${avatarParam}&type=${type}` as any);
  };

  // Render Conversation Row (Telegram Density: flat, compact, 64px height)
  const renderConversationRow = (item: ConversationItem) => {
    const isUnread = Boolean(item.unread_count && item.unread_count > 0);
    const isMuted = Boolean(item.muted_until && new Date(item.muted_until) > new Date());
    const isMeLast = item.last_message?.sender_id === user?.id;

    let snippetText = "No messages yet";
    if (item.last_message?.body) {
      snippetText = (isMeLast ? "You: " : "") + item.last_message.body;
    }

    return (
      <Pressable
        key={item.id}
        onPress={() => {
          triggerHaptic();
          router.push(`/chat/${item.id}` as any);
        }}
        onLongPress={() => {
          triggerHaptic();
          setContextItem(item);
        }}
        style={({ pressed }) => [
          styles.chatRow,
          {
            backgroundColor: pressed ? colors.surface2 : colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        {/* Left Active/Recent Chat Blue Bar - Matching Picture 4 */}
        {(isUnread || item.is_pinned || item.is_online) ? (
          <View style={[styles.activeIndicatorBar, { backgroundColor: colors.primary }]} />
        ) : null}

        {/* Avatar */}
        <View style={styles.avatarContainer}>
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.placeholderAvatar, { backgroundColor: colors.primarySoft }]}>
              <MaterialCommunityIcons
                name={
                  item.kind === "dm"
                    ? "account"
                    : item.kind === "room"
                    ? "school"
                    : "account-group"
                }
                size={22}
                color={colors.primary}
              />
            </View>
          )}
          {item.is_online !== false ? (
            <View style={[styles.onlineDot, { backgroundColor: "#10B981", borderColor: colors.surface }]} />
          ) : null}
        </View>

        {/* Middle Info */}
        <View style={styles.chatMiddle}>
          <View style={styles.chatTitleRow}>
            <Text
              style={[
                styles.chatTitle,
                { color: colors.text, fontWeight: isUnread ? "800" : "600" },
              ]}
              numberOfLines={1}
            >
              {item.title || (item.kind === "dm" ? "Direct Message" : "Study Group")}
            </Text>
            {item.is_pinned && (
              <MaterialCommunityIcons name="pin" size={14} color={colors.primary} style={{ marginLeft: 4 }} />
            )}
            {isMuted && (
              <MaterialCommunityIcons name="volume-off" size={14} color={colors.muted} style={{ marginLeft: 4 }} />
            )}
          </View>

          <View style={styles.snippetRow}>
            <Text
              style={[
                styles.snippetText,
                { color: isUnread ? colors.text : colors.muted, fontWeight: isUnread ? "600" : "400" },
              ]}
              numberOfLines={1}
            >
              {snippetText}
            </Text>
          </View>
        </View>

        {/* Right Info: Time + Badges */}
        <View style={styles.chatRight}>
          <Text style={[styles.timeText, { color: isUnread ? colors.primary : colors.muted }]}>
            {formatChatTime(item.last_message?.created_at || item.updated_at)}
          </Text>

          <View style={styles.badgeRow}>
            {isMeLast && !isUnread ? (
              <MaterialCommunityIcons name="check-all" size={16} color={colors.primary} />
            ) : null}
            {isUnread && (
              <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.unreadBadgeText}>
                  {item.unread_count! > 99 ? "99+" : item.unread_count}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  // Render Call Record Row
  const renderCallRow = (item: CallHistoryItem) => {
    const isOutgoing = item.caller_id === user?.id;
    const isMissed = item.status === "missed" || (item.status === "declined" && !isOutgoing);
    const peer = isOutgoing ? item.callee : item.caller;
    const peerName = peer?.full_name || peer?.username || "SkillBridge Member";
    const peerAvatar = peer?.avatar_url;
    const peerId = isOutgoing ? item.callee_id : item.caller_id;

    return (
      <View
        key={item.id}
        style={[styles.callRow, { borderBottomColor: colors.border }]}
      >
        <Pressable
          onPress={() => handleStartCall(peerId, peerName, peerAvatar, item.type)}
          style={{ flexDirection: "row", alignItems: "center", flex: 1, gap: 12 }}
        >
          {/* Avatar */}
          <View style={styles.avatarContainer}>
            {peerAvatar ? (
              <Image source={{ uri: peerAvatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.placeholderAvatar, { backgroundColor: colors.primarySoft }]}>
                <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 16 }}>
                  {peerName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </View>

          {/* Details */}
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              numberOfLines={1}
              style={[
                styles.callPeerName,
                { color: isMissed ? "#EF4444" : colors.text },
              ]}
            >
              {peerName}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <MaterialCommunityIcons
                name={
                  isMissed
                    ? "phone-missed"
                    : isOutgoing
                    ? "phone-outgoing"
                    : "phone-incoming"
                }
                size={14}
                color={isMissed ? "#EF4444" : isOutgoing ? "#64748B" : "#10B981"}
              />
              <Text style={[styles.callMetaText, { color: colors.muted }]}>
                {item.type === "video" ? "Video" : "Voice"}
                {item.duration_seconds > 0 ? ` • ${formatCallDuration(item.duration_seconds)}` : ""}
                {" • "}
                {formatChatTime(item.created_at)}
              </Text>
            </View>
          </View>
        </Pressable>

        {/* Quick Callback Actions */}
        <View style={styles.callActions}>
          <Pressable
            onPress={() => handleStartCall(peerId, peerName, peerAvatar, "audio")}
            hitSlop={8}
            style={[styles.callActionBtn, { backgroundColor: colors.surface }]}
          >
            <MaterialCommunityIcons name="phone" size={18} color={colors.primary} />
          </Pressable>
          <Pressable
            onPress={() => handleStartCall(peerId, peerName, peerAvatar, "video")}
            hitSlop={8}
            style={[styles.callActionBtn, { backgroundColor: colors.primarySoft }]}
          >
            <MaterialCommunityIcons name="video" size={18} color={colors.primary} />
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Telegram-style Top Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <View style={styles.headerTop}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{t("inbox.title")}</Text>

          {/* Right Action Icons */}
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => {
                triggerHaptic();
                setSearchOpen((prev) => !prev);
              }}
              hitSlop={8}
              style={styles.iconBtn}
            >
              <MaterialCommunityIcons
                name={searchOpen ? "close" : "magnify"}
                size={22}
                color={colors.text}
              />
            </Pressable>
            <Pressable
              onPress={() => {
                triggerHaptic();
                if (activeTab === "chats") {
                  setComposeModalVisible(true);
                } else {
                  setNewCallModalVisible(true);
                }
              }}
              hitSlop={8}
              style={[styles.composeBtn, { backgroundColor: colors.primary }]}
            >
              <MaterialCommunityIcons
                name={activeTab === "chats" ? "square-edit-outline" : "phone-plus"}
                size={18}
                color="#FFFFFF"
              />
            </Pressable>
          </View>
        </View>

        {/* Always visible Search Bar matching Picture 4 */}
        <View style={[styles.searchBox, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
          <MaterialCommunityIcons name="magnify" size={19} color={colors.muted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder={activeTab === "chats" ? t("inbox.searchChats") : t("inbox.searchCalls")}
            placeholderTextColor={colors.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
              <MaterialCommunityIcons name="close-circle" size={16} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>

        {/* Segmented Tab Switcher: Chats (Badge) | Calls */}
        <View style={[styles.segmentedTrack, { backgroundColor: colors.surface2 }]}>
          <Pressable
            onPress={() => {
              triggerHaptic();
              setActiveTab("chats");
            }}
            style={[
              styles.segmentItem,
              activeTab === "chats" && [styles.segmentActive, { backgroundColor: colors.surface }],
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                { color: activeTab === "chats" ? colors.primary : colors.muted },
                activeTab === "chats" && styles.segmentTextBold,
              ]}
            >
              {t("inbox.chatsTab")}
            </Text>
            {totalUnread > 0 && (
              <View style={[styles.tabBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.tabBadgeText}>{totalUnread > 99 ? "99+" : totalUnread}</Text>
              </View>
            )}
          </Pressable>

          <Pressable
            onPress={() => {
              triggerHaptic();
              setActiveTab("calls");
            }}
            style={[
              styles.segmentItem,
              activeTab === "calls" && [styles.segmentActive, { backgroundColor: colors.surface }],
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                { color: activeTab === "calls" ? colors.primary : colors.muted },
                activeTab === "calls" && styles.segmentTextBold,
              ]}
            >
              {t("inbox.callsTab")}
            </Text>
          </Pressable>
        </View>

        {/* Sub-Filters for Chats */}
        {activeTab === "chats" && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScroll}
          >
            {(["all", "unread", "groups"] as const).map((filterKey) => (
              <Pressable
                key={filterKey}
                onPress={() => {
                  triggerHaptic();
                  setChatFilter(filterKey);
                }}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor:
                      chatFilter === filterKey ? colors.primary : colors.surface,
                    borderColor:
                      chatFilter === filterKey ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    { color: chatFilter === filterKey ? "#FFFFFF" : colors.text },
                  ]}
                >
                  {filterKey === "all"
                    ? t("inbox.allMessages")
                    : filterKey === "unread"
                    ? t("inbox.unread")
                    : t("inbox.studyGroups")}
                </Text>
              </Pressable>
            ))}

            {hasArchivedChats && (
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  setChatFilter(chatFilter === "archived" ? "all" : "archived");
                }}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor:
                      chatFilter === "archived" ? colors.primary : colors.surface,
                    borderColor:
                      chatFilter === "archived" ? colors.primary : colors.border,
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name="archive-arrow-down-outline"
                  size={14}
                  color={chatFilter === "archived" ? "#FFFFFF" : colors.muted}
                />
                <Text
                  style={[
                    styles.filterPillText,
                    { color: chatFilter === "archived" ? "#FFFFFF" : colors.text },
                  ]}
                >
                  {t("inbox.archived")}
                </Text>
              </Pressable>
            )}
          </ScrollView>
        )}
      </View>

      {/* Main Content Body */}
      {activeTab === "chats" ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 80 }}
          keyboardShouldPersistTaps="handled"
        >
          {conversationsQuery.isLoading ? (
            <View style={{ padding: 16, gap: 12 }}>
              <Skeleton height={60} />
              <Skeleton height={60} />
              <Skeleton height={60} />
              <Skeleton height={60} />
            </View>
          ) : conversationsQuery.isError ? (
            <ErrorState
              detail={(conversationsQuery.error as Error).message}
              onRetry={() => conversationsQuery.refetch()}
            />
          ) : pinnedList.length === 0 && normalList.length === 0 ? (
            <Empty
              icon="chat-processing-outline"
              title={chatFilter === "archived" ? t("inbox.noArchived") : t("inbox.empty")}
              detail={t("inbox.emptyDetail")}
              actionTitle={t("inbox.startConversation")}
              onAction={() => setComposeModalVisible(true)}
            />
          ) : (
            <View>
              {/* Pinned Section */}
              {pinnedList.length > 0 && (
                <View>
                  <View style={styles.sectionHeader}>
                    <MaterialCommunityIcons name="pin" size={13} color={colors.primary} />
                    <Text style={[styles.sectionHeaderText, { color: colors.muted }]}>
                      {t("inbox.pinnedChats")}
                    </Text>
                  </View>
                  {pinnedList.map((item) => renderConversationRow(item))}
                </View>
              )}

              {/* All / Normal Section */}
              {normalList.length > 0 && (
                <View>
                  {pinnedList.length > 0 && (
                    <View style={styles.sectionHeader}>
                      <MaterialCommunityIcons name="message-text-outline" size={13} color={colors.muted} />
                      <Text style={[styles.sectionHeaderText, { color: colors.muted }]}>
                        {t("inbox.allConversations")}
                      </Text>
                    </View>
                  )}
                  {normalList.map((item) => renderConversationRow(item))}
                </View>
              )}
            </View>
          )}
        </ScrollView>
      ) : (
        /* Calls Tab Content */
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 80 }}
          keyboardShouldPersistTaps="handled"
        >
          {callsQuery.isLoading ? (
            <View style={{ padding: 16, gap: 12 }}>
              <Skeleton height={60} />
              <Skeleton height={60} />
              <Skeleton height={60} />
            </View>
          ) : callsQuery.isError ? (
            <ErrorState
              detail={(callsQuery.error as Error).message}
              onRetry={() => callsQuery.refetch()}
            />
          ) : (callsQuery.data?.calls ?? []).length === 0 ? (
            <Empty
              icon="phone-outgoing"
              title={t("inbox.noRecentCalls")}
              detail={t("inbox.noRecentCallsDetail")}
              actionTitle={t("inbox.makeCall")}
              onAction={() => setNewCallModalVisible(true)}
            />
          ) : (
            (callsQuery.data?.calls ?? []).map((call) => renderCallRow(call))
          )}
        </ScrollView>
      )}

      {/* Context Action Sheet (Pin, Mute, Archive, Unread) */}
      <Modal
        visible={Boolean(contextItem)}
        transparent
        animationType="fade"
        onRequestClose={() => setContextItem(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setContextItem(null)}
        >
          <View style={[styles.actionSheet, { backgroundColor: colors.surface }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: colors.text }]} numberOfLines={1}>
              {contextItem?.title || "Conversation"}
            </Text>

            {/* Pin / Unpin */}
            <Pressable
              style={styles.sheetOption}
              onPress={() => {
                if (contextItem) {
                  triggerHaptic();
                  pinMutation.mutate({ id: contextItem.id, isPinned: !contextItem.is_pinned });
                  setContextItem(null);
                }
              }}
            >
              <MaterialCommunityIcons
                name={contextItem?.is_pinned ? "pin-off-outline" : "pin-outline"}
                size={20}
                color={colors.primary}
              />
              <Text style={[styles.sheetOptionText, { color: colors.text }]}>
                {contextItem?.is_pinned ? "Unpin chat" : "Pin chat to top"}
              </Text>
            </Pressable>

            {/* Mute */}
            <Pressable
              style={styles.sheetOption}
              onPress={() => {
                setMutePickerVisible(true);
              }}
            >
              <MaterialCommunityIcons name="volume-off" size={20} color={colors.primary} />
              <Text style={[styles.sheetOptionText, { color: colors.text }]}>
                Mute notifications…
              </Text>
            </Pressable>

            {/* Archive / Unarchive */}
            <Pressable
              style={styles.sheetOption}
              onPress={() => {
                if (contextItem) {
                  triggerHaptic();
                  archiveMutation.mutate({ id: contextItem.id, isArchived: !contextItem.is_archived });
                  setContextItem(null);
                }
              }}
            >
              <MaterialCommunityIcons
                name={contextItem?.is_archived ? "archive-arrow-up-outline" : "archive-arrow-down-outline"}
                size={20}
                color={colors.primary}
              />
              <Text style={[styles.sheetOptionText, { color: colors.text }]}>
                {contextItem?.is_archived ? "Unarchive chat" : "Archive chat"}
              </Text>
            </Pressable>

            {/* Mark as Unread / Read */}
            <Pressable
              style={styles.sheetOption}
              onPress={() => {
                if (contextItem) {
                  triggerHaptic();
                  const markUnread = !(contextItem.unread_count && contextItem.unread_count > 0);
                  unreadMutation.mutate({ id: contextItem.id, isUnread: markUnread });
                  setContextItem(null);
                }
              }}
            >
              <MaterialCommunityIcons
                name={contextItem?.unread_count ? "email-open-outline" : "email-mark-as-unread"}
                size={20}
                color={colors.primary}
              />
              <Text style={[styles.sheetOptionText, { color: colors.text }]}>
                {contextItem?.unread_count ? "Mark as read" : "Mark as unread"}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Mute Duration Picker Sub-Sheet */}
      <Modal
        visible={mutePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMutePickerVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setMutePickerVisible(false)}
        >
          <View style={[styles.actionSheet, { backgroundColor: colors.surface }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Mute Notifications</Text>

            {[
              { label: "For 1 hour", duration: "1h" },
              { label: "For 8 hours", duration: "8h" },
              { label: "For 1 day", duration: "1d" },
              { label: "For 1 week", duration: "1w" },
              { label: "Until turned back on", duration: "forever" },
            ].map((option) => (
              <Pressable
                key={option.duration}
                style={styles.sheetOption}
                onPress={() => {
                  if (contextItem) {
                    triggerHaptic();
                    muteMutation.mutate({ id: contextItem.id, duration: option.duration });
                    setMutePickerVisible(false);
                    setContextItem(null);
                  }
                }}
              >
                <MaterialCommunityIcons name="clock-outline" size={18} color={colors.primary} />
                <Text style={[styles.sheetOptionText, { color: colors.text }]}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Compose / New Conversation Modal */}
      <Modal
        visible={composeModalVisible}
        animationType="slide"
        onRequestClose={() => setComposeModalVisible(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalHeaderTitle, { color: colors.text }]}>
              {groupMode ? "New Group DM" : "New Conversation"}
            </Text>
            <Pressable onPress={() => setComposeModalVisible(false)} hitSlop={12}>
              <MaterialCommunityIcons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          {/* Group Toggle & Group Name */}
          <View style={{ padding: 16, gap: 12 }}>
            <Pressable
              onPress={() => {
                triggerHaptic();
                setGroupMode((prev) => !prev);
              }}
              style={[
                styles.groupToggleBtn,
                { backgroundColor: groupMode ? colors.primarySoft : colors.surface, borderColor: colors.border },
              ]}
            >
              <MaterialCommunityIcons
                name={groupMode ? "account-group" : "account-group-outline"}
                size={22}
                color={colors.primary}
              />
              <Text style={[styles.groupToggleText, { color: colors.text }]}>
                {groupMode ? "Creating Group Conversation" : "Create a Group DM"}
              </Text>
            </Pressable>

            {groupMode && (
              <View style={[styles.inputContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TextInput
                  placeholder="Group Name (e.g. AI Thesis Study)"
                  placeholderTextColor={colors.muted}
                  style={[styles.modalInput, { color: colors.text }]}
                  value={groupTitle}
                  onChangeText={setGroupTitle}
                />
              </View>
            )}
          </View>

          {/* Peer List */}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
            <Text style={[styles.sectionHeaderText, { color: colors.muted, marginBottom: 8 }]}>
              {groupMode ? "SELECT PARTICIPANTS" : "SELECT PEER"}
            </Text>

            {connectionsQuery.isLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
            ) : (connectionsQuery.data?.connections ?? []).length === 0 ? (
              <Empty
                icon="account-multiple-outline"
                title="No Connections Yet"
                detail="Connect with classmates to start direct and group chats."
              />
            ) : (
              (connectionsQuery.data?.connections ?? []).map((peer) => {
                const isSelected = selectedPeers.includes(peer.id);
                return (
                  <Pressable
                    key={peer.id}
                    onPress={() => {
                      triggerHaptic();
                      if (groupMode) {
                        setSelectedPeers((prev) =>
                          isSelected ? prev.filter((id) => id !== peer.id) : [...prev, peer.id]
                        );
                      } else {
                        // Create 1:1 DM
                        createConversationMutation.mutate({
                          kind: "dm",
                          participantId: peer.id,
                        });
                      }
                    }}
                    style={[styles.peerRow, { borderBottomColor: colors.border }]}
                  >
                    <View style={styles.avatarContainer}>
                      {peer.avatar_url ? (
                        <Image source={{ uri: peer.avatar_url }} style={styles.avatar} />
                      ) : (
                        <View style={[styles.avatar, styles.placeholderAvatar, { backgroundColor: colors.primarySoft }]}>
                          <Text style={{ color: colors.primary, fontWeight: "700" }}>
                            {(peer.full_name || peer.username || "U").charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[styles.peerName, { color: colors.text }]}>
                        {peer.full_name || peer.username || "SkillBridge Student"}
                      </Text>
                      {peer.headline ? (
                        <Text style={[styles.peerHeadline, { color: colors.muted }]} numberOfLines={1}>
                          {peer.headline}
                        </Text>
                      ) : null}
                    </View>

                    {groupMode && (
                      <MaterialCommunityIcons
                        name={isSelected ? "checkbox-marked-circle" : "checkbox-blank-circle-outline"}
                        size={22}
                        color={isSelected ? colors.primary : colors.muted}
                      />
                    )}
                  </Pressable>
                );
              })
            )}
          </ScrollView>

          {/* Group Confirm Button */}
          {groupMode && selectedPeers.length > 0 && (
            <View style={[styles.footerBar, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  createConversationMutation.mutate({
                    kind: "group",
                    participantIds: selectedPeers,
                    title: groupTitle.trim() || "Study Group",
                  });
                }}
                style={[styles.createGroupBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.createGroupBtnText}>
                  Create Group ({selectedPeers.length} selected)
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </Modal>

      {/* New Call Modal */}
      <Modal
        visible={newCallModalVisible}
        animationType="slide"
        onRequestClose={() => setNewCallModalVisible(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalHeaderTitle, { color: colors.text }]}>Start a Call</Text>
            <Pressable onPress={() => setNewCallModalVisible(false)} hitSlop={12}>
              <MaterialCommunityIcons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}>
            <Text style={[styles.sectionHeaderText, { color: colors.muted, marginBottom: 8 }]}>
              DIRECT CONTACTS
            </Text>

            {connectionsQuery.isLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
            ) : (connectionsQuery.data?.connections ?? []).length === 0 ? (
              <Empty
                icon="account-search-outline"
                title="No Contacts Available"
                detail="Add connections from Discover to start audio/video calls."
              />
            ) : (
              (connectionsQuery.data?.connections ?? []).map((peer) => (
                <View key={peer.id} style={[styles.callPeerRow, { borderBottomColor: colors.border }]}>
                  <View style={styles.avatarContainer}>
                    {peer.avatar_url ? (
                      <Image source={{ uri: peer.avatar_url }} style={styles.avatar} />
                    ) : (
                      <View style={[styles.avatar, styles.placeholderAvatar, { backgroundColor: colors.primarySoft }]}>
                        <Text style={{ color: colors.primary, fontWeight: "700" }}>
                          {(peer.full_name || peer.username || "U").charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.peerName, { color: colors.text }]}>
                      {peer.full_name || peer.username || "SkillBridge Student"}
                    </Text>
                    <Text style={[styles.peerHeadline, { color: colors.muted }]} numberOfLines={1}>
                      {peer.headline || "Online"}
                    </Text>
                  </View>

                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Pressable
                      onPress={() => handleStartCall(peer.id, peer.full_name || peer.username, peer.avatar_url, "audio")}
                      style={[styles.callActionBtn, { backgroundColor: colors.surface }]}
                    >
                      <MaterialCommunityIcons name="phone" size={18} color={colors.primary} />
                    </Pressable>
                    <Pressable
                      onPress={() => handleStartCall(peer.id, peer.full_name || peer.username, peer.avatar_url, "video")}
                      style={[styles.callActionBtn, { backgroundColor: colors.primarySoft }]}
                    >
                      <MaterialCommunityIcons name="video" size={18} color={colors.primary} />
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 48,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    gap: 10,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  composeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 40,
    borderRadius: radius.md,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  segmentedTrack: {
    flexDirection: "row",
    height: 38,
    borderRadius: radius.pill,
    padding: 3,
  },
  segmentItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    gap: 6,
  },
  segmentActive: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: "500",
  },
  segmentTextBold: {
    fontWeight: "700",
  },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  tabBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },
  filterScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: "600",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  sectionHeaderText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  chatRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  activeIndicatorBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3.5,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  avatarContainer: {
    position: "relative",
    width: 46,
    height: 46,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  placeholderAvatar: {
    alignItems: "center",
    justifyContent: "center",
  },
  onlineDot: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: "#10B981",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  chatMiddle: {
    flex: 1,
    gap: 3,
  },
  chatTitleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  chatTitle: {
    fontSize: 15,
    flexShrink: 1,
  },
  snippetRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  snippetText: {
    fontSize: 13,
    flex: 1,
  },
  chatRight: {
    alignItems: "flex-end",
    gap: 4,
    minWidth: 50,
  },
  timeText: {
    fontSize: 11,
    fontWeight: "500",
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 18,
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  // Calls list
  callRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  callPeerName: {
    fontSize: 15,
    fontWeight: "700",
  },
  callMetaText: {
    fontSize: 12,
  },
  callActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  callActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  // Modal & Action Sheet
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  actionSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingBottom: 36,
    paddingHorizontal: 16,
    gap: 4,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#94A3B8",
    alignSelf: "center",
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  sheetOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 13,
    paddingHorizontal: 8,
    borderRadius: radius.md,
  },
  sheetOptionText: {
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
  groupToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  groupToggleText: {
    fontSize: 14,
    fontWeight: "700",
  },
  inputContainer: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    height: 46,
    justifyContent: "center",
  },
  modalInput: {
    fontSize: 14,
  },
  peerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  callPeerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  peerName: {
    fontSize: 15,
    fontWeight: "700",
  },
  peerHeadline: {
    fontSize: 12,
  },
  footerBar: {
    padding: 16,
    borderTopWidth: 1,
  },
  createGroupBtn: {
    height: 48,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  createGroupBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
});
