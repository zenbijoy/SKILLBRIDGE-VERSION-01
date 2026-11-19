import React from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  StyleSheet,
} from "react-native";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAppStore } from "@/state/useAppStore";
import { useTheme } from "@/theme";
import { triggerHaptic } from "@/components/ui";

interface LiveRoomStory {
  id: string;
  title: string;
  topic?: string;
  member_count?: number;
  owner?: { full_name?: string; avatar_url?: string };
}

interface PeerStory {
  id: string;
  full_name: string;
  avatar_url?: string;
  headline?: string;
}

export function WebStoriesCarousel() {
  const { colors, isDark } = useTheme();
  const { cachedProfile } = useAppStore();

  const initial = (cachedProfile?.full_name?.trim()?.[0] ?? "U").toUpperCase();
  const avatarUrl = cachedProfile?.avatar_url;

  // 1. Fetch active live rooms for story bubbles
  const liveRoomsQuery = useQuery({
    queryKey: ["web-stories-live-rooms"],
    queryFn: () => api<{ rooms: LiveRoomStory[] }>("/rooms?status=live&limit=8"),
    staleTime: 30_000,
  });
  const liveRooms = liveRoomsQuery.data?.rooms || [];

  // 2. Fetch active peers for story bubbles
  const peersQuery = useQuery({
    queryKey: ["web-stories-peers"],
    queryFn: () => api<{ connections: any[] }>("/connections"),
    staleTime: 60_000,
  });
  const peers: PeerStory[] = (peersQuery.data?.connections || [])
    .slice(0, 6)
    .map((c: any) => c.peer || c.profile || c);

  return (
    <div
      style={{
        width: "100%",
        backgroundColor: colors.surface,
        borderRadius: 16,
        border: `1px solid ${colors.border}`,
        padding: "12px 14px",
        marginBottom: 16,
        boxSizing: "border-box",
        boxShadow: isDark
          ? "0 4px 14px rgba(0, 0, 0, 0.25)"
          : "0 2px 8px rgba(0, 0, 0, 0.04)",
      }}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* 1. Host Room / Create Story Bubble */}
        <Pressable
          onPress={() => {
            triggerHaptic();
            router.push("/room/create" as any);
          }}
          style={({ pressed }) => [
            styles.storyItem,
            { opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <div
            style={{
              position: "relative",
              width: 58,
              height: 58,
              borderRadius: "50%",
              padding: 2,
              border: `2px dashed ${colors.primary}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "transform 0.2s ease",
            }}
          >
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.storyAvatar} />
            ) : (
              <View style={[styles.avatarFallback, { backgroundColor: colors.primarySoft }]}>
                <Text style={[styles.avatarInitial, { color: colors.primary }]}>{initial}</Text>
              </View>
            )}
            <View style={[styles.plusBadge, { backgroundColor: colors.primary }]}>
              <MaterialCommunityIcons name="plus" size={14} color="#FFFFFF" />
            </View>
          </div>
          <Text style={[styles.storyLabel, { color: colors.text }]} numberOfLines={1}>
            Host Room
          </Text>
        </Pressable>

        {/* 2. Live Study Room Pods */}
        {liveRooms.map((room) => {
          const hostAvatar = room.owner?.avatar_url;
          return (
            <Pressable
              key={`room-${room.id}`}
              onPress={() => {
                triggerHaptic();
                router.push(`/room/${room.id}` as any);
              }}
              style={({ pressed }) => [
                styles.storyItem,
                { opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <div
                className="story-ring-live animate-pulse-live"
                style={{
                  position: "relative",
                  width: 58,
                  height: 58,
                  borderRadius: "50%",
                  padding: 3,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "transform 0.2s ease",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    borderRadius: "50%",
                    backgroundColor: colors.surface,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }}
                >
                  {hostAvatar ? (
                    <Image source={{ uri: hostAvatar }} style={styles.storyAvatar} />
                  ) : (
                    <View style={[styles.avatarFallback, { backgroundColor: "rgba(16, 185, 129, 0.15)" }]}>
                      <MaterialCommunityIcons name="broadcast" size={24} color="#10B981" />
                    </View>
                  )}
                </div>
                <div
                  style={{
                    position: "absolute",
                    bottom: -3,
                    backgroundColor: "#10B981",
                    color: "#FFFFFF",
                    fontSize: 8,
                    fontWeight: 900,
                    padding: "1px 5px",
                    borderRadius: 9999,
                    letterSpacing: 0.5,
                    border: `1.5px solid ${colors.surface}`,
                  }}
                >
                  LIVE
                </div>
              </div>
              <Text style={[styles.storyLabel, { color: colors.text }]} numberOfLines={1}>
                {room.title}
              </Text>
            </Pressable>
          );
        })}

        {/* 3. Peer Study Pods */}
        {peers.map((peer) => {
          const peerInitial = (peer.full_name?.trim()[0] ?? "P").toUpperCase();
          return (
            <Pressable
              key={`peer-${peer.id}`}
              onPress={() => {
                triggerHaptic();
                router.push(`/user/${peer.id}` as any);
              }}
              style={({ pressed }) => [
                styles.storyItem,
                { opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <div
                className="story-ring-active"
                style={{
                  position: "relative",
                  width: 58,
                  height: 58,
                  borderRadius: "50%",
                  padding: 2.5,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "transform 0.2s ease",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    borderRadius: "50%",
                    backgroundColor: colors.surface,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }}
                >
                  {peer.avatar_url ? (
                    <Image source={{ uri: peer.avatar_url }} style={styles.storyAvatar} />
                  ) : (
                    <View style={[styles.avatarFallback, { backgroundColor: colors.primarySoft }]}>
                      <Text style={[styles.avatarInitial, { color: colors.primary }]}>{peerInitial}</Text>
                    </View>
                  )}
                </div>
              </div>
              <Text style={[styles.storyLabel, { color: colors.text }]} numberOfLines={1}>
                {peer.full_name.split(" ")[0]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </div>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    gap: 16,
    paddingHorizontal: 4,
    alignItems: "center",
  },
  storyItem: {
    alignItems: "center",
    gap: 6,
    width: 66,
    cursor: "pointer",
  } as any,
  storyAvatar: {
    width: "100%",
    height: "100%",
    borderRadius: 29,
  },
  avatarFallback: {
    width: "100%",
    height: "100%",
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 18,
    fontWeight: "800",
  },
  plusBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  storyLabel: {
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
    width: "100%",
  },
});
