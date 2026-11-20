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
  const [isSilenced, setIsSilenced] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);

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

  // Fix C-1/C-6/C-7: Robust Socket Event Listeners for Incoming Call
  // - Busy guard: If already in an active connected call, auto-reject new incoming call with "busy"
  // - Clear stale or non-connected calls so incoming calls are never blocked
  // - Dual listener: Listen to both `call:incoming` AND `notification:new` (kind="call")
  // - Multi-tab (Web): Use BroadcastChannel so only one tab rings at a time
  useEffect(() => {
    // Web: BroadcastChannel so only the tab that answers the call rings.
    // Other tabs dismiss their incoming call modal when one tab picks up.
    let broadcastChannel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      broadcastChannel = new BroadcastChannel("skillbridge-call");
      broadcastChannel.onmessage = (event) => {
        if (event.data?.type === "call:answered" || event.data?.type === "call:dismissed") {
          const current = useCallStore.getState().incomingCall;
          if (current && current.callId === event.data.callId) {
            callSounds.stopAll();
            setIncomingCall(null);
          }
        }
      };
    }

    const unsubIncoming = onSocket("call:incoming", (data: {
      callId: string;
      callerId: string;
      callerName: string;
      callerAvatar?: string | null;
      type: "audio" | "video";
      provider?: "webrtc" | "livekit";
    }) => {
      const { activeCall, resetCall } = useCallStore.getState();
      const isActuallyBusy = activeCall && activeCall.status === "connected";

      if (isActuallyBusy) {
        const socket = getSocket();
        socket?.emit("call:reject", { callId: data.callId, reason: "busy" });
        import("../services/callApi").then(({ rejectCallApi }) => {
          rejectCallApi(data.callId, "busy").catch(() => {});
        }).catch(() => {});
        return;
      }

      // If activeCall was in a non-connected state (e.g. stale initiating or ended), reset it
      if (activeCall && activeCall.status !== "connected") {
        resetCall();
      }

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

    const unsubNotification = onSocket("notification:new", (notif: any) => {
      if (!notif) return;
      const isCall =
        notif.kind === "call" ||
        notif.data?.type === "call" ||
        Boolean(notif.data?.callType) ||
        (typeof notif.title === "string" && notif.title.toLowerCase().includes("incoming"));
      if (!isCall) return;

      const callId = notif.data?.callId;
      if (!callId) return;

      // Avoid re-processing if already showing this incoming call
      const current = useCallStore.getState().incomingCall;
      if (current && current.callId === callId) return;

      const { activeCall, resetCall } = useCallStore.getState();
      const isActuallyBusy = activeCall && activeCall.status === "connected";

      if (isActuallyBusy) {
        const socket = getSocket();
        socket?.emit("call:reject", { callId, reason: "busy" });
        import("../services/callApi").then(({ rejectCallApi }) => {
          rejectCallApi(callId, "busy").catch(() => {});
        }).catch(() => {});
        return;
      }

      if (activeCall && activeCall.status !== "connected") {
        resetCall();
      }

      triggerHaptic();
      setIncomingCall({
        callId,
        callerId: notif.data?.callerId || "",
        callerName:
          notif.data?.callerName ||
          (typeof notif.title === "string"
            ? notif.title.replace(/^Incoming (audio|video|voice)?\s*call/i, "").trim() || "Peer"
            : "Peer"),
        callerAvatar: notif.data?.callerAvatar || null,
        type: (notif.data?.callType || notif.data?.type || "video") === "audio" ? "audio" : "video",
        provider: notif.data?.provider || "webrtc",
      });
    });

    const unsubReject = onSocket("call:reject", (data: { callId?: string }) => {
      const current = useCallStore.getState().incomingCall;
      if (current && (!data?.callId || current.callId === data?.callId)) {
        callSounds.stopAll().catch(() => {});
        setIncomingCall(null);
      }
    });

    const unsubEnd = onSocket("call:end", (data: { callId?: string }) => {
      const current = useCallStore.getState().incomingCall;
      if (current && (!data?.callId || current.callId === data?.callId)) {
        callSounds.stopAll().catch(() => {});
        setIncomingCall(null);
      }
    });

    const unsubMissed = onSocket("call:missed", (data: { callId?: string }) => {
      const current = useCallStore.getState().incomingCall;
      if (current && (!data?.callId || current.callId === data?.callId)) {
        callSounds.stopAll().catch(() => {});
        setIncomingCall(null);
      }
    });

    return () => {
      unsubIncoming();
      unsubNotification();
      unsubReject();
      unsubEnd();
      unsubMissed();
      broadcastChannel?.close();
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
        provider: "webrtc",
        providerConfig: {},
      });
      setIncomingCall(null);
      // Notify other browser tabs that this tab answered the call
      if (typeof BroadcastChannel !== "undefined") {
        const bc = new BroadcastChannel("skillbridge-call");
        bc.postMessage({ type: "call:answered", callId: call.callId });
        bc.close();
      }
      router.push(`/call/${call.callId}?callId=${call.callId}&autoAccept=true` as any);
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

  const cannedMessages = [
    "Can't talk now. What's up?",
    "I'll call you right back.",
    "Can you text me instead?",
    "In a meeting, will reach out later.",
  ];

  const handleSilence = async () => {
    await callSounds.stopAll();
    setIsSilenced(true);
    triggerHaptic();
  };

  const handleReplyWithMessage = async (msg: string) => {
    await callSounds.stopAll();
    triggerHaptic();
    const callId = incomingCall.callId;
    try {
      await rejectCallApi(callId, "declined");
      const socket = getSocket();
      socket?.emit("call:reject", { callId, reason: "declined", message: msg });
      socket?.emit("chat:send", {
        receiverId: incomingCall.callerId,
        content: msg,
      });
    } catch {
      // Non-fatal
    } finally {
      setShowQuickReplies(false);
      setIncomingCall(null);
    }
  };

  const isVideo = incomingCall.type === "video";

  return (
    <Modal visible={Boolean(incomingCall)} transparent={false} animationType="fade">
      <StatusBar barStyle="light-content" backgroundColor="#070C18" />
      <View style={[styles.container, { paddingTop: Math.max(insets.top, 28) + 12, paddingBottom: Math.max(insets.bottom, 24) + 16 }]}>
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
          <Text style={styles.ringingText}>
            {isSilenced ? "Call silenced" : `Incoming ${isVideo ? "video" : "voice"} call…`}
          </Text>
        </View>

        {/* Bottom: WhatsApp Style Auxiliary & Main Call Controls */}
        <View style={styles.actionsContainer}>
          {/* Top auxiliary action row: Message & Silence (WhatsApp style) */}
          <View style={styles.auxActionRow}>
            <TouchableOpacity
              style={styles.auxButton}
              onPress={() => setShowQuickReplies(true)}
              activeOpacity={0.7}
              accessibilityLabel="Reply with message"
            >
              <MaterialCommunityIcons name="message-reply-text" size={22} color="#94A3B8" />
              <Text style={styles.auxLabel}>Reply</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.auxButton}
              onPress={handleSilence}
              disabled={isSilenced}
              activeOpacity={0.7}
              accessibilityLabel="Silence ringtone"
            >
              <MaterialCommunityIcons
                name={isSilenced ? "bell-off" : "bell"}
                size={22}
                color={isSilenced ? "#64748B" : "#94A3B8"}
              />
              <Text style={[styles.auxLabel, isSilenced && { color: "#64748B" }]}>
                {isSilenced ? "Silenced" : "Silence"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Main Action Row: Decline (Red) & Accept (Green) */}
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

        {/* WhatsApp-Style Quick Replies Sheet Modal */}
        <Modal
          visible={showQuickReplies}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowQuickReplies(false)}
        >
          <View style={styles.quickReplyOverlay}>
            <View style={[styles.quickReplySheet, { paddingBottom: Math.max(insets.bottom, 20) + 16 }]}>
              <View style={styles.sheetHandle} />
              <Text style={styles.quickReplyTitle}>Quick Message & Decline</Text>
              <Text style={styles.quickReplySub}>
                Send a quick reply to {incomingCall.callerName}
              </Text>

              <View style={styles.cannedList}>
                {cannedMessages.map((msg, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.cannedItem}
                    onPress={() => handleReplyWithMessage(msg)}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons name="send-circle" size={24} color="#38BDF8" />
                    <Text style={styles.cannedText}>{msg}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={styles.cancelSheetBtn}
                onPress={() => setShowQuickReplies(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelSheetBtnText}>Back to Call</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
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
    gap: 20,
  },
  auxActionRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  auxButton: {
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  auxLabel: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600",
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
  quickReplyOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "flex-end",
  },
  quickReplySheet: {
    backgroundColor: "#0F172A",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#475569",
    marginBottom: 16,
  },
  quickReplyTitle: {
    color: "#F8FAFC",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  quickReplySub: {
    color: "#94A3B8",
    fontSize: 13,
    marginBottom: 20,
  },
  cannedList: {
    width: "100%",
    gap: 10,
    marginBottom: 20,
  },
  cannedItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  cannedText: {
    color: "#E2E8F0",
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  cancelSheetBtn: {
    width: "100%",
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  cancelSheetBtnText: {
    color: "#94A3B8",
    fontSize: 15,
    fontWeight: "600",
  },
});
