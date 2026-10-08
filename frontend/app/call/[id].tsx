import React, { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View, Text, StyleSheet, Image, Pressable, Animated } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useWebRTCCall } from "@/features/calls/hooks/useWebRTCCall";
import { useCallStore } from "@/features/calls/store/callStore";
import { CallControls } from "@/features/calls/components/CallControls";
import { ConnectionQuality } from "@/features/calls/components/ConnectionQuality";
import { VideoView } from "@/features/calls/components/VideoView";
import { initiateCallApi, getCallApi, acceptCallApi } from "@/features/calls/services/callApi";
import { supabase } from "@/lib/supabase";
import { triggerHaptic } from "@/components/ui";
import { useUserPresence } from "@/features/presence/usePresence";
import { getSocket, connectSocket } from "@/lib/socket";

export default function CallScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string | string[];
    callId?: string | string[];
    targetId?: string | string[];
    userId?: string | string[];
    name?: string | string[];
    avatar?: string | string[];
    type?: "audio" | "video" | string | string[];
  }>();
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const routeSegment = first(params.id);
  const acceptedCallId = first(params.callId);
  const targetParam = first(params.targetId);
  const calleeParam = first(params.userId);
  const name = first(params.name);
  const avatar = first(params.avatar);
  const rawType = first(params.type);
  const type: "audio" | "video" = rawType === "audio" ? "audio" : "video";

  // Outgoing calls route as /call/<peerId>. Incoming accept / resume routes as
  // /call/<callId> (+ optional ?callId=). The store is the source of truth when
  // IncomingCallModal already populated it; otherwise resolve from the route.
  const { activeCall, startCall, setCallStatus, setMinimized } = useCallStore();
  const queryCallId = acceptedCallId;
  // When the store already holds this call, this screen is a join/resume — never re-initiate.
  const storeCallId = activeCall?.callId;
  const isJoiningExistingCall =
    Boolean(storeCallId) &&
    (storeCallId === routeSegment || storeCallId === queryCallId || Boolean(queryCallId));
  // Outgoing target is explicit via query (?targetId / ?userId) or, when this is
  // NOT an existing-call join, the route segment itself is the peer id.
  const targetId: string | undefined = targetParam || calleeParam || (isJoiningExistingCall ? activeCall?.peer.id : routeSegment);
  const existingCallId: string | undefined = isJoiningExistingCall ? storeCallId : queryCallId;
  const isPeerOnline = useUserPresence(targetId);
  const [controlsVisible, setControlsVisible] = useState(true);
  // Set when a cold-start (app killed → tap call notification) resolves
  // to a call that is no longer live, so we can show a missed-call notice.
  const [coldStartStatus, setColdStartStatus] = useState<"restoring" | "missed" | null>(null);

  // Animated breathing pulse for the avatar during calling / audio
  const [avatarPulse] = useState(() => new Animated.Value(1));
  useEffect(() => {
    const pulseAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(avatarPulse, { toValue: 1.07, duration: 1300, useNativeDriver: true }),
        Animated.timing(avatarPulse, { toValue: 1.0, duration: 1300, useNativeDriver: true }),
      ]),
    );
    pulseAnim.start();
    return () => pulseAnim.stop();
  }, [avatarPulse]);

  // Un-minimize when entering CallScreen
  useEffect(() => {
    setMinimized(false);
  }, [setMinimized]);

  const {
    localStream,
    remoteStream,
    errorMessage,
    initLocalMedia,
    setupPeerConnection,
    endCall,
    toggleMuteTrack,
    toggleVideoTrack,
    toggleSpeaker,
    toggleCameraFacing,
  } = useWebRTCCall(activeCall?.callId || existingCallId);

  const insets = useSafeAreaInsets();

  // Cold-start restore: when the app is launched from a call push
  // notification the call store is empty (activeCall === null). Fetch
  // the call record, accept it if it is still ringing, and populate
  // the store so WebRTC signaling can resume. If the call already
  // timed out / was missed, surface a missed-call notice instead.
  useEffect(() => {
    let isCancelled = false;

    async function restoreCallFromNotification() {
      if (!existingCallId || activeCall) return;

      setColdStartStatus("restoring");
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const currentUserId = sessionData.session?.user.id;
        if (sessionData.session?.access_token) {
          connectSocket(sessionData.session.access_token);
        }

        const record = await getCallApi(existingCallId);
        if (isCancelled) return;

        if (record.status === "ringing") {
          // Tapping the notification is an implicit accept.
          try {
            const res = await acceptCallApi(existingCallId);
            if (isCancelled) return;

            const isCaller = record.caller_id === currentUserId;
            const peerId = isCaller ? record.callee_id : record.caller_id;
            const peerProfile = isCaller ? record.callee : record.caller;

            startCall({
              callId: record.id,
              role: isCaller ? "caller" : "callee",
              peer: {
                id: peerId,
                name: peerProfile?.full_name || peerProfile?.username || "SkillBridge Peer",
                avatarUrl: peerProfile?.avatar_url || null,
              },
              type: (record.type as "audio" | "video") || "video",
              provider: res.provider,
              providerConfig: res.providerConfig,
            });
            setColdStartStatus(null);
          } catch (err) {
            console.error("Failed to accept call from notification:", err);
            setCallStatus("failed");
          }
        } else if (
          record.status === "missed" ||
          record.status === "ended" ||
          record.status === "declined" ||
          record.status === "busy" ||
          record.status === "failed"
        ) {
          setColdStartStatus("missed");
        } else {
          // Already accepted / connecting — resume media below.
          setColdStartStatus(null);
        }
      } catch (err) {
        console.error("Failed to fetch call record:", err);
        setColdStartStatus("missed");
      }
    }

    if (existingCallId && !activeCall) {
      void restoreCallFromNotification();
    }

    return () => {
      isCancelled = true;
    };
  }, [existingCallId, activeCall, startCall, setCallStatus]);

  // Auto-dismiss screen if call ended/failed/declined
  useEffect(() => {
    if (activeCall?.status === "ended" || activeCall?.status === "declined" || activeCall?.status === "failed") {
      const timer = setTimeout(() => {
        setMinimized(false);
        router.back();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [activeCall?.status, router, setMinimized]);

  // Auto-dismiss missed-call notice (cold start from stale notification)
  useEffect(() => {
    if (coldStartStatus === "missed") {
      const timer = setTimeout(() => {
        setMinimized(false);
        router.back();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [coldStartStatus, router, setMinimized]);

  // Auto-hide controls on video call
  useEffect(() => {
    if (activeCall?.status === "connected" && activeCall.type === "video") {
      const timer = setTimeout(() => setControlsVisible(false), 4000);
      return () => clearTimeout(timer);
    } else {
      setControlsVisible(true);
    }
  }, [activeCall?.status, activeCall?.type]);

  // 1. Initiate Outgoing Call if not already in store
  useEffect(() => {
    let isCancelled = false;

    async function startOutgoingCall() {
      // Join/resume path: IncomingCallModal (or a banner/tap) already created the
      // call record and populated the store. Only ensure media is ready — never
      // POST /calls again with the callId as if it were a peer id.
      if (existingCallId) {
        try {
          const stream = await initLocalMedia(activeCall?.type || (type as "audio" | "video"));
          await setupPeerConnection(stream);
          // Signal to caller that callee is ready for WebRTC SDP offer
          const socket = getSocket();
          socket?.emit("call:ready", { callId: existingCallId });
        } catch (err: any) {
          if (!isCancelled) {
            console.error("Failed to prepare media for existing call:", err);
            setCallStatus("failed");
          }
        }
        return;
      }
      if (!targetId) return;
      if (activeCall && targetId && activeCall.peer.id === targetId) return;

      try {
        setCallStatus("initiating");
        const callResponse = await initiateCallApi(targetId, type as "audio" | "video");
        if (isCancelled) return;

        startCall({
          callId: callResponse.call.id,
          role: "caller",
          peer: {
            id: targetId,
            name: name || "SkillBridge Peer",
            avatarUrl: avatar || null,
          },
          type: type as "audio" | "video",
          provider: callResponse.provider,
          providerConfig: callResponse.providerConfig,
        });

        // Initialize local media and peer connection
        const stream = await initLocalMedia(type as "audio" | "video");
        await setupPeerConnection(stream);
      } catch (err: any) {
        if (!isCancelled) {
          console.error("Failed to initiate outgoing call:", err);
          setCallStatus("failed");
        }
      }
    }

    // Only initialise media once the call state is known. On a
    // cold start from a notification, `activeCall` is populated
    // by the restore effect above — don't race ahead and open
    // the mic/camera before we know whether the call is live.
    const shouldJoinExistingCall = Boolean(existingCallId && activeCall);
    const shouldStartOutgoingCall =
      !existingCallId &&
      (!activeCall || (targetId && activeCall.peer.id !== targetId));

    if (shouldJoinExistingCall || shouldStartOutgoingCall) {
      void startOutgoingCall();
    }

    return () => {
      isCancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId, name, avatar, type]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleMinimize = () => {
    triggerHaptic();
    setMinimized(true);
    router.back();
  };

  const handleEndCall = () => {
    triggerHaptic();
    setMinimized(false);
    endCall("hangup");
    router.back();
  };

  const isConnected = activeCall?.status === "connected";
  const isVideo = activeCall?.type === "video";

  return (
    <Pressable
      style={[styles.container, { paddingTop: Math.max(insets.top, 12) }]}
      onPress={() => {
        if (isConnected && isVideo) {
          setControlsVisible((prev) => !prev);
        }
      }}
    >
      {/* Remote Video Stream if available */}
      {isConnected && isVideo && remoteStream ? (
        <VideoView
          stream={remoteStream}
          style={StyleSheet.absoluteFill}
          objectFit="cover"
        />
      ) : null}

      {/* Top Header Bar */}
      {controlsVisible && (
        <View style={styles.topBar}>
          <Pressable onPress={handleMinimize} hitSlop={12} style={styles.backButton}>
            <MaterialCommunityIcons name="chevron-down" size={32} color="#FFFFFF" />
          </Pressable>

          <View style={styles.topBadges}>
            <View style={styles.encryptionBadge}>
              <MaterialCommunityIcons name="shield-check-outline" size={12} color="#A7F3D0" />
              <Text style={styles.encryptionText}>Secure Connection</Text>
            </View>
            {isConnected ? <ConnectionQuality metrics={activeCall?.metrics} /> : null}
          </View>
        </View>
      )}

      {/* Main Profile Info (Centered when audio or connecting) */}
      {(!isConnected || !isVideo) && (
        <View style={styles.centerProfile}>
          <Animated.View style={[styles.avatarContainer, { transform: [{ scale: avatarPulse }] }]}>
            {activeCall?.peer.avatarUrl || avatar ? (
              <Image
                source={{ uri: activeCall?.peer.avatarUrl || avatar }}
                style={styles.avatar}
              />
            ) : (
              <View style={[styles.avatar, styles.placeholderAvatar]}>
                <Text style={styles.avatarInitial}>
                  {(activeCall?.peer.name || name || "U").charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </Animated.View>

          <Text style={styles.calleeName}>
            {activeCall?.peer.name || name || "SkillBridge Peer"}
          </Text>

          {/* Real-time Peer Presence Status Badge */}
          <View style={styles.peerPresenceBadge}>
            <View
              style={[
                styles.presenceDot,
                { backgroundColor: isPeerOnline ? "#10B981" : "#64748B" },
              ]}
            />
            <Text style={styles.presenceText}>{isPeerOnline ? "Active Now" : "Offline"}</Text>
          </View>

          <Text style={styles.callStatus}>
            {activeCall?.status === "initiating"
              ? "Connecting securely…"
              : activeCall?.status === "ringing"
              ? "Ringing…"
              : activeCall?.status === "connecting"
              ? "Establishing P2P link…"
              : activeCall?.status === "connected"
              ? formatDuration(activeCall.durationSeconds)
              : activeCall?.status === "reconnecting"
              ? "Reconnecting…"
              : activeCall?.status === "ended"
              ? "Call Ended"
              : activeCall?.status === "declined"
              ? "Call Declined"
              : activeCall?.status === "busy"
              ? "User is Busy"
              : errorMessage || "Calling…"}
          </Text>
        </View>
      )}

      {/* Missed / ended call notice (cold start from stale notification) */}
      {coldStartStatus === "missed" && (
        <View style={styles.missedCallOverlay}>
          <MaterialCommunityIcons name="phone-hangup" size={48} color="#EF4444" />
          <Text style={styles.missedCallTitle}>Missed Call</Text>
          <Text style={styles.missedCallSubtitle}>
            This call is no longer available.
          </Text>
        </View>
      )}

      {/* Local PIP Video preview if connected with video */}
      {isConnected && isVideo && localStream ? (
        <View style={styles.pipContainer}>
          <VideoView
            stream={localStream}
            style={styles.pipVideo}
            objectFit="cover"
            mirror={activeCall?.isFrontCamera}
            isMuted
          />
        </View>
      ) : null}

      {/* Call Controls Bar */}
      {controlsVisible && (
        <View style={{ width: "100%", paddingBottom: Math.max(insets.bottom, 12) }}>
          <CallControls
            isMuted={activeCall?.isMuted ?? false}
            isVideoEnabled={activeCall?.isVideoEnabled ?? false}
            isSpeakerOn={activeCall?.isSpeakerOn ?? false}
            isFrontCamera={activeCall?.isFrontCamera ?? true}
            onToggleMute={toggleMuteTrack}
            onToggleVideo={toggleVideoTrack}
            onToggleSpeaker={toggleSpeaker}
            onToggleCameraFacing={toggleCameraFacing}
            onEndCall={handleEndCall}
          />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#080E1A",
    justifyContent: "space-between",
    alignItems: "center",
  },
  topBar: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    zIndex: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  topBadges: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  encryptionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(16, 185, 129, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  encryptionText: {
    color: "#A7F3D0",
    fontSize: 11,
    fontWeight: "600",
  },
  centerProfile: {
    alignItems: "center",
    gap: 12,
    marginTop: -40,
  },
  avatarContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: "#38BDF8",
    padding: 3,
    marginBottom: 8,
  },
  avatar: {
    width: "100%",
    height: "100%",
    borderRadius: 60,
  },
  placeholderAvatar: {
    backgroundColor: "#1E293B",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitial: {
    color: "#38BDF8",
    fontSize: 42,
    fontWeight: "800",
  },
  calleeName: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
  },
  peerPresenceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 2,
    marginBottom: 4,
  },
  presenceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  presenceText: {
    color: "#CBD5E1",
    fontSize: 12,
    fontWeight: "600",
  },
  callStatus: {
    color: "#94A3B8",
    fontSize: 15,
    fontWeight: "500",
  },
  missedCallOverlay: {
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 40,
  },
  missedCallTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
    marginTop: 8,
  },
  missedCallSubtitle: {
    color: "#94A3B8",
    fontSize: 14,
    textAlign: "center",
  },
  pipContainer: {
    position: "absolute",
    top: 110,
    right: 20,
    width: 100,
    height: 150,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#38BDF8",
    zIndex: 10,
    backgroundColor: "#000000",
  },
  pipVideo: {
    width: "100%",
    height: "100%",
  },
});
