import React, { useEffect, useState, useRef } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View, Text, StyleSheet, Image, Pressable, Animated } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useWebRTCCall, terminateActiveMediaSession } from "@/features/calls/hooks/useWebRTCCall";
import { callSounds } from "@/features/calls/services/callSounds";
import { useCallStore } from "@/features/calls/store/callStore";
import { CallControls } from "@/features/calls/components/CallControls";
import { ConnectionQuality } from "@/features/calls/components/ConnectionQuality";
import { VideoView } from "@/features/calls/components/VideoView";
import { initiateCallApi, getCallApi, acceptCallApi, rejectCallApi, endCallApi } from "@/features/calls/services/callApi";
import { RemoteAudio } from "@/features/calls/components/RemoteAudio";
import { LiveKitCallBridge } from "@/features/calls/components/LiveKitCallBridge";
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
    autoAccept?: string | string[];
  }>();
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const routeSegment = first(params.id);
  const acceptedCallId = first(params.callId);
  const targetParam = first(params.targetId);
  const calleeParam = first(params.userId);
  const rawName = first(params.name);
  const rawAvatar = first(params.avatar);
  const name = rawName ? decodeURIComponent(rawName) : undefined;
  const avatar = rawAvatar ? decodeURIComponent(rawAvatar) : undefined;
  const rawType = first(params.type);
  const type: "audio" | "video" = rawType === "audio" ? "audio" : "video";
  const autoAcceptParam = first(params.autoAccept);

  // Termination and duplicate initiation guards
  const isEndingRef = useRef(false);
  const hasInitiatedRef = useRef(false);
  const hasSentReadyRef = useRef(false);

  // Outgoing calls route as /call/<peerId>. Incoming accept / resume routes as
  // /call/<callId> (+ optional ?callId=). The store is the source of truth when
  // IncomingCallModal already populated it; otherwise resolve from the route.
  const { activeCall, startCall, setCallStatus, setMinimized } = useCallStore();
  const explicitCallId = acceptedCallId;
  const explicitTargetId = targetParam || calleeParam;
  const storeCallId = activeCall?.callId;
  const isStoreCall = Boolean(storeCallId && (storeCallId === routeSegment || storeCallId === explicitCallId));
  const isExplicitOutgoing = Boolean(explicitTargetId || params.name || params.avatar);
  const effectiveCallId: string | undefined =
    explicitCallId || (isStoreCall ? storeCallId : undefined) || (!isExplicitOutgoing ? routeSegment : undefined);
  const targetId: string | undefined =
    explicitTargetId || (isStoreCall ? activeCall?.peer.id : (isExplicitOutgoing ? routeSegment : undefined));
  const isPeerOnline = useUserPresence(targetId);
  const [controlsVisible, setControlsVisible] = useState(true);
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

  // Un-minimize when entering CallScreen, and cleanup on exit
  useEffect(() => {
    setMinimized(false);
    return () => {
      isEndingRef.current = true;
      const current = useCallStore.getState().activeCall;
      if (!current || !current.isMinimized || current.status === "ended" || current.status === "failed") {
        terminateActiveMediaSession();
        callSounds.stopAll().catch(() => {});
        useCallStore.getState().resetCall();
      }
    };
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
  } = useWebRTCCall(activeCall?.callId || effectiveCallId);

  const insets = useSafeAreaInsets();

  // Cold-start restore: when the app is launched from a call push
  // notification the call store is empty (activeCall === null). Fetch
  // the call record, accept it if it is still ringing, and populate
  // the store so WebRTC signaling can resume. If the call already
  // timed out / was missed, surface a missed-call notice instead.
  useEffect(() => {
    let isCancelled = false;

    async function restoreCallFromNotification() {
      if (!effectiveCallId || activeCall) return;

      setColdStartStatus("restoring");
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const currentUserId = sessionData.session?.user.id;
        if (sessionData.session?.access_token) {
          connectSocket(sessionData.session.access_token);
        }

        const record = await getCallApi(effectiveCallId);
        if (isCancelled) return;

        if (record.status === "ringing" || record.status === "accepted" || record.status === "connected") {
          // Open incoming call screen for ringing status so user can choose Accept or Decline (Bug 7)
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
            provider: (record.metadata as any)?.provider || "webrtc",
          });
          setCallStatus(record.status === "ringing" ? "ringing" : "connecting");
          setColdStartStatus(null);
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
        if (routeSegment && !explicitCallId) {
          setColdStartStatus(null);
        } else {
          setColdStartStatus("missed");
        }
      }
    }

    if (effectiveCallId && !activeCall) {
      void restoreCallFromNotification();
    }

    return () => {
      isCancelled = true;
    };
  }, [effectiveCallId, activeCall, startCall, setCallStatus, routeSegment, explicitCallId]);

  // Fix C-3: Auto-timeout ring after 60s (caller side) if callee never responds.
  // If activeCall transitions away from ringing/initiating, the timeout is cancelled.
  useEffect(() => {
    if (!activeCall) return;
    if (activeCall.role !== "caller") return;
    if (activeCall.status !== "ringing" && activeCall.status !== "initiating") return;

    const ringTimeout = setTimeout(() => {
      const current = useCallStore.getState().activeCall;
      if (current && (current.status === "ringing" || current.status === "initiating")) {
        const socket = getSocket();
        if (socket && current.callId) {
          socket.emit("call:end", { callId: current.callId, durationSeconds: 0 });
        }
        // Use static import (already imported at top of file)
        endCallApi(current.callId, 0, "missed").catch(() => {});
        endCall("missed");
        setTimeout(() => { setMinimized(false); router.back(); }, 1200);
      }
    }, 60_000);

    return () => clearTimeout(ringTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCall?.status, activeCall?.role]);

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
      if (isEndingRef.current) return;

      // Join/resume path: IncomingCallModal (or a banner/tap) already created the
      // call record and populated the store.
      if (effectiveCallId) {
        // If callee is still in ringing status (waiting for user to accept), do not auto-initialize media
        if (activeCall?.role === "callee" && activeCall?.status === "ringing") {
          return;
        }

        try {
          const stream = await initLocalMedia(activeCall?.type || (type as "audio" | "video"));
          await setupPeerConnection(stream);
          // Signal to caller that callee is ready for WebRTC SDP offer exactly once
          if (!hasSentReadyRef.current) {
            hasSentReadyRef.current = true;
            const socket = getSocket();
            socket?.emit("call:ready", { callId: effectiveCallId });
          }
        } catch (err: any) {
          if (!isCancelled && !isEndingRef.current) {
            console.error("Failed to prepare media for existing call:", err);
            setCallStatus("failed");
          }
        }
        return;
      }

      if (!targetId || isEndingRef.current) return;
      if (hasInitiatedRef.current) return;
      hasInitiatedRef.current = true;
      if (activeCall && targetId && activeCall.peer.id === targetId) return;

      try {
        setCallStatus("initiating");
        const callResponse = await initiateCallApi(targetId, type as "audio" | "video", "webrtc");
        if (isCancelled || isEndingRef.current) return;

        startCall({
          callId: callResponse.call.id,
          role: "caller",
          peer: {
            id: targetId,
            name: name || "SkillBridge Peer",
            avatarUrl: avatar || null,
          },
          type: type as "audio" | "video",
          provider: "webrtc",
          providerConfig: {},
        });

        // Initialize local media and pure WebRTC peer connection
        const stream = await initLocalMedia(type as "audio" | "video");
        await setupPeerConnection(stream);
      } catch (err: any) {
        if (!isCancelled && !isEndingRef.current) {
          console.error("Failed to initiate outgoing call:", err);
          setCallStatus("failed");
        }
      }
    }

    // Only initialise media once the call state is known
    const shouldJoinExistingCall = Boolean(effectiveCallId && activeCall && activeCall.status !== "ringing");
    const shouldStartOutgoingCall =
      !effectiveCallId &&
      !isEndingRef.current &&
      !hasInitiatedRef.current &&
      (!activeCall || (targetId && activeCall.peer.id !== targetId));

    if (shouldJoinExistingCall || shouldStartOutgoingCall) {
      void startOutgoingCall();
    }

    return () => {
      isCancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId, name, avatar, type, activeCall?.status, effectiveCallId]);

  // Auto-accept call when opened directly from notification "Accept" action
  useEffect(() => {
    if (
      autoAcceptParam === "true" &&
      activeCall?.role === "callee" &&
      activeCall?.status === "ringing" &&
      !isEndingRef.current
    ) {
      void handleIncomingAccept();
    }
  }, [autoAcceptParam, activeCall?.status, activeCall?.role]);

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

  const handleEndCall = async () => {
    if (isEndingRef.current) return;
    isEndingRef.current = true;
    triggerHaptic();
    setMinimized(false);
    await endCall("hangup");
    terminateActiveMediaSession();
    await callSounds.stopAll().catch(() => {});
    router.back();
  };

  const handleIncomingAccept = async () => {
    if (!activeCall || isEndingRef.current) return;
    triggerHaptic();
    try {
      setCallStatus("connecting");
      await acceptCallApi(activeCall.callId);
      const socket = getSocket();
      socket?.emit("call:accept", { callId: activeCall.callId });

      startCall({
        callId: activeCall.callId,
        role: activeCall.role,
        peer: activeCall.peer,
        type: activeCall.type,
        provider: "webrtc",
        providerConfig: {},
      });
      setCallStatus("connecting");

      const stream = await initLocalMedia(activeCall.type);
      await setupPeerConnection(stream);
      if (!hasSentReadyRef.current) {
        hasSentReadyRef.current = true;
        socket?.emit("call:ready", { callId: activeCall.callId });
      }
    } catch (err) {
      console.error("Failed to accept call:", err);
      setCallStatus("failed");
    }
  };

  const handleIncomingDecline = async () => {
    if (isEndingRef.current || !activeCall) return;
    isEndingRef.current = true;
    triggerHaptic();
    try {
      await rejectCallApi(activeCall.callId, "declined");
      const socket = getSocket();
      socket?.emit("call:reject", { callId: activeCall.callId, reason: "declined" });
    } catch {}
    await endCall("declined");
    terminateActiveMediaSession();
    await callSounds.stopAll().catch(() => {});
    router.back();
  };

  const isConnected = activeCall?.status === "connected";
  const isVideo = activeCall?.type === "video";
  const isLiveKit =
    activeCall?.provider === "livekit" &&
    Boolean(activeCall?.providerConfig?.token && activeCall?.providerConfig?.url);

  const handleLiveKitFailover = async (err: any) => {
    console.warn("LiveKit call connection failed, failing over to WebRTC P2P:", err);
    if (!activeCall) return;
    try {
      startCall({
        ...activeCall,
        provider: "webrtc",
      });
      const stream = await initLocalMedia(activeCall.type);
      await setupPeerConnection(stream);
      const socket = getSocket();
      if (!hasSentReadyRef.current) {
        hasSentReadyRef.current = true;
        socket?.emit("call:ready", { callId: activeCall.callId });
      }
    } catch (fallbackErr) {
      console.error("WebRTC fallback setup error:", fallbackErr);
    }
  };

  return (
    <Pressable
      style={styles.container}
      onPress={() => {
        if (isConnected && isVideo) {
          setControlsVisible((prev) => !prev);
        }
      }}
    >
      {/* If LiveKit call, render LiveKitCallBridge */}
      {isLiveKit ? (
        <LiveKitCallBridge
          url={activeCall!.providerConfig!.url || ""}
          token={activeCall!.providerConfig!.token || ""}
          type={activeCall!.type}
          isMuted={activeCall!.isMuted}
          isVideoEnabled={activeCall!.isVideoEnabled}
          isFrontCamera={activeCall!.isFrontCamera}
          peerName={activeCall!.peer.name || name || "SkillBridge Peer"}
          peerAvatar={activeCall!.peer.avatarUrl || avatar}
          onConnected={() => {
            setCallStatus("connected");
          }}
          onDisconnected={handleEndCall}
          onError={handleLiveKitFailover}
        />
      ) : (
        <>
          {/* Remote Video Stream if available */}
          {isConnected && isVideo && remoteStream ? (
            <VideoView
              stream={remoteStream}
              style={StyleSheet.absoluteFill}
              objectFit="cover"
            />
          ) : null}

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
                <Text style={styles.presenceText}>{isPeerOnline ? "Active" : "Offline"}</Text>
              </View>

              <Text style={styles.callStatus}>
                {activeCall?.status === "initiating"
                  ? "Calling…"
                  : activeCall?.status === "ringing"
                  ? "Ringing…"
                  : activeCall?.status === "connecting"
                  ? "Connecting…"
                  : activeCall?.status === "connected"
                  ? formatDuration(activeCall.durationSeconds)
                  : activeCall?.status === "reconnecting"
                  ? "Reconnecting…"
                  : activeCall?.status === "ended"
                  ? "Call Ended"
                  : activeCall?.status === "declined"
                  ? "Call Declined"
                  : activeCall?.status === "busy"
                  ? "Busy"
                  : errorMessage || "Calling…"}
              </Text>
            </View>
          )}

          {/* Local PIP Video preview if connected with video */}
          {isConnected && isVideo && localStream ? (
            <View style={[styles.pipContainer, { top: Math.max(insets.top, 16) + 60 }]}>
              <VideoView
                stream={localStream}
                style={styles.pipVideo}
                objectFit="cover"
                mirror={activeCall?.isFrontCamera}
                isMuted
              />
            </View>
          ) : null}

          {/* Universal Remote Audio Player (Works for both Web and Native VoIP) */}
          {isConnected && remoteStream ? (
            <RemoteAudio stream={remoteStream} isSpeakerOn={activeCall?.isSpeakerOn} />
          ) : null}
        </>
      )}

      {/* Top Header Bar */}
      {controlsVisible && (
        <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 16) }]}>
          <Pressable onPress={handleMinimize} hitSlop={12} style={styles.backButton}>
            <MaterialCommunityIcons name="chevron-down" size={28} color="#FFFFFF" />
          </Pressable>

          <View style={styles.topBadges}>
            <View style={styles.encryptionBadge}>
              <MaterialCommunityIcons name="shield-check" size={13} color="#10B981" />
              <Text style={styles.encryptionText}>
                {isConnected ? formatDuration(activeCall?.durationSeconds || 0) : "Live"}
              </Text>
            </View>
            {isConnected ? <ConnectionQuality metrics={activeCall?.metrics} /> : null}
          </View>
        </View>
      )}

      {/* Missed / ended call notice (cold start from stale notification) */}
      {coldStartStatus === "missed" && (
        <View style={styles.missedCallOverlay}>
          <MaterialCommunityIcons name="phone-hangup" size={44} color="#EF4444" />
          <Text style={styles.missedCallTitle}>Call Ended</Text>
        </View>
      )}

      {/* Call Controls Bar or Incoming Ringing Actions */}
      {controlsVisible && (
        <View style={[styles.bottomDock, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          {activeCall?.role === "callee" && activeCall?.status === "ringing" ? (
            <View style={styles.incomingActionsRow}>
              <View style={styles.incomingActionWrapper}>
                <Pressable
                  onPress={handleIncomingDecline}
                  style={[styles.incomingActionBtn, styles.incomingDeclineBtn]}
                  accessibilityLabel="Decline Call"
                >
                  <MaterialCommunityIcons name="phone-hangup" size={32} color="#FFFFFF" />
                </Pressable>
                <Text style={styles.incomingActionText}>Decline</Text>
              </View>

              <View style={styles.incomingActionWrapper}>
                <Pressable
                  onPress={handleIncomingAccept}
                  style={[styles.incomingActionBtn, styles.incomingAcceptBtn]}
                  accessibilityLabel="Accept Call"
                >
                  <MaterialCommunityIcons name="phone" size={32} color="#FFFFFF" />
                </Pressable>
                <Text style={styles.incomingActionText}>Accept</Text>
              </View>
            </View>
          ) : (
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
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#080E1A",
    justifyContent: "center",
    alignItems: "center",
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
    zIndex: 40,
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
    right: 16,
    width: 104,
    height: 156,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#38BDF8",
    zIndex: 35,
    backgroundColor: "#000000",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  pipVideo: {
    width: "100%",
    height: "100%",
  },
  bottomDock: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 40,
  },
  incomingActionsRow: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    alignItems: "center",
    width: "100%",
    paddingHorizontal: 36,
    paddingVertical: 12,
  },
  incomingActionWrapper: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  incomingActionBtn: {
    alignItems: "center",
    justifyContent: "center",
    width: 68,
    height: 68,
    borderRadius: 34,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  incomingDeclineBtn: {
    backgroundColor: "#EF4444",
  },
  incomingAcceptBtn: {
    backgroundColor: "#10B981",
  },
  incomingActionText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
});
