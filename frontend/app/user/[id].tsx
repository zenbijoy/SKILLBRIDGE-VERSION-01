import React, { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Animated, { FadeInUp } from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import type { Profile } from "@/types";
import {
  Button,
  Card,
  Empty,
  ErrorState,
  H1,
  H2,
  Muted,
  Pill,
  Row,
  Screen,
  Skeleton,
  triggerHaptic,
} from "@/components/ui";
import { radius, spacing, useTheme } from "@/theme";
import { useSession } from "@/hooks/useSession";
import { initiateCallApi } from "@/features/calls/services/callApi";

type UserProfileData = {
  profile: Profile & { role?: string };
  skills: { name: string; kind: string; proficiency: number }[];
  mutualCount: number;
  connectionStatus: string;
  mutualRooms?: { id: string; title: string; topic?: string }[];
  mutualRoomsCount?: number;
};

export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { session } = useSession();
  const qc = useQueryClient();

  const isSelf = session?.user?.id === id;

  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState("Spam or scam");
  const [reportDetails] = useState("");

  const profileQuery = useQuery({
    queryKey: ["profile", id],
    queryFn: () => api<UserProfileData>(`/profiles/${id}`),
    enabled: Boolean(id),
  });

  const connectMutation = useMutation({
    mutationFn: () =>
      api(`/connections/requests`, {
        method: "POST",
        body: JSON.stringify({ recipientId: id }),
      }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["profile", id] });
      Alert.alert("Request Sent! 🤝", "Your connection request has been sent.");
    },
    onError: (err: any) => Alert.alert("Connection Failed", err.message),
  });

  const blockMutation = useMutation({
    mutationFn: () =>
      api(`/account/blocks`, { method: "POST", body: JSON.stringify({ blocked_id: id }) }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["profile", id] });
      qc.invalidateQueries({ queryKey: ["search"] });
      Alert.alert("Blocked", "This user will be hidden from your network.");
    },
    onError: (err: any) => Alert.alert("Block Failed", err.message),
  });

  const reportMutation = useMutation({
    mutationFn: () =>
      api(`/moderation/report`, {
        method: "POST",
        body: JSON.stringify({
          target_type: "user",
          target_id: id,
          reason: reportReason,
          details: reportDetails,
        }),
      }),
    onSuccess: () => {
      triggerHaptic();
      setShowReport(false);
      Alert.alert("Reported", "Thank you for helping keep the SkillBridge community safe.");
    },
    onError: (err: any) => Alert.alert("Report Failed", err.message),
  });

  // Direct 1:1 Messaging
  const handleMessage = async () => {
    if (!id) return;
    triggerHaptic();
    try {
      const res = await api<{ conversation: { id: string } }>("/chat/conversations", {
        method: "POST",
        body: JSON.stringify({ participantId: id }),
      });
      if (res.conversation?.id) {
        router.push(`/chat/${res.conversation.id}` as any);
      }
    } catch (e: any) {
      Alert.alert("Could not open chat", e.message || "Unable to start conversation.");
    }
  };

  // Direct 1:1 Voice Calling
  const handleVoiceCall = async () => {
    if (!id) return;
    triggerHaptic();
    try {
      const res = await initiateCallApi(id, "audio");
      if (res.call?.id) {
        router.push(`/call/${res.call.id}` as any);
      }
    } catch (e: any) {
      Alert.alert("Call Failed", e.message || "Could not initiate audio call.");
    }
  };

  // Direct 1:1 Video Calling
  const handleVideoCall = async () => {
    if (!id) return;
    triggerHaptic();
    try {
      const res = await initiateCallApi(id, "video");
      if (res.call?.id) {
        router.push(`/call/${res.call.id}` as any);
      }
    } catch (e: any) {
      Alert.alert("Call Failed", e.message || "Could not initiate video call.");
    }
  };

  // Profile Share
  const handleShareProfile = () => {
    if (!d) return;
    void Share.share({
      message: `Check out ${d.profile.full_name}'s profile on SkillBridge: https://skillbridge.app/user/${d.profile.id}`,
    });
  };

  const d = profileQuery.data;

  if (profileQuery.isLoading) {
    return (
      <Screen>
        <Skeleton height={140} />
        <Skeleton height={60} />
        <Skeleton height={120} />
      </Screen>
    );
  }

  if (profileQuery.isError) {
    return (
      <Screen>
        <ErrorState
          detail={(profileQuery.error as Error).message}
          onRetry={() => profileQuery.refetch()}
        />
      </Screen>
    );
  }

  if (!d) {
    return (
      <Screen>
        <Empty title="Profile Not Found" detail="This user profile could not be located." />
      </Screen>
    );
  }

  const isTutor = d.profile.role === "peer_tutor" || d.skills.some((s) => s.proficiency >= 4);

  return (
    <Screen>
      <ScrollView contentContainerStyle={s.scrollContainer}>
        {/* Header Bar */}
        <Row style={s.topNav}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={s.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
          </Pressable>
          <Row style={{ gap: 10 }}>
            <Pressable onPress={handleShareProfile} hitSlop={12} style={s.iconBtn}>
              <MaterialCommunityIcons name="share-variant-outline" size={20} color={colors.text} />
            </Pressable>
          </Row>
        </Row>

        {/* Profile Card Header */}
        <Animated.View entering={FadeInUp.delay(100).springify()}>
          <Row style={s.profileHeader}>
            <View style={[s.avatarWrap, { backgroundColor: colors.primarySoft }]}>
              <MaterialCommunityIcons name="account" size={44} color={colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <H1 style={s.fullName}>{d.profile.full_name}</H1>
              <Muted style={s.username}>
                @{d.profile.username} · {d.profile.university || "SkillBridge Campus"}
              </Muted>
              <Row style={{ gap: 6, marginTop: 4, alignItems: "center" }}>
                <Pill tone="accent">{d.profile.reputation} rep</Pill>
                <Pill>{d.mutualCount} mutual connections</Pill>
                {isTutor && <Pill tone="primary">PEER TUTOR</Pill>}
              </Row>
            </View>
          </Row>
        </Animated.View>

        {/* Bio */}
        {d.profile.bio ? (
          <Animated.View entering={FadeInUp.delay(180).springify()}>
            <Text style={[s.bioText, { color: colors.text }]}>{d.profile.bio}</Text>
          </Animated.View>
        ) : null}

        {/* 1:1 Direct Communication Action Bar */}
        {!isSelf && (
          <Animated.View entering={FadeInUp.delay(240).springify()} style={s.communicationBar}>
            {/* Message Action */}
            <Pressable
              onPress={handleMessage}
              style={[s.commActionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <MaterialCommunityIcons name="chat-outline" size={22} color={colors.primary} />
              <Text style={[s.commActionText, { color: colors.text }]}>Message</Text>
            </Pressable>

            {/* Voice Call Action */}
            <Pressable
              onPress={handleVoiceCall}
              style={[s.commActionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <MaterialCommunityIcons name="phone-outline" size={22} color={colors.info || colors.primary} />
              <Text style={[s.commActionText, { color: colors.text }]}>Audio Call</Text>
            </Pressable>

            {/* Video Call Action */}
            <Pressable
              onPress={handleVideoCall}
              style={[s.commActionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <MaterialCommunityIcons name="video-outline" size={22} color={colors.accent} />
              <Text style={[s.commActionText, { color: colors.text }]}>Video Call</Text>
            </Pressable>

            {/* Book Session Action (For Tutors) */}
            {isTutor && (
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  router.push(`/booking/${id}` as any);
                }}
                style={[s.commActionBtn, { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}
              >
                <MaterialCommunityIcons name="calendar-clock" size={22} color={colors.primary} />
                <Text style={[s.commActionText, { color: colors.primary, fontWeight: "700" }]}>Book</Text>
              </Pressable>
            )}
          </Animated.View>
        )}

        {/* Connection Status Button */}
        {!isSelf && (
          <Animated.View entering={FadeInUp.delay(280).springify()} style={{ marginVertical: 8 }}>
            <Button
              title={
                d.connectionStatus === "none"
                  ? "+ Connect"
                  : d.connectionStatus === "pending"
                  ? "Connection Requested"
                  : "Connected ✓"
              }
              disabled={d.connectionStatus !== "none" || connectMutation.isPending}
              variant={d.connectionStatus === "accepted" ? "secondary" : "primary"}
              onPress={() => connectMutation.mutate()}
            />
          </Animated.View>
        )}

        {/* Mutual Rooms & Shared Spaces */}
        {d.mutualRooms && d.mutualRooms.length > 0 && (
          <Animated.View entering={FadeInUp.delay(320).springify()}>
            <Card style={s.card}>
              <H2 style={s.cardTitle}>Shared Spaces & Rooms ({d.mutualRooms.length})</H2>
              <Muted style={{ marginBottom: 10 }}>Spaces you both collaborate in</Muted>
              <View style={{ gap: 8 }}>
                {d.mutualRooms.map((room) => (
                  <Pressable
                    key={room.id}
                    onPress={() => {
                      triggerHaptic();
                      router.push(`/room/${room.id}` as any);
                    }}
                    style={[s.roomRow, { backgroundColor: colors.surface2, borderColor: colors.border }]}
                  >
                    <View style={[s.roomIconBox, { backgroundColor: colors.primarySoft }]}>
                      <MaterialCommunityIcons name="door-open" size={18} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.roomTitle, { color: colors.text }]}>{room.title}</Text>
                      {room.topic ? <Muted style={{ fontSize: 11 }}>{room.topic}</Muted> : null}
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} />
                  </Pressable>
                ))}
              </View>
            </Card>
          </Animated.View>
        )}

        {/* Skills & Verified Competencies */}
        <Animated.View entering={FadeInUp.delay(360).springify()}>
          <Card style={s.card}>
            <H2 style={s.cardTitle}>Skills & Competencies</H2>
            {d.skills.length === 0 ? (
              <Muted>No competencies listed yet.</Muted>
            ) : (
              <Row style={{ flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                {d.skills.map((s) => (
                  <Pill
                    key={`${s.kind}-${s.name}`}
                    tone={s.kind === "known" ? "accent" : "default"}
                  >
                    {s.name} · {s.proficiency}/5
                  </Pill>
                ))}
              </Row>
            )}
          </Card>
        </Animated.View>

        {/* Safety & Moderation Controls */}
        {!isSelf && (
          <Animated.View entering={FadeInUp.delay(420).springify()} style={{ marginTop: 12 }}>
            {showReport ? (
              <Card style={s.card}>
                <H2 style={s.cardTitle}>Report User</H2>
                <Muted style={{ marginBottom: 10 }}>Choose the reason for safety review:</Muted>
                <View style={{ gap: 8 }}>
                  {["Spam or scam", "Harassment or bullying", "Inappropriate content"].map((r) => (
                    <Button
                      key={r}
                      title={r}
                      variant={reportReason === r ? "primary" : "secondary"}
                      onPress={() => setReportReason(r)}
                    />
                  ))}
                  <Row style={{ gap: 10, marginTop: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Button title="Cancel" variant="ghost" onPress={() => setShowReport(false)} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button title="Submit Report" variant="danger" onPress={() => reportMutation.mutate()} />
                    </View>
                  </Row>
                </View>
              </Card>
            ) : (
              <Row style={{ gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Report"
                    variant="ghost"
                    onPress={() => setShowReport(true)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Block User"
                    variant="danger"
                    onPress={() => {
                      Alert.alert(
                        "Block User?",
                        "Blocked users will not be able to message you, call you, or see your public profile.",
                        [
                          { text: "Cancel" },
                          { text: "Block", style: "destructive", onPress: () => blockMutation.mutate() },
                        ]
                      );
                    }}
                  />
                </View>
              </Row>
            )}
          </Animated.View>
        )}
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  scrollContainer: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  topNav: {
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  backBtn: {
    padding: 4,
  },
  iconBtn: {
    padding: 6,
  },
  profileHeader: {
    alignItems: "center",
    gap: 14,
    marginBottom: 12,
  },
  avatarWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  fullName: {
    fontSize: 20,
    fontWeight: "800",
  },
  username: {
    fontSize: 13,
  },
  bioText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  communicationBar: {
    flexDirection: "row",
    gap: 8,
    marginVertical: 10,
  },
  commActionBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  commActionText: {
    fontSize: 11,
    fontWeight: "600",
  },
  card: {
    padding: 14,
    borderRadius: radius.lg,
    marginVertical: 6,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  roomRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 10,
  },
  roomIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  roomTitle: {
    fontSize: 13,
    fontWeight: "600",
  },
});
