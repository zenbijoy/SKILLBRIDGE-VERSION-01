import React, { useEffect } from "react";
import { View, Text, StyleSheet, Modal, TouchableOpacity, Image } from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useCallStore } from "../store/callStore";
import { getSocket } from "@/lib/socket";
import { acceptCallApi, rejectCallApi } from "../services/callApi";
import { triggerHaptic } from "@/components/ui";

export const IncomingCallModal: React.FC = () => {
  const router = useRouter();
  const { incomingCall, setIncomingCall, startCall } = useCallStore();
  const socket = getSocket();

  useEffect(() => {
    if (!socket) return;

    const handleIncoming = (data: {
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
    };

    const handleRejectOrEnd = (data: { callId: string }) => {
      if (incomingCall && incomingCall.callId === data.callId) {
        setIncomingCall(null);
      }
    };

    socket.on("call:incoming", handleIncoming);
    socket.on("call:reject", handleRejectOrEnd);
    socket.on("call:end", handleRejectOrEnd);

    return () => {
      socket.off("call:incoming", handleIncoming);
      socket.off("call:reject", handleRejectOrEnd);
      socket.off("call:end", handleRejectOrEnd);
    };
  }, [socket, incomingCall, setIncomingCall]);

  if (!incomingCall) return null;

  const handleAccept = async () => {
    triggerHaptic();
    const call = incomingCall;
    try {
      const res = await acceptCallApi(call.callId);
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
      router.push(`/call/${call.callId}` as any);
    } catch (err) {
      console.error("Failed to accept incoming call:", err);
      setIncomingCall(null);
    }
  };

  const handleDecline = async () => {
    triggerHaptic();
    const callId = incomingCall.callId;
    try {
      await rejectCallApi(callId, "declined");
      socket?.emit("call:reject", { callId, reason: "declined" });
    } catch {
      // Non-fatal
    } finally {
      setIncomingCall(null);
    }
  };

  return (
    <Modal visible={Boolean(incomingCall)} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Caller Avatar */}
          {incomingCall.callerAvatar ? (
            <Image source={{ uri: incomingCall.callerAvatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.placeholderAvatar]}>
              <Text style={styles.avatarInitials}>
                {incomingCall.callerName.slice(0, 2).toUpperCase()}
              </Text>
            </View>
          )}

          {/* Caller Name & Subtitle */}
          <Text style={styles.name}>{incomingCall.callerName}</Text>
          <Text style={styles.subtitle}>
            Incoming {incomingCall.type === "video" ? "Video" : "Audio"} Call…
          </Text>

          {/* Action Buttons */}
          <View style={styles.actionRow}>
            {/* Decline (Red) */}
            <TouchableOpacity style={styles.declineButton} onPress={handleDecline} activeOpacity={0.8}>
              <MaterialCommunityIcons name="phone-hangup" size={30} color="#FFFFFF" />
              <Text style={styles.buttonLabel}>Decline</Text>
            </TouchableOpacity>

            {/* Accept (Green) */}
            <TouchableOpacity style={styles.acceptButton} onPress={handleAccept} activeOpacity={0.8}>
              <MaterialCommunityIcons
                name={incomingCall.type === "video" ? "video" : "phone"}
                size={30}
                color="#FFFFFF"
              />
              <Text style={styles.buttonLabel}>Accept</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(5, 8, 18, 0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#0F172A",
    borderRadius: 28,
    padding: 32,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    marginBottom: 16,
  },
  placeholderAvatar: {
    backgroundColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "700",
  },
  name: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 6,
    textAlign: "center",
  },
  subtitle: {
    color: "#94A3B8",
    fontSize: 14,
    marginBottom: 36,
    textAlign: "center",
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: 16,
  },
  declineButton: {
    alignItems: "center",
    justifyContent: "center",
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#EF4444",
  },
  acceptButton: {
    alignItems: "center",
    justifyContent: "center",
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#10B981",
  },
  buttonLabel: {
    position: "absolute",
    bottom: -22,
    color: "#E2E8F0",
    fontSize: 12,
    fontWeight: "500",
  },
});
