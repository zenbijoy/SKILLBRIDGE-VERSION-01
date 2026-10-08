import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Image,
  Animated,
  StatusBar,
} from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCallStore } from "../store/callStore";
import { getSocket, onSocket } from "@/lib/socket";
import { acceptCallApi, rejectCallApi } from "../services/callApi";
import { triggerHaptic } from "@/components/ui";
import { callSounds } from "../services/callSounds";

export const IncomingCallModal: React.FC = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { incomingCall, setIncomingCall, startCall } = useCallStore();

  // Animation values for pulsing ripple rings
  const [pulse1] = useState(() => new Animated.Value(1));
  const [pulse2] = useState(() => new Animated.Value(1));
  const [buttonPulse] = useState(() => new Animated.Value(1));

  // Pulse animation loop
  useEffect(() => {
    if (!incomingCall) return;

    const ringAnim = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulse1, {
            toValue: 1.45,
            duration: 1600,
            useNativeDriver: true,
          }),
          Animated.timing(pulse1, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.delay(400),
          Animated.timing(pulse2, {
            toValue: 1.85,
            duration: 1600,
            useNativeDriver: true,
          }),
          Animated.timing(pulse2, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(buttonPulse, {
            toValue: 1.1,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(buttonPulse, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );

    ringAnim.start();

    // Trigger ringtone and continuous rhythmic vibration
    callSounds.playRingtone();

    return () => {
      ringAnim.stop();
      callSounds.stopAll();
    };
  }, [incomingCall, pulse1, pulse2, buttonPulse]);

  // Robust Socket Event Listeners for Incoming Call
  useEffect(() => {
    const unsubIncoming = onSocket("call:incoming", (data: {
      callId: string;
      callerId: string;
      callerName: string;
      callerAvatar?: string | null;
      type: "audio" | "video";
      provider?: "webrtc" | "livekit";
    }) => {
      triggerHaptic();
      setIncomingCall({
        callId: data.callId,
        callerId: data.callerId,
        callerName: data.callerName,
        callerAvatar: data.callerAvatar,
        type: data.type || "video",
        provider: data.provider || "webrtc",
      });
    });

    const unsubReject = onSocket("call:reject", (data: { callId?: string }) => {
      const current = useCallStore.getState().incomingCall;
      if (current && current.callId === data?.callId) {
        callSounds.stopAll();
        setIncomingCall(null);
      }
    });

    const unsubEnd = onSocket("call:end", (data: { callId?: string }) => {
      const current = useCallStore.getState().incomingCall;
      if (current && current.callId === data?.callId) {
        callSounds.stopAll();
        setIncomingCall(null);
      }
    });

    return () => {
      unsubIncoming();
      unsubReject();
      unsubEnd();
    };
  }, [setIncomingCall]);

  if (!incomingCall) return null;

  const handleAccept = async () => {
    await callSounds.stopAll();
    triggerHaptic();
    const call = incomingCall;
    try {
      const res = await acceptCallApi(call.callId);
      const socket = getSocket();
      socket?.emit("call:accept", { callId: call.callId });
      startCall({
        callId: call.callId,
        role: "callee",
        peer: {
          id: call.callerId,
          name: call.callerName,
          avatarUrl: call.callerAvatar,
        },
        type: call.type,
        provider: res.provider,
        providerConfig: res.providerConfig,
      });
      setIncomingCall(null);
      router.push(`/call/${call.callId}?callId=${call.callId}` as any);
    } catch (err) {
      console.error("Failed to accept incoming call:", err);
      setIncomingCall(null);
    }
  };

  const handleDecline = async () => {
    await callSounds.stopAll();
    triggerHaptic();
    const callId = incomingCall.callId;
    try {
      await rejectCallApi(callId, "declined");
      const socket = getSocket();
      socket?.emit("call:reject", { callId, reason: "declined" });
    } catch {
      // Non-fatal
    } finally {
      setIncomingCall(null);
    }
  };

  const isVideo = incomingCall.type === "video";

  return (
    <Modal visible={Boolean(incomingCall)} transparent={false} animationType="fade">
      <StatusBar barStyle="light-content" backgroundColor="#070C18" />
      <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 36 }]}>
        {/* Top Header Information */}
        <View style={styles.header}>
          <View style={styles.securityBadge}>
            <MaterialCommunityIcons name="shield-check" size={16} color="#10B981" />
            <Text style={styles.securityText}>End-to-End Encrypted</Text>
          </View>
          <Text style={styles.callTypeLabel}>
            {isVideo ? "SKILLBRIDGE VIDEO CALL" : "SKILLBRIDGE AUDIO CALL"}
          </Text>
        </View>

        {/* Center: Pulsing Avatar & Caller Identity */}
        <View style={styles.centerContent}>
          <View style={styles.avatarWrapper}>
            {/* Pulsing Ripple 2 */}
            <Animated.View
              style={[
                styles.rippleRing,
                {
                  transform: [{ scale: pulse2 }],
                  opacity: pulse2.interpolate({
                    inputRange: [1, 1.85],
                    outputRange: [0.35, 0],
                  }),
                },
              ]}
            />
            {/* Pulsing Ripple 1 */}
            <Animated.View
              style={[
                styles.rippleRing,
                {
                  transform: [{ scale: pulse1 }],
                  opacity: pulse1.interpolate({
                    inputRange: [1, 1.45],
                    outputRange: [0.55, 0],
                  }),
                },
              ]}
            />

            {/* Avatar */}
            {incomingCall.callerAvatar ? (
              <Image source={{ uri: incomingCall.callerAvatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.placeholderAvatar]}>
                <Text style={styles.avatarInitials}>
                  {incomingCall.callerName.slice(0, 2).toUpperCase()}
                </Text>
              </View>
            )}
          </View>

          <Text style={styles.callerName} numberOfLines={1}>
            {incomingCall.callerName}
          </Text>
          <Text style={styles.ringingText}>Incoming {isVideo ? "video" : "voice"} call…</Text>
        </View>

        {/* Bottom: Action Controls */}
        <View style={styles.actionsContainer}>
          <View style={styles.actionRow}>
            {/* Decline Button (Red) */}
            <View style={styles.buttonWrapper}>
              <TouchableOpacity
                style={styles.declineButton}
                onPress={handleDecline}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Decline Call"
              >
                <MaterialCommunityIcons name="phone-hangup" size={32} color="#FFFFFF" />
              </TouchableOpacity>
              <Text style={styles.actionLabel}>Decline</Text>
            </View>

            {/* Accept Button (Green with Pulse) */}
            <View style={styles.buttonWrapper}>
              <Animated.View style={{ transform: [{ scale: buttonPulse }] }}>
                <TouchableOpacity
                  style={styles.acceptButton}
                  onPress={handleAccept}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Accept Call"
                >
                  <MaterialCommunityIcons
                    name={isVideo ? "video" : "phone"}
                    size={32}
                    color="#FFFFFF"
                  />
                </TouchableOpacity>
              </Animated.View>
              <Text style={styles.actionLabel}>Accept</Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#070C18",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  header: {
    alignItems: "center",
    gap: 8,
  },
  securityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  securityText: {
    color: "#6EE7B7",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  callTypeLabel: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginTop: 4,
  },
  centerContent: {
    alignItems: "center",
    width: "100%",
  },
  avatarWrapper: {
    width: 140,
    height: 140,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  rippleRing: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "#38BDF8",
  },
  avatar: {
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 4,
    borderColor: "#38BDF8",
    zIndex: 2,
  },
  placeholderAvatar: {
    backgroundColor: "#1E293B",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    color: "#38BDF8",
    fontSize: 44,
    fontWeight: "800",
  },
  callerName: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 8,
    textAlign: "center",
  },
  ringingText: {
    color: "#94A3B8",
    fontSize: 16,
    fontWeight: "500",
  },
  actionsContainer: {
    width: "100%",
    maxWidth: 340,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    width: "100%",
  },
  buttonWrapper: {
    alignItems: "center",
    gap: 12,
  },
  declineButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    shadowColor: "#EF4444",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
  },
  acceptButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#10B981",
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
  },
  actionLabel: {
    color: "#CBD5E1",
    fontSize: 14,
    fontWeight: "600",
  },
});
