import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Image,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useTheme, radius } from "@/theme";
import { triggerHaptic } from "@/components/ui";

interface DirectCallModalProps {
  visible: boolean;
  onClose: () => void;
}

interface PeerContact {
  id: string;
  full_name: string;
  username: string;
  avatar_url?: string | null;
  department?: string | null;
  online?: boolean;
}

export function DirectCallModal({ visible, onClose }: DirectCallModalProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");

  // 1. Fetch connected peers for instant 1-tap calling
  const connectionsQuery = useQuery({
    queryKey: ["connections-for-calls"],
    queryFn: async () => {
      const res = await api<{ connections: any[] }>("/connections");
      return (res.connections || []).map((c: any) => {
        const peer = c.peer || c.profile || c;
        return {
          id: peer.id,
          full_name: peer.full_name || peer.name || "Peer Learner",
          username: peer.username || "learner",
          avatar_url: peer.avatar_url || null,
          department: peer.department || null,
          online: true,
        } as PeerContact;
      });
    },
    enabled: visible,
  });

  // 2. Search peers query if search text is entered
  const searchQueryResult = useQuery({
    queryKey: ["search-peers-for-call", searchQuery],
    queryFn: async () => {
      if (!searchQuery.trim() || searchQuery.trim().length < 2) return [];
      const res = await api<{ profiles?: any[]; results?: any[] }>(
        `/search?q=${encodeURIComponent(searchQuery.trim())}&type=people`,
      );
      const list = res.profiles || res.results || [];
      return list.map((p: any) => ({
        id: p.id,
        full_name: p.full_name || p.name || "Peer Learner",
        username: p.username || "learner",
        avatar_url: p.avatar_url || null,
        department: p.department || null,
        online: true,
      })) as PeerContact[];
    },
    enabled: visible && searchQuery.trim().length >= 2,
  });

  const handleStartCall = (peer: PeerContact, callType: "audio" | "video") => {
    triggerHaptic();
    onClose();
    // Direct routing to outgoing Call Screen with target peer ID and type
    router.push({
      pathname: `/call/${peer.id}` as any,
      params: {
        targetId: peer.id,
        name: peer.full_name,
        avatar: peer.avatar_url || "",
        type: callType,
      },
    });
  };

  const peersToDisplay =
    searchQuery.trim().length >= 2
      ? searchQueryResult.data || []
      : connectionsQuery.data || [];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: isDark ? "#0F172A" : "#FFFFFF",
              borderColor: isDark ? "#1E293B" : "#E2E8F0",
              paddingBottom: Math.max(insets.bottom, 20),
            },
          ]}
        >
          {/* Top Sheet Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={[styles.callIconBadge, { backgroundColor: "#10B981" }]}>
                <Ionicons name="call" size={18} color="#FFFFFF" />
              </View>
              <View>
                <Text style={[styles.title, { color: colors.text }]}>Direct WebRTC Call</Text>
                <Text style={[styles.subTitle, { color: colors.muted }]}>
                  Instant 1-to-1 audio & video with encrypted peer signaling
                </Text>
              </View>
            </View>

            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>

          {/* Search Input Bar */}
          <View
            style={[
              styles.searchBar,
              {
                backgroundColor: isDark ? "#1E293B" : "#F1F5F9",
                borderColor: isDark ? "#334155" : "#E2E8F0",
              },
            ]}
          >
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput
              placeholder="Search classmates by name or @username…"
              placeholderTextColor={isDark ? "#64748B" : "#94A3B8"}
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={[styles.searchInput, { color: colors.text }]}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery("")}>
                <Ionicons name="close-circle" size={18} color={colors.muted} />
              </Pressable>
            )}
          </View>

          {/* Peer List */}
          <View style={styles.listContainer}>
            <Text style={[styles.sectionHeading, { color: colors.muted }]}>
              {searchQuery.trim().length >= 2 ? "Search Results" : "Fast Speed-Dial Contacts"}
            </Text>

            {connectionsQuery.isLoading || (searchQuery.trim().length >= 2 && searchQueryResult.isLoading) ? (
              <View style={styles.centerLoading}>
                <ActivityIndicator size="small" color="#10B981" />
                <Text style={[styles.loadingText, { color: colors.muted }]}>Looking up active peers…</Text>
              </View>
            ) : peersToDisplay.length === 0 ? (
              <View style={styles.emptyBox}>
                <MaterialCommunityIcons name="account-search-outline" size={36} color={colors.muted} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>
                  {searchQuery.trim().length >= 2 ? "No matching peers found" : "No recent contacts yet"}
                </Text>
                <Text style={[styles.emptySub, { color: colors.muted }]}>
                  Search for any classmate across RUET/campus above to start a live call.
                </Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
                {peersToDisplay.map((peer) => (
                  <View
                    key={peer.id}
                    style={[
                      styles.peerItem,
                      {
                        backgroundColor: isDark ? "rgba(30, 41, 59, 0.45)" : "#F8FAFC",
                        borderColor: isDark ? "#1E293B" : "#E2E8F0",
                      },
                    ]}
                  >
                    {/* Avatar with Online Glow Ring */}
                    <View style={styles.avatarWrap}>
                      {peer.avatar_url ? (
                        <Image source={{ uri: peer.avatar_url }} style={styles.avatar} />
                      ) : (
                        <View style={[styles.avatar, styles.fallbackAvatar, { backgroundColor: colors.primarySoft }]}>
                          <Text style={[styles.avatarInitial, { color: colors.primary }]}>
                            {peer.full_name.slice(0, 1).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <View style={styles.onlineBadge} />
                    </View>

                    {/* Identity Details */}
                    <View style={styles.peerDetails}>
                      <Text style={[styles.peerName, { color: colors.text }]} numberOfLines={1}>
                        {peer.full_name}
                      </Text>
                      <Text style={[styles.peerMeta, { color: colors.muted }]} numberOfLines={1}>
                        @{peer.username}
                        {peer.department ? ` • ${peer.department}` : ""}
                      </Text>
                    </View>

                    {/* Quick WhatsApp-like Call Action Buttons */}
                    <View style={styles.callActionsRow}>
                      {/* Voice Call (Green) */}
                      <Pressable
                        onPress={() => handleStartCall(peer, "audio")}
                        style={({ pressed }) => [
                          styles.actionBtn,
                          styles.voiceBtn,
                          { opacity: pressed ? 0.75 : 1 },
                        ]}
                        accessibilityLabel={`Audio call ${peer.full_name}`}
                      >
                        <Ionicons name="call" size={18} color="#FFFFFF" />
                      </Pressable>

                      {/* Video Call (Blue) */}
                      <Pressable
                        onPress={() => handleStartCall(peer, "video")}
                        style={({ pressed }) => [
                          styles.actionBtn,
                          styles.videoBtn,
                          { opacity: pressed ? 0.75 : 1 },
                        ]}
                        accessibilityLabel={`Video call ${peer.full_name}`}
                      >
                        <Ionicons name="videocam" size={18} color="#FFFFFF" />
                      </Pressable>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1.5,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: "82%",
    minHeight: 460,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#64748B",
    alignSelf: "center",
    marginBottom: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  callIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  subTitle: {
    fontSize: 12,
    marginTop: 2,
    maxWidth: 240,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 16,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    marginBottom: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  listContainer: {
    flex: 1,
  },
  sectionHeading: {
    fontSize: 11.5,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  scroll: {
    flex: 1,
  },
  peerItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
  },
  avatarWrap: {
    position: "relative",
    width: 44,
    height: 44,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  fallbackAvatar: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 18,
    fontWeight: "800",
  },
  onlineBadge: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#10B981",
    borderWidth: 2,
    borderColor: "#0F172A",
  },
  peerDetails: {
    flex: 1,
    gap: 2,
  },
  peerName: {
    fontSize: 15,
    fontWeight: "700",
  },
  peerMeta: {
    fontSize: 12,
  },
  callActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  voiceBtn: {
    backgroundColor: "#10B981",
    shadowColor: "#10B981",
  },
  videoBtn: {
    backgroundColor: "#2563EB",
    shadowColor: "#2563EB",
  },
  centerLoading: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
  },
  emptyBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 36,
    paddingHorizontal: 20,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  emptySub: {
    fontSize: 12.5,
    textAlign: "center",
    lineHeight: 18,
  },
});
