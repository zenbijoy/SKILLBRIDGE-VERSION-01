import React, { useState, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { Button, Row, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import type { Room } from "@/types";
import { callSounds } from "@/features/calls/services/callSounds";

type RoomKnockLobbyScreenProps = {
  room: Room;
  onAdmitted: () => void;
  onBack?: () => void;
};

export function RoomKnockLobbyScreen({ room, onAdmitted, onBack }: RoomKnockLobbyScreenProps) {
  const { colors } = useTheme();
  const qc = useQueryClient();

  const [message, setMessage] = useState("");
  const [requestState, setRequestState] = useState<"idle" | "pending" | "declined">("idle");
  const [requestMethod, setRequestMethod] = useState<"message" | "phone_call">("message");

  // Animated pulse radar for waiting state
  const [pulseAnim] = useState(() => new Animated.Value(1));
  const [pulseOpacity] = useState(() => new Animated.Value(0.6));

  useEffect(() => {
    if (requestState === "pending") {
      const loop = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(pulseAnim, { toValue: 1.35, duration: 1400, useNativeDriver: true }),
            Animated.timing(pulseAnim, { toValue: 1.0, duration: 1400, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(pulseOpacity, { toValue: 0.1, duration: 1400, useNativeDriver: true }),
            Animated.timing(pulseOpacity, { toValue: 0.6, duration: 1400, useNativeDriver: true }),
          ]),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
  }, [requestState, pulseAnim, pulseOpacity]);

  // Real-time socket listener for admission / decline
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleAdmitted = (payload: { roomId: string; admitted: boolean }) => {
      if (payload.roomId === room.id && payload.admitted) {
        triggerHaptic();
        callSounds.stopAll();
        qc.invalidateQueries({ queryKey: ["room", room.id] });
        qc.invalidateQueries({ queryKey: ["room-permissions", room.id] });
        onAdmitted();
      }
    };

    const handleDeclined = (payload: { roomId: string; declined: boolean }) => {
      if (payload.roomId === room.id) {
        triggerHaptic();
        callSounds.stopAll();
        setRequestState("declined");
        Alert.alert(
          "Request Declined",
          "The room host is unable to admit new participants right now. You can try again later.",
        );
      }
    };

    const handleModeChanged = (payload: { roomId: string; openForEveryone: boolean }) => {
      if (payload.roomId === room.id && payload.openForEveryone) {
        triggerHaptic();
        qc.invalidateQueries({ queryKey: ["room", room.id] });
        qc.invalidateQueries({ queryKey: ["room-permissions", room.id] });
        onAdmitted();
      }
    };

    socket.on("room:knock:admitted", handleAdmitted);
    socket.on("room:knock:declined", handleDeclined);
    socket.on("room:knock:mode-changed", handleModeChanged);

    return () => {
      socket.off("room:knock:admitted", handleAdmitted);
      socket.off("room:knock:declined", handleDeclined);
      socket.off("room:knock:mode-changed", handleModeChanged);
    };
  }, [room.id, onAdmitted, qc]);

  // Knock mutation
  const knockMutation = useMutation({
    mutationFn: (method: "message" | "phone_call") =>
      api<{ status: "pending" | "admitted" | "already_member"; request?: any }>(`/rooms/${room.id}/knock`, {
        method: "POST",
        body: JSON.stringify({
          method,
          message: method === "message" ? message.trim() : "Ringing host to enter room",
        }),
      }),
    onSuccess: (data, method) => {
      triggerHaptic();
      if (data.status === "admitted" || data.status === "already_member") {
        qc.invalidateQueries({ queryKey: ["room", room.id] });
        qc.invalidateQueries({ queryKey: ["room-permissions", room.id] });
        onAdmitted();
      } else {
        setRequestState("pending");
        setRequestMethod(method);
        if (method === "phone_call") {
          callSounds.playRingback();
        }
      }
    },
    onError: (err: Error) => {
      Alert.alert("Request Failed", err.message || "Could not submit join request");
    },
  });

  const handleCancel = () => {
    callSounds.stopAll();
    setRequestState("idle");
  };

  const hostName = (room as any).owner?.full_name || (room as any).owner?.username || "Room Host";
  const hostAvatar = (room as any).owner?.avatar_url || null;

  return (
    <SafeAreaView style={[s.container, { backgroundColor: colors.background }]} edges={["top", "bottom"]}>
      {/* Top Header */}
      <Row style={[s.topNav, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => {
            callSounds.stopAll();
            if (onBack) onBack();
            else router.back();
          }}
          style={s.backBtn}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={[s.navTitle, { color: colors.text }]} numberOfLines={1}>
          Room Waiting Lobby
        </Text>
        <View style={{ width: 36 }} />
      </Row>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Room Identity Card */}
        <View style={[s.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[s.roomIconWrap, { backgroundColor: colors.primarySoft }]}>
            <MaterialCommunityIcons name="door-closed-lock" size={36} color={colors.primary} />
          </View>

          <Text style={[s.roomTitle, { color: colors.text }]}>{room.title}</Text>
          <View style={s.badgeRow}>
            <View style={[s.topicBadge, { backgroundColor: colors.surface2 }]}>
              <Text style={[s.topicText, { color: colors.primary }]}>#{room.topic}</Text>
            </View>
            <View style={[s.capacityBadge, { backgroundColor: colors.surface2 }]}>
              <MaterialCommunityIcons name="account-group-outline" size={14} color={colors.muted} />
              <Text style={[s.capacityText, { color: colors.muted }]}>
                {room.member_count} / {room.capacity} members
              </Text>
            </View>
          </View>

          {/* Host Info */}
          <Row style={[s.hostCard, { backgroundColor: colors.surface2 }]}>
            {hostAvatar ? (
              <Image source={{ uri: hostAvatar }} style={s.hostAvatar} />
            ) : (
              <View style={[s.hostAvatar, s.avatarFallback, { backgroundColor: colors.primary }]}>
                <Text style={s.avatarInitial}>{hostName.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[s.hostLabel, { color: colors.muted }]}>HOSTED BY</Text>
              <Text style={[s.hostName, { color: colors.text }]}>{hostName}</Text>
            </View>
            <View style={[s.verifiedBadge, { backgroundColor: "#10B98120" }]}>
              <MaterialCommunityIcons name="shield-check" size={14} color="#10B981" />
              <Text style={s.verifiedTxt}>Admin</Text>
            </View>
          </Row>

          <View style={[s.noticeBanner, { backgroundColor: colors.surface2 }]}>
            <MaterialCommunityIcons name="lock-outline" size={16} color={colors.primary} />
            <Text style={[s.noticeText, { color: colors.muted }]}>
              This room requires approval from the room admin. You can send a message request or ring the host directly.
            </Text>
          </View>
        </View>

        {/* Dynamic State Section */}
        {requestState === "pending" ? (
          <View style={[s.waitingCard, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
            <View style={s.radarContainer}>
              <Animated.View
                style={[
                  s.radarWave,
                  {
                    borderColor: colors.primary,
                    transform: [{ scale: pulseAnim }],
                    opacity: pulseOpacity,
                  },
                ]}
              />
              <View style={[s.radarCenter, { backgroundColor: colors.primary }]}>
                <MaterialCommunityIcons
                  name={requestMethod === "phone_call" ? "phone-in-talk" : "door-sliding"}
                  size={32}
                  color="#FFFFFF"
                />
              </View>
            </View>

            <Text style={[s.waitingTitle, { color: colors.text }]}>
              {requestMethod === "phone_call" ? "Ringing Room Host…" : "Knock Sent to Host!"}
            </Text>
            <Text style={[s.waitingSub, { color: colors.muted }]}>
              The room admin has been alerted with your request. You will automatically enter the room as soon as you are admitted.
            </Text>

            <Button
              variant="secondary"
              title="Cancel Request"
              onPress={handleCancel}
            />
          </View>
        ) : (
          <View style={[s.actionSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[s.sectionHeading, { color: colors.text }]}>How would you like to request?</Text>

            {/* Option 1: Message Request */}
            <View style={s.optionBlock}>
              <Row style={{ gap: 8, alignItems: "center" }}>
                <MaterialCommunityIcons name="message-text-outline" size={18} color={colors.primary} />
                <Text style={[s.optionTitle, { color: colors.text }]}>Send a Message Request</Text>
              </Row>
              <TextInput
                style={[
                  s.input,
                  {
                    backgroundColor: colors.surface2,
                    color: colors.text,
                    borderColor: colors.border,
                  },
                ]}
                placeholder="Introduce yourself or mention why you want to join..."
                placeholderTextColor={colors.muted}
                value={message}
                onChangeText={setMessage}
                multiline
                numberOfLines={3}
                maxLength={300}
              />
              <Button
                variant="primary"
                title="Send Knock Request"
                disabled={knockMutation.isPending}
                loading={knockMutation.isPending && requestMethod === "message"}
                onPress={() => knockMutation.mutate("message")}
                icon="send-outline"
              />
            </View>

            <Row style={s.dividerRow}>
              <View style={[s.dividerLine, { backgroundColor: colors.border }]} />
              <Text style={[s.dividerText, { color: colors.muted }]}>OR</Text>
              <View style={[s.dividerLine, { backgroundColor: colors.border }]} />
            </Row>

            {/* Option 2: Direct Phone Call / Audio Ring */}
            <View style={s.optionBlock}>
              <Row style={{ gap: 8, alignItems: "center" }}>
                <MaterialCommunityIcons name="phone-outgoing-outline" size={18} color="#10B981" />
                <Text style={[s.optionTitle, { color: colors.text }]}>Direct Call / Ring Host</Text>
              </Row>
              <Text style={[s.callSubText, { color: colors.muted }]}>
                Triggers an immediate ringing notification to the host's device to open the room for you.
              </Text>
              <Pressable
                onPress={() => knockMutation.mutate("phone_call")}
                disabled={knockMutation.isPending}
                style={[s.callButton, { backgroundColor: "#10B981" }]}
              >
                {knockMutation.isPending && requestMethod === "phone_call" ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="phone" size={18} color="#FFFFFF" />
                    <Text style={s.callButtonText}>Ring Host to Enter</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  topNav: {
    height: 52,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: 6,
    borderRadius: 8,
  },
  navTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  content: {
    padding: 16,
    gap: 16,
  },
  heroCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 20,
    alignItems: "center",
    gap: 12,
  },
  roomIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  roomTitle: {
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  topicBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  topicText: {
    fontSize: 12,
    fontWeight: "600",
  },
  capacityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  capacityText: {
    fontSize: 12,
    fontWeight: "500",
  },
  hostCard: {
    width: "100%",
    padding: 12,
    borderRadius: radius.md,
    alignItems: "center",
    gap: 12,
    marginTop: 4,
  },
  hostAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  hostLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  hostName: {
    fontSize: 14,
    fontWeight: "700",
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  verifiedTxt: {
    fontSize: 11,
    fontWeight: "700",
    color: "#10B981",
  },
  noticeBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: radius.md,
    width: "100%",
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  actionSection: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 16,
    gap: 16,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: "700",
  },
  optionBlock: {
    gap: 10,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
    fontSize: 14,
    textAlignVertical: "top",
    minHeight: 72,
  },
  dividerRow: {
    alignItems: "center",
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 12,
    fontWeight: "700",
  },
  callSubText: {
    fontSize: 12,
    lineHeight: 16,
  },
  callButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 46,
    borderRadius: radius.md,
  },
  callButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  waitingCard: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: 28,
    alignItems: "center",
    gap: 12,
  },
  radarContainer: {
    width: 90,
    height: 90,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 10,
  },
  radarWave: {
    position: "absolute",
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
  },
  radarCenter: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  waitingTitle: {
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  waitingSub: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
    paddingHorizontal: 8,
  },
});
