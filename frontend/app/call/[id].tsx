import React, { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View, Text, StyleSheet, Image, Pressable } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useWebRTCCall } from "@/features/calls/hooks/useWebRTCCall";
import { useCallStore } from "@/features/calls/store/callStore";
import { CallControls } from "@/features/calls/components/CallControls";
import { ConnectionQuality } from "@/features/calls/components/ConnectionQuality";
import { VideoView } from "@/features/calls/components/VideoView";
import { initiateCallApi } from "@/features/calls/services/callApi";
import { triggerHaptic } from "@/components/ui";

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
  const routeId = routeSegment;
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
  const [controlsVisible, setControlsVisible] = useState(true);

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
  } = useWebRTCCall(targetId);

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

    if (existingCallId || !activeCall || (targetId && activeCall.peer.id !== targetId)) {
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
      style={styles.container}
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
          <View style={styles.avatarContainer}>
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
          </View>

          <Text style={styles.calleeName}>
            {activeCall?.peer.name || name || "SkillBridge Peer"}
          </Text>

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
    paddingTop: 54,
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
  callStatus: {
    color: "#94A3B8",
    fontSize: 15,
    fontWeight: "500",
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
