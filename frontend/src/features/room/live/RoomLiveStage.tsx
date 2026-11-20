import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Dimensions,
  Animated,
  Easing,
  Modal,
  ScrollView,
  Platform,
  Alert,
  TextInput,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { VideoView } from "@/features/calls/components/VideoView";
import { RemoteAudio } from "@/features/calls/components/RemoteAudio";
import { useRoomWebRTC, RoomRemotePeer, FloatingReaction } from "./useRoomWebRTC";
import { triggerHaptic } from "@/components/ui";
import { api } from "@/lib/api";
import { RoomSessionAttendanceModal } from "../attendance/RoomSessionAttendanceModal";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Animated audio spectrum equalizer bars
const AudioEqualizerBars: React.FC<{ isSpeaking: boolean }> = ({ isSpeaking }) => {
  const bar1 = useRef(new Animated.Value(4)).current;
  const bar2 = useRef(new Animated.Value(8)).current;
  const bar3 = useRef(new Animated.Value(12)).current;
  const bar4 = useRef(new Animated.Value(6)).current;

  useEffect(() => {
    let anim: any = null;
    if (isSpeaking) {
      const createLoop = (val: Animated.Value, minH: number, maxH: number, duration: number) => {
        return Animated.loop(
          Animated.sequence([
            Animated.timing(val, { toValue: maxH, duration, useNativeDriver: false }),
            Animated.timing(val, { toValue: minH, duration, useNativeDriver: false }),
          ]),
        );
      };
      anim = Animated.parallel([
        createLoop(bar1, 3, 14, 250),
        createLoop(bar2, 4, 18, 320),
        createLoop(bar3, 3, 16, 210),
        createLoop(bar4, 2, 12, 290),
      ]);
      anim.start();
    } else {
      bar1.setValue(3);
      bar2.setValue(3);
      bar3.setValue(3);
      bar4.setValue(3);
    }
    return () => anim?.stop();
  }, [isSpeaking, bar1, bar2, bar3, bar4]);

  return (
    <View style={styles.equalizerContainer}>
      <Animated.View style={[styles.equalizerBar, { height: bar1 }]} />
      <Animated.View style={[styles.equalizerBar, { height: bar2 }]} />
      <Animated.View style={[styles.equalizerBar, { height: bar3 }]} />
      <Animated.View style={[styles.equalizerBar, { height: bar4 }]} />
    </View>
  );
};

export interface RoomLiveStageProps {
  roomId: string;
  roomTitle: string;
  initialMedia?: "audio" | "video";
  currentUserId: string;
  currentUserName: string;
  currentUserAvatar?: string | null;
  currentUserRole?: string;
  isHost?: boolean;
  onLeave?: () => void;
  onOpenChat?: () => void;
  unreadChatCount?: number;
  enginePreference?: "webrtc" | "livekit";
}

// Floating emoji particle component
const FloatingEmojiItem: React.FC<{ reaction: FloatingReaction }> = ({ reaction }) => {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -280,
        duration: 2800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1.35,
        duration: 700,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(1800),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [translateY, opacity, scale]);

  const leftPosition = reaction.xOffset * (SCREEN_WIDTH - 60);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.floatingEmojiContainer,
        {
          left: leftPosition,
          opacity,
          transform: [{ translateY }, { scale }],
        },
      ]}
    >
      <Text style={styles.floatingEmojiText}>{reaction.emoji}</Text>
      <Text style={styles.floatingSenderText}>{reaction.senderName}</Text>
    </Animated.View>
  );
};

export const RoomLiveStage: React.FC<RoomLiveStageProps> = ({
  roomId,
  roomTitle,
  initialMedia = "video",
  currentUserId,
  currentUserName,
  currentUserAvatar,
  currentUserRole = "member",
  isHost = false,
  onLeave,
  onOpenChat,
  unreadChatCount = 0,
}) => {
  const {
    connectionStatus,
    error,
    localStream,
    remotePeers,
    isMuted,
    isSpeakerOn,
    isLocalSpeaking,
    isVideoOn,
    isFrontCamera,
    isHandRaised,
    activeSpeakerId,
    reactions,
    mediaSync,
    participantCount,
    networkQuality,
    latencyMs,
    currentPoll,
    sharedResources,
    whiteboardStrokes,
    activeBroadcast,
    whispers,
    breakoutInfo,
    isLowDataMode,
    isScreenSharing,
    virtualBackground,
    studyMinutes,
    xpEarned,
    bookmarkedMoments,
    audioFilterMode,
    pinnedPeerId,
    handRaiseQueue,
    setVirtualBackground,
    setAudioFilterMode,
    setPinnedPeerId,
    leave,
    toggleMicrophone,
    toggleSpeaker,
    toggleCamera,
    toggleCameraFacing,
    toggleRaiseHand,
    sendReaction,
    sendMediaSync,
    moderatePeer,
    createPoll,
    votePoll,
    closePoll,
    shareResource,
    broadcastStroke,
    clearWhiteboard,
    sendBroadcast,
    sendWhisper,
    startBreakout,
    endBreakout,
    toggleLowDataMode,
    toggleScreenShare,
    bookmarkMoment,
    inviteToSpeak,
  } = useRoomWebRTC({
    roomId,
    initialMedia,
    userName: currentUserName,
    userAvatar: currentUserAvatar,
    userRole: currentUserRole,
    autoConnect: true,
  });

  const [layoutMode, setLayoutMode] = useState<"grid" | "cinema" | "lounge">("grid");
  const [spotlightUserId, setSpotlightUserId] = useState<string | null>(null);
  const [reactionPickerVisible, setReactionPickerVisible] = useState(false);
  const [coStudyModalVisible, setCoStudyModalVisible] = useState(false);
  const [mediaUrlInput, setMediaUrlInput] = useState("");
  const [handRaiseModalVisible, setHandRaiseModalVisible] = useState(false);
  const [pomodoroSeconds, setPomodoroSeconds] = useState(25 * 60);
  const [pomodoroActive, setPomodoroActive] = useState(false);
  const [selectedPeerMenu, setSelectedPeerMenu] = useState<RoomRemotePeer | null>(null);

  // 20 Core Feature States
  const [attendanceModalVisible, setAttendanceModalVisible] = useState(false);
  const [toolsDrawerVisible, setToolsDrawerVisible] = useState(false);
  const [whiteboardModalVisible, setWhiteboardModalVisible] = useState(false);
  const [pollModalVisible, setPollModalVisible] = useState(false);
  const [resourcesModalVisible, setResourcesModalVisible] = useState(false);
  const [bookmarksModalVisible, setBookmarksModalVisible] = useState(false);
  const [breakoutModalVisible, setBreakoutModalVisible] = useState(false);
  const [notesModalVisible, setNotesModalVisible] = useState(false);
  const [whisperModalVisible, setWhisperModalVisible] = useState(false);
  const [whisperTarget, setWhisperTarget] = useState<RoomRemotePeer | null>(null);
  const [whisperInput, setWhisperInput] = useState("");
  const [broadcastModalVisible, setBroadcastModalVisible] = useState(false);
  const [broadcastInput, setBroadcastInput] = useState("");
  const [networkStatsVisible, setNetworkStatsVisible] = useState(false);
  const [soundboardVisible, setSoundboardVisible] = useState(false);
  const [sharedNotes, setSharedNotes] = useState("# Room Study Agenda\n- Welcome to live stage\n- Co-Study session in progress");
  const [newPollQuestion, setNewPollQuestion] = useState("");
  const [newPollOpt1, setNewPollOpt1] = useState("");
  const [newPollOpt2, setNewPollOpt2] = useState("");
  const [newPollOpt3, setNewPollOpt3] = useState("");
  const [newResTitle, setNewResTitle] = useState("");
  const [newResUrl, setNewResUrl] = useState("");
  const [newResType, setNewResType] = useState<"link" | "doc" | "pdf" | "code">("link");
  const [newBookmarkText, setNewBookmarkText] = useState("");
  const [wbColor, setWbColor] = useState("#38BDF8");
  const [wbTool, setWbTool] = useState<"pen" | "eraser">("pen");

  // Call duration counter
  const [durationSeconds, setDurationSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setDurationSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Periodic attendance tracking and heartbeat while in live session
  useEffect(() => {
    if (!roomId) return;
    const cleanRoomId = roomId.replace(/^qa-stage-/, "");
    // Record join event
    api(`/rooms/${cleanRoomId}/attendance/record`, {
      method: "POST",
      body: JSON.stringify({ sessionId: cleanRoomId, action: "join" }),
    }).catch(() => {});

    const interval = setInterval(() => {
      api(`/rooms/${cleanRoomId}/attendance/heartbeat`, {
        method: "POST",
        body: JSON.stringify({ sessionId: cleanRoomId, durationSeconds }),
      }).catch(() => {});
    }, 30_000);

    return () => {
      clearInterval(interval);
      api(`/rooms/${cleanRoomId}/attendance/record`, {
        method: "POST",
        body: JSON.stringify({ sessionId: cleanRoomId, action: "leave", durationSeconds }),
      }).catch(() => {});
    };
  }, [roomId, durationSeconds]);

  // Pomodoro Focus Timer countdown
  useEffect(() => {
    let interval: any = null;
    if (pomodoroActive && pomodoroSeconds > 0) {
      interval = setInterval(() => {
        setPomodoroSeconds((sec) => sec - 1);
      }, 1000);
    } else if (pomodoroSeconds === 0 && pomodoroActive) {
      setPomodoroActive(false);
      Alert.alert("Pomodoro Complete! 🍅", "Great focus session! Time to take a 5-minute break.");
      triggerHaptic();
    }
    return () => clearInterval(interval);
  }, [pomodoroActive, pomodoroSeconds]);

  // Speaking pulse animation for avatar rings
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.14, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 900, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulseAnim]);

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleExit = () => {
    triggerHaptic();
    leave();
    onLeave?.();
  };

  const handRaisedPeers = useMemo(() => {
    return remotePeers.filter((p) => p.isHandRaised);
  }, [remotePeers]);

  const [autoSwitchSpeaker, setAutoSwitchSpeaker] = useState(true);

  // Auto-switch spotlight to active speaker when active speaker changes
  useEffect(() => {
    if (!autoSwitchSpeaker) return;
    if (pinnedPeerId) return; // User manually pinned someone, preserve manual pin
    if (activeSpeakerId && activeSpeakerId !== "local") {
      setSpotlightUserId(activeSpeakerId);
    }
  }, [activeSpeakerId, pinnedPeerId, autoSwitchSpeaker]);

  const spotlightPeer = useMemo(() => {
    if (pinnedPeerId) {
      const pinned = remotePeers.find((p) => p.userId === pinnedPeerId);
      if (pinned) return pinned;
    }
    if (autoSwitchSpeaker && activeSpeakerId && activeSpeakerId !== "local") {
      const active = remotePeers.find((p) => p.userId === activeSpeakerId);
      if (active) return active;
    }
    if (spotlightUserId) {
      const spot = remotePeers.find((p) => p.userId === spotlightUserId);
      if (spot) return spot;
    }
    const speakingPeer = remotePeers.find((p) => p.isSpeaking);
    if (speakingPeer) return speakingPeer;

    return remotePeers[0] || null;
  }, [pinnedPeerId, autoSwitchSpeaker, activeSpeakerId, spotlightUserId, remotePeers]);

  const availableReactions = ["🔥", "👏", "💡", "❤️", "🚀", "🎓", "🎉", "💯"];

  return (
    <View style={styles.container}>
      {/* ── 1. Top Bar / Room HUD ────────────────────────────────────────── */}
      <View style={styles.topHud}>
        <View style={styles.hudLeft}>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
          <View style={styles.titleColumn}>
            <Text style={styles.roomTitleText} numberOfLines={1}>
              {roomTitle || "Live Study Space"}
            </Text>
            <View style={styles.metaRow}>
              <Text style={styles.durationText}>{formatTimer(durationSeconds)}</Text>
              <Text style={styles.metaSeparator}>•</Text>
              <MaterialCommunityIcons name="account-group" size={13} color="#94A3B8" />
              <Text style={styles.participantCountText}>{participantCount}</Text>
              <Text style={styles.metaSeparator}>•</Text>
              {/* Network Latency Radar Pill */}
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  setNetworkStatsVisible(true);
                }}
                style={styles.networkPill}
              >
                <MaterialCommunityIcons
                  name={networkQuality === "excellent" ? "wifi-check" : networkQuality === "good" ? "wifi" : "wifi-alert"}
                  size={12}
                  color={networkQuality === "excellent" ? "#10B981" : networkQuality === "good" ? "#F59E0B" : "#EF4444"}
                />
                <Text
                  style={[
                    styles.networkPillText,
                    { color: networkQuality === "excellent" ? "#10B981" : networkQuality === "good" ? "#F59E0B" : "#EF4444" },
                  ]}
                >
                  {latencyMs}ms
                </Text>
              </Pressable>
              {/* Focus Streak & Study XP Pill */}
              <View style={styles.streakPill}>
                <MaterialCommunityIcons name="fire" size={13} color="#F97316" />
                <Text style={styles.streakPillText}>{studyMinutes}m</Text>
                {xpEarned > 0 && <Text style={styles.xpBadgeText}>+{xpEarned}XP</Text>}
              </View>
            </View>
          </View>
        </View>

        <View style={styles.hudRight}>
          {/* Low Data Bandwidth Saver Button */}
          <Pressable
            onPress={toggleLowDataMode}
            style={[styles.iconBtnRound, isLowDataMode && styles.iconBtnDataSaverActive]}
            accessibilityLabel="Low Data Mode"
          >
            <MaterialCommunityIcons
              name="speedometer-slow"
              size={17}
              color={isLowDataMode ? "#38BDF8" : "#94A3B8"}
            />
          </Pressable>

          {/* Pomodoro Study Timer Pill */}
          <Pressable
            onPress={() => {
              triggerHaptic();
              setPomodoroActive((p) => !p);
            }}
            style={[styles.pomodoroPill, pomodoroActive && styles.pomodoroPillActive]}
          >
            <MaterialCommunityIcons
              name="timer-outline"
              size={15}
              color={pomodoroActive ? "#F43F5E" : "#94A3B8"}
            />
            <Text style={[styles.pomodoroText, pomodoroActive && styles.pomodoroTextActive]}>
              {formatTimer(pomodoroSeconds)}
            </Text>
          </Pressable>

          {/* Auto-Switch Speaker Spotlight Toggle */}
          <Pressable
            onPress={() => {
              triggerHaptic();
              setAutoSwitchSpeaker((prev) => !prev);
            }}
            style={[styles.iconBtnRound, autoSwitchSpeaker && { backgroundColor: "rgba(16, 185, 129, 0.25)" }]}
            accessibilityLabel="Toggle Auto-Switch Speaker"
          >
            <MaterialCommunityIcons
              name={autoSwitchSpeaker ? "account-voice" : "account-voice-off"}
              size={17}
              color={autoSwitchSpeaker ? "#10B981" : "#94A3B8"}
            />
          </Pressable>

          {/* Layout Mode Switcher */}
          <Pressable
            onPress={() => {
              triggerHaptic();
              setLayoutMode((prev) => (prev === "grid" ? "cinema" : prev === "cinema" ? "lounge" : "grid"));
            }}
            style={styles.iconBtnRound}
          >
            <MaterialCommunityIcons
              name={
                layoutMode === "grid"
                  ? "view-grid-outline"
                  : layoutMode === "cinema"
                  ? "monitor-screenshot"
                  : "account-voice"
              }
              size={18}
              color="#F8FAFC"
            />
          </Pressable>

          {/* Co-Study / Media Sync Toggle */}
          <Pressable
            onPress={() => {
              triggerHaptic();
              setCoStudyModalVisible(true);
            }}
            style={[styles.iconBtnRound, mediaSync.mediaUrl && styles.iconBtnActive]}
          >
            <MaterialCommunityIcons
              name="television-play"
              size={18}
              color={mediaSync.mediaUrl ? "#38BDF8" : "#F8FAFC"}
            />
          </Pressable>

          {/* Live Session Attendance */}
          <Pressable
            onPress={() => {
              triggerHaptic();
              setAttendanceModalVisible(true);
            }}
            style={styles.iconBtnRound}
            accessibilityLabel="Live Attendance"
          >
            <MaterialCommunityIcons
              name="clipboard-check-outline"
              size={18}
              color="#10B981"
            />
          </Pressable>

          {/* Leave Button */}
          <Pressable onPress={handleExit} style={styles.leaveBtn}>
            <MaterialCommunityIcons name="phone-hangup" size={16} color="#FFFFFF" />
            <Text style={styles.leaveBtnText}>Leave</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Reconnecting Notice Banner ───────────────────────────────────── */}
      {connectionStatus === "reconnecting" && (
        <View style={styles.reconnectingBanner}>
          <MaterialCommunityIcons name="cloud-sync" size={16} color="#F59E0B" />
          <Text style={styles.reconnectingBannerText}>Optimizing network connection... (auto-reconnecting)</Text>
        </View>
      )}

      {/* ── Host Urgent Broadcast Announcement ───────────────────────────── */}
      {activeBroadcast && (
        <View style={styles.broadcastBanner}>
          <MaterialCommunityIcons name="bullhorn-outline" size={18} color="#F59E0B" />
          <View style={{ flex: 1 }}>
            <Text style={styles.broadcastSender}>{activeBroadcast.senderName} (Announcement)</Text>
            <Text style={styles.broadcastText}>{activeBroadcast.message}</Text>
          </View>
        </View>
      )}

      {/* ── Active Breakout Session Banner ────────────────────────────────── */}
      {breakoutInfo && (
        <View style={styles.breakoutBanner}>
          <MaterialCommunityIcons name="account-supervisor-circle" size={18} color="#A855F7" />
          <Text style={styles.breakoutBannerText} numberOfLines={1}>
            Breakout Session Active ({breakoutInfo.durationMinutes}m)
          </Text>
          {isHost && (
            <Pressable onPress={endBreakout} style={styles.endBreakoutBtn}>
              <Text style={styles.endBreakoutBtnText}>Regroup All</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* ── Hand Raise Alert Banner for Host ─────────────────────────────── */}
      {handRaisedPeers.length > 0 && (
        <Pressable
          onPress={() => {
            triggerHaptic();
            setHandRaiseModalVisible(true);
          }}
          style={styles.handRaiseAlertBanner}
        >
          <MaterialCommunityIcons name="hand-back-right" size={16} color="#F59E0B" />
          <Text style={styles.handRaiseAlertText}>
            {handRaisedPeers.length} {handRaisedPeers.length === 1 ? "member has" : "members have"} hands raised
          </Text>
          <Text style={styles.handRaiseAlertAction}>View Queue →</Text>
        </Pressable>
      )}

      {/* ── 2. Stage Video & Audio Arena ─────────────────────────────────── */}
      <View style={styles.arenaContainer}>
        {/* Real-time WebRTC Audio Playback for all Remote Peers */}
        {remotePeers.map((peer) =>
          peer.stream ? (
            <RemoteAudio
              key={`remote-audio-${peer.socketId}`}
              stream={peer.stream}
              isSpeakerOn={isSpeakerOn}
            />
          ) : null
        )}

        {/* Cinema / Spotlight View */}
        {layoutMode === "cinema" && (
          <View style={styles.cinemaContainer}>
            <View style={styles.cinemaMainTile}>
              {spotlightPeer && spotlightPeer.stream && spotlightPeer.isVideoEnabled ? (
                <VideoView stream={spotlightPeer.stream} style={StyleSheet.absoluteFill} objectFit="cover" />
              ) : (
                <View style={styles.avatarTilePlaceholder}>
                  <Animated.View
                    style={[
                      styles.avatarPulseRing,
                      (spotlightPeer ? spotlightPeer.isSpeaking : isLocalSpeaking) && {
                        transform: [{ scale: pulseAnim }],
                        borderColor: spotlightPeer ? "#38BDF8" : "#10B981",
                        borderWidth: 3,
                      },
                    ]}
                  >
                    {(spotlightPeer?.avatarUrl || currentUserAvatar) ? (
                      <Image source={{ uri: spotlightPeer?.avatarUrl || currentUserAvatar! }} style={styles.largeAvatar} />
                    ) : (
                      <View style={[styles.largeAvatar, styles.placeholderBg]}>
                        <Text style={styles.largeAvatarText}>
                          {(spotlightPeer?.name || currentUserName || "M").charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </Animated.View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 }}>
                    <Text style={styles.spotlightName}>
                      {spotlightPeer?.name || `${currentUserName} (You)`}{" "}
                      {(spotlightPeer ? spotlightPeer.isSpeaking : isLocalSpeaking) ? "🎙️ (Speaking)" : ""}
                    </Text>
                    {(spotlightPeer ? spotlightPeer.isSpeaking : isLocalSpeaking) && (
                      <AudioEqualizerBars isSpeaking={true} />
                    )}
                  </View>
                </View>
              )}
            </View>

            {/* Bottom Participant Carousel */}
            <ScrollView horizontal style={styles.cinemaCarousel} showsHorizontalScrollIndicator={false}>
              {/* Local Participant Bubble */}
              <View style={styles.carouselBubble}>
                {localStream && isVideoOn ? (
                  <VideoView stream={localStream} style={StyleSheet.absoluteFill} mirror={isFrontCamera} />
                ) : (
                  <View style={styles.carouselAvatarBg}>
                    <Text style={styles.carouselAvatarInitial}>{currentUserName.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.bubbleNameTag}>
                  <Text style={styles.bubbleNameText}>You</Text>
                </View>
              </View>

              {/* Remote Participants */}
              {remotePeers.map((peer) => (
                <Pressable
                  key={peer.socketId}
                  onPress={() => {
                    triggerHaptic();
                    setSpotlightUserId(peer.userId);
                  }}
                  style={styles.carouselBubble}
                >
                  {peer.stream && peer.isVideoEnabled ? (
                    <VideoView stream={peer.stream} style={StyleSheet.absoluteFill} />
                  ) : (
                    <View style={styles.carouselAvatarBg}>
                      <Text style={styles.carouselAvatarInitial}>{peer.name.charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={styles.bubbleNameTag}>
                    <Text style={styles.bubbleNameText} numberOfLines={1}>
                      {peer.name}
                    </Text>
                  </View>
                  {peer.isHandRaised && (
                    <View style={styles.bubbleHandBadge}>
                      <Text style={{ fontSize: 10 }}>✋</Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Lounge / Audio Space View */}
        {layoutMode === "lounge" && (
          <ScrollView contentContainerStyle={styles.loungeScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.loungeHeader}>
              <MaterialCommunityIcons name="podcast" size={24} color="#38BDF8" />
              <Text style={styles.loungeTitle}>Discussion Circle</Text>
              <Text style={styles.loungeSub}>Microphones open for active debate and collaborative questions</Text>
            </View>

            <View style={styles.loungeGrid}>
              {/* Local User Card */}
              <View style={styles.loungeCard}>
                <Animated.View
                  style={[
                    styles.loungeAvatarContainer,
                    isLocalSpeaking && { transform: [{ scale: pulseAnim }], borderColor: "#10B981", borderWidth: 3 },
                  ]}
                >
                  {currentUserAvatar ? (
                    <Image source={{ uri: currentUserAvatar }} style={styles.loungeAvatar} />
                  ) : (
                    <View style={[styles.loungeAvatar, styles.placeholderBg]}>
                      <Text style={styles.loungeAvatarInitial}>{currentUserName.charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={[styles.micMiniBadge, { backgroundColor: isMuted ? "#EF4444" : "#10B981" }]}>
                    <MaterialCommunityIcons
                      name={isMuted ? "microphone-off" : "microphone"}
                      size={12}
                      color="#FFFFFF"
                    />
                  </View>
                </Animated.View>
                <View style={{ alignItems: "center", gap: 2 }}>
                  <Text style={styles.loungeNameText}>
                    You {isLocalSpeaking ? "(Speaking)" : isMuted ? "(Muted)" : "(Host)"}
                  </Text>
                  {isLocalSpeaking && <AudioEqualizerBars isSpeaking={true} />}
                </View>
              </View>

              {/* Remote Users */}
              {remotePeers.map((peer) => (
                <Pressable
                  key={peer.socketId}
                  onLongPress={() => {
                    if (isHost) setSelectedPeerMenu(peer);
                  }}
                  style={styles.loungeCard}
                >
                  <Animated.View
                    style={[
                      styles.loungeAvatarContainer,
                      peer.isSpeaking && { transform: [{ scale: pulseAnim }], borderColor: "#38BDF8", borderWidth: 3 },
                    ]}
                  >
                    {peer.avatarUrl ? (
                      <Image source={{ uri: peer.avatarUrl }} style={styles.loungeAvatar} />
                    ) : (
                      <View style={[styles.loungeAvatar, styles.placeholderBg]}>
                        <Text style={styles.loungeAvatarInitial}>{peer.name.charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                    <View style={[styles.micMiniBadge, { backgroundColor: peer.isMuted ? "#EF4444" : "#10B981" }]}>
                      <MaterialCommunityIcons
                        name={peer.isMuted ? "microphone-off" : "microphone"}
                        size={12}
                        color="#FFFFFF"
                      />
                    </View>
                  </Animated.View>
                  <View style={{ alignItems: "center", gap: 2 }}>
                    <Text style={styles.loungeNameText} numberOfLines={1}>
                      {peer.name} {peer.isSpeaking ? "(Speaking)" : ""}
                    </Text>
                    {peer.isSpeaking && <AudioEqualizerBars isSpeaking={true} />}
                  </View>
                  {peer.isHandRaised && <Text style={styles.loungeHandText}>✋ Hand Raised</Text>}
                </Pressable>
              ))}
            </View>
          </ScrollView>
        )}

        {/* Responsive Grid View (Default) */}
        {layoutMode === "grid" && (
          <View style={styles.gridContainer}>
            {/* Local Video / Avatar Tile */}
            <View
              style={[
                styles.gridTile,
                remotePeers.length === 0 && styles.gridTileSingle,
                remotePeers.length === 1 && styles.gridTileHalf,
                remotePeers.length >= 2 && styles.gridTileQuarter,
                isLocalSpeaking && styles.gridTileSpeaking,
              ]}
            >
              {localStream && isVideoOn ? (
                <VideoView
                  stream={localStream}
                  style={StyleSheet.absoluteFill}
                  mirror={isFrontCamera}
                  objectFit="cover"
                />
              ) : (
                <View style={styles.avatarTilePlaceholder}>
                  <Animated.View
                    style={[
                      styles.avatarPulseRing,
                      isLocalSpeaking && { transform: [{ scale: pulseAnim }], borderColor: "#10B981", borderWidth: 2 },
                    ]}
                  >
                    {currentUserAvatar ? (
                      <Image source={{ uri: currentUserAvatar }} style={styles.gridAvatar} />
                    ) : (
                      <View style={[styles.gridAvatar, styles.placeholderBg]}>
                        <Text style={styles.gridAvatarInitial}>{currentUserName.charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                  </Animated.View>
                  <Text style={styles.gridParticipantName}>
                    You ({currentUserRole}) {isLocalSpeaking ? "🎙️" : ""}
                  </Text>
                </View>
              )}

              {/* Status Pills */}
              <View style={styles.tileFooter}>
                <View style={styles.tileNameTag}>
                  <Text style={styles.tileNameTagText}>You {isLocalSpeaking ? "(Speaking)" : ""}</Text>
                  {isLocalSpeaking && <AudioEqualizerBars isSpeaking={true} />}
                </View>
                <View style={[styles.tileMicPill, { backgroundColor: isMuted ? "#EF4444" : "rgba(16, 185, 129, 0.85)" }]}>
                  <MaterialCommunityIcons name={isMuted ? "microphone-off" : "microphone"} size={12} color="#FFF" />
                </View>
              </View>
              {isHandRaised && (
                <View style={styles.tileHandBadge}>
                  <Text style={{ fontSize: 13 }}>✋ Hand Raised</Text>
                </View>
              )}
            </View>

            {/* Remote Peers Tiles */}
            {remotePeers.map((peer) => (
              <Pressable
                key={peer.socketId}
                onLongPress={() => {
                  if (isHost) setSelectedPeerMenu(peer);
                }}
                style={[
                  styles.gridTile,
                  remotePeers.length === 1 && styles.gridTileHalf,
                  remotePeers.length >= 2 && styles.gridTileQuarter,
                  peer.isSpeaking && styles.gridTileSpeaking,
                ]}
              >
                {peer.stream && peer.isVideoEnabled ? (
                  <VideoView stream={peer.stream} style={StyleSheet.absoluteFill} objectFit="cover" />
                ) : (
                  <View style={styles.avatarTilePlaceholder}>
                    <Animated.View
                      style={[
                        styles.avatarPulseRing,
                        peer.isSpeaking && { transform: [{ scale: pulseAnim }], borderColor: "#38BDF8", borderWidth: 2 },
                      ]}
                    >
                      {peer.avatarUrl ? (
                        <Image source={{ uri: peer.avatarUrl }} style={styles.gridAvatar} />
                      ) : (
                        <View style={[styles.gridAvatar, styles.placeholderBg]}>
                          <Text style={styles.gridAvatarInitial}>{peer.name.charAt(0).toUpperCase()}</Text>
                        </View>
                      )}
                    </Animated.View>
                    <Text style={styles.gridParticipantName}>
                      {peer.name} {peer.isSpeaking ? "🎙️" : ""}
                    </Text>
                  </View>
                )}

                {/* Status Pills */}
                <View style={styles.tileFooter}>
                  <View style={styles.tileNameTag}>
                    <Text style={styles.tileNameTagText} numberOfLines={1}>
                      {peer.name} {peer.isSpeaking ? "(Speaking)" : ""}
                    </Text>
                    {peer.isSpeaking && <AudioEqualizerBars isSpeaking={true} />}
                  </View>
                  <View
                    style={[
                      styles.tileMicPill,
                      { backgroundColor: peer.isMuted ? "#EF4444" : "rgba(16, 185, 129, 0.85)" },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={peer.isMuted ? "microphone-off" : "microphone"}
                      size={12}
                      color="#FFF"
                    />
                  </View>
                </View>
                {peer.isHandRaised && (
                  <View style={styles.tileHandBadge}>
                    <Text style={{ fontSize: 13 }}>✋ Hand Raised</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        )}

        {/* Floating Animated Reaction Particles */}
        {reactions.map((reaction) => (
          <FloatingEmojiItem key={reaction.id} reaction={reaction} />
        ))}
      </View>

      {/* ── 3. Bottom Glassmorphism Control Dock ─────────────────────────── */}
      <View style={styles.dockContainer}>
        {/* Mic Toggle Button */}
        <Pressable
          onPress={toggleMicrophone}
          style={[styles.dockBtn, isMuted ? styles.dockBtnMuted : styles.dockBtnActive]}
          accessibilityLabel="Toggle Microphone"
        >
          <MaterialCommunityIcons
            name={isMuted ? "microphone-off" : "microphone"}
            size={22}
            color={isMuted ? "#EF4444" : "#FFFFFF"}
          />
          <Text style={[styles.dockBtnLabel, isMuted && { color: "#EF4444" }]}>
            {isMuted ? "Unmute" : "Mute"}
          </Text>
        </Pressable>

        {/* Video Toggle Button */}
        <Pressable
          onPress={toggleCamera}
          style={[styles.dockBtn, !isVideoOn ? styles.dockBtnMuted : styles.dockBtnActive]}
          accessibilityLabel="Toggle Camera"
        >
          <MaterialCommunityIcons
            name={isVideoOn ? "video" : "video-off"}
            size={22}
            color={!isVideoOn ? "#EF4444" : "#FFFFFF"}
          />
          <Text style={[styles.dockBtnLabel, !isVideoOn && { color: "#EF4444" }]}>
            {isVideoOn ? "Stop Cam" : "Start Cam"}
          </Text>
        </Pressable>

        {/* Flip Camera Button */}
        {isVideoOn && (
          <Pressable onPress={toggleCameraFacing} style={styles.dockBtnSecondary}>
            <MaterialCommunityIcons name="camera-flip" size={20} color="#F8FAFC" />
            <Text style={styles.dockBtnLabel}>Flip</Text>
          </Pressable>
        )}

        {/* Speaker Output Toggle Button */}
        <Pressable
          onPress={() => {
            triggerHaptic();
            toggleSpeaker();
          }}
          style={[styles.dockBtnSecondary, !isSpeakerOn && { backgroundColor: "rgba(239, 68, 68, 0.2)" }]}
          accessibilityLabel="Toggle Speaker Output"
        >
          <MaterialCommunityIcons
            name={isSpeakerOn ? "volume-high" : "volume-medium"}
            size={20}
            color={isSpeakerOn ? "#38BDF8" : "#94A3B8"}
          />
          <Text style={[styles.dockBtnLabel, { color: isSpeakerOn ? "#38BDF8" : "#94A3B8" }]}>
            {isSpeakerOn ? "Speaker" : "Ear"}
          </Text>
        </Pressable>

        {/* Raise Hand Button */}
        <Pressable
          onPress={toggleRaiseHand}
          style={[styles.dockBtnSecondary, isHandRaised && styles.dockBtnHandActive]}
        >
          <MaterialCommunityIcons
            name="hand-back-right"
            size={20}
            color={isHandRaised ? "#F59E0B" : "#F8FAFC"}
          />
          <Text style={[styles.dockBtnLabel, isHandRaised && { color: "#F59E0B" }]}>
            {isHandRaised ? "Lower Hand" : "Raise Hand"}
          </Text>
        </Pressable>

        {/* Reaction Picker Button */}
        <Pressable
          onPress={() => {
            triggerHaptic();
            setReactionPickerVisible((v) => !v);
          }}
          style={styles.dockBtnSecondary}
        >
          <Text style={{ fontSize: 18 }}>✨</Text>
          <Text style={styles.dockBtnLabel}>React</Text>
        </Pressable>

        {/* Study Tools Hub Button */}
        <Pressable
          onPress={() => {
            triggerHaptic();
            setToolsDrawerVisible(true);
          }}
          style={[styles.dockBtnSecondary, styles.dockBtnTools]}
        >
          <MaterialCommunityIcons name="toolbox-outline" size={20} color="#38BDF8" />
          <Text style={[styles.dockBtnLabel, { color: "#38BDF8" }]}>Tools</Text>
        </Pressable>

        {/* Chat Drawer Button */}
        <Pressable onPress={onOpenChat} style={styles.dockBtnSecondary}>
          <View>
            <MaterialCommunityIcons name="chat-outline" size={20} color="#F8FAFC" />
            {unreadChatCount > 0 && (
              <View style={styles.chatBadge}>
                <Text style={styles.chatBadgeText}>{unreadChatCount}</Text>
              </View>
            )}
          </View>
          <Text style={styles.dockBtnLabel}>Chat</Text>
        </Pressable>
      </View>

      {/* ── Reaction Picker Modal ────────────────────────────────────────── */}
      <Modal
        visible={reactionPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReactionPickerVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setReactionPickerVisible(false)}>
          <View style={styles.reactionPickerBox}>
            <Text style={styles.reactionPickerTitle}>Live Reaction</Text>
            <View style={styles.reactionPickerRow}>
              {availableReactions.map((emoji) => (
                <Pressable
                  key={emoji}
                  onPress={() => {
                    sendReaction(emoji);
                    setReactionPickerVisible(false);
                  }}
                  style={styles.reactionBtn}
                >
                  <Text style={styles.reactionBtnEmoji}>{emoji}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* ── Co-Study Media Sync Modal ────────────────────────────────────── */}
      <Modal
        visible={coStudyModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCoStudyModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.coStudyModalBox}>
            <View style={styles.modalHeader}>
              <MaterialCommunityIcons name="television-play" size={22} color="#38BDF8" />
              <Text style={styles.modalTitle}>Co-Study Synchronized Video</Text>
              <Pressable onPress={() => setCoStudyModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#94A3B8" />
              </Pressable>
            </View>
            <Text style={styles.modalDescription}>
              Watch lecture clips, YouTube videos or study material together in synchronized real-time across all member devices.
            </Text>

            <View style={styles.mediaQuickActions}>
              <Pressable
                onPress={() => {
                  sendMediaSync("PLAY", 0, "https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4", "Educational Lecture Sample");
                  setCoStudyModalVisible(false);
                }}
                style={styles.sampleMediaBtn}
              >
                <MaterialCommunityIcons name="play-circle" size={18} color="#10B981" />
                <Text style={styles.sampleMediaBtnText}>Play Sample Lecture</Text>
              </Pressable>

              {mediaSync.mediaUrl && (
                <Pressable
                  onPress={() => {
                    sendMediaSync("PAUSE");
                    setCoStudyModalVisible(false);
                  }}
                  style={[styles.sampleMediaBtn, { backgroundColor: "#EF4444" }]}
                >
                  <MaterialCommunityIcons name="stop-circle" size={18} color="#FFFFFF" />
                  <Text style={[styles.sampleMediaBtnText, { color: "#FFFFFF" }]}>Stop Co-Watch</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Host Participant Moderation Modal ────────────────────────────── */}
      {selectedPeerMenu && (
        <Modal
          visible={Boolean(selectedPeerMenu)}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedPeerMenu(null)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setSelectedPeerMenu(null)}>
            <View style={styles.moderationBox}>
              <Text style={styles.moderationTitle}>Manage {selectedPeerMenu.name}</Text>
              <Pressable
                onPress={() => {
                  moderatePeer("mute", selectedPeerMenu.userId, selectedPeerMenu.socketId);
                  setSelectedPeerMenu(null);
                }}
                style={styles.moderationItem}
              >
                <MaterialCommunityIcons name="microphone-off" size={18} color="#EF4444" />
                <Text style={styles.moderationItemText}>Mute Participant</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setSpotlightUserId(selectedPeerMenu.userId);
                  setLayoutMode("cinema");
                  setSelectedPeerMenu(null);
                }}
                style={styles.moderationItem}
              >
                <MaterialCommunityIcons name="spotlight-beam" size={18} color="#38BDF8" />
                <Text style={styles.moderationItemText}>Spotlight Participant</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setWhisperTarget(selectedPeerMenu);
                  setWhisperModalVisible(true);
                  setSelectedPeerMenu(null);
                }}
                style={styles.moderationItem}
              >
                <MaterialCommunityIcons name="message-lock-outline" size={18} color="#A855F7" />
                <Text style={styles.moderationItemText}>Send Private Whisper</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setPinnedPeerId(pinnedPeerId === selectedPeerMenu.userId ? null : selectedPeerMenu.userId);
                  setSelectedPeerMenu(null);
                }}
                style={styles.moderationItem}
              >
                <MaterialCommunityIcons name="pin-outline" size={18} color="#F59E0B" />
                <Text style={styles.moderationItemText}>
                  {pinnedPeerId === selectedPeerMenu.userId ? "Unpin Participant" : "Pin to Spotlight"}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  moderatePeer("kick", selectedPeerMenu.userId, selectedPeerMenu.socketId);
                  setSelectedPeerMenu(null);
                }}
                style={[styles.moderationItem, { borderBottomWidth: 0 }]}
              >
                <MaterialCommunityIcons name="account-remove" size={18} color="#EF4444" />
                <Text style={[styles.moderationItemText, { color: "#EF4444" }]}>Remove from Room</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      )}
      {/* ── Hand Raise Queue Modal ───────────────────────────────────────── */}
      <Modal
        visible={handRaiseModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setHandRaiseModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheetBox}>
            <View style={styles.modalHeader}>
              <MaterialCommunityIcons name="hand-back-right" size={22} color="#F59E0B" />
              <Text style={styles.modalTitle}>Speaking Queue ({handRaisedPeers.length})</Text>
              <Pressable onPress={() => setHandRaiseModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#94A3B8" />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 320 }}>
              {handRaisedPeers.length === 0 ? (
                <Text style={styles.emptyQueueText}>No hands currently raised.</Text>
              ) : (
                handRaisedPeers.map((peer, idx) => (
                  <View key={peer.socketId} style={styles.queueItem}>
                    <View style={styles.queueIdxBadge}>
                      <Text style={styles.queueIdxText}>#{idx + 1}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.queueItemName}>{peer.name}</Text>
                      <Text style={styles.queueItemSub}>Waiting to speak</Text>
                    </View>
                    {isHost && (
                      <Pressable
                        onPress={() => {
                          inviteToSpeak(peer.socketId);
                          setHandRaiseModalVisible(false);
                        }}
                        style={styles.inviteSpeakBtn}
                      >
                        <Text style={styles.inviteSpeakBtnText}>Invite to Speak</Text>
                      </Pressable>
                    )}
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Tools Drawer Modal (20 Feature Hub) ───────────────────────────── */}
      <Modal
        visible={toolsDrawerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setToolsDrawerVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.toolsDrawerBox}>
            <View style={styles.modalHeader}>
              <MaterialCommunityIcons name="toolbox-outline" size={22} color="#38BDF8" />
              <Text style={styles.modalTitle}>Room Study Tools & Controls</Text>
              <Pressable onPress={() => setToolsDrawerVisible(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#94A3B8" />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              <View style={styles.toolsGrid}>
                {/* 1. Collaborative Whiteboard */}
                <Pressable
                  onPress={() => {
                    setToolsDrawerVisible(false);
                    setWhiteboardModalVisible(true);
                  }}
                  style={styles.toolCard}
                >
                  <View style={[styles.toolIconBox, { backgroundColor: "rgba(56, 189, 248, 0.15)" }]}>
                    <MaterialCommunityIcons name="draw" size={24} color="#38BDF8" />
                  </View>
                  <Text style={styles.toolTitle}>Whiteboard</Text>
                  <Text style={styles.toolSub}>Live sketch & formula canvas</Text>
                </Pressable>

                {/* 2. Interactive Polls */}
                <Pressable
                  onPress={() => {
                    setToolsDrawerVisible(false);
                    setPollModalVisible(true);
                  }}
                  style={styles.toolCard}
                >
                  <View style={[styles.toolIconBox, { backgroundColor: "rgba(16, 185, 129, 0.15)" }]}>
                    <MaterialCommunityIcons name="poll" size={24} color="#10B981" />
                  </View>
                  <Text style={styles.toolTitle}>Live Polls</Text>
                  <Text style={styles.toolSub}>{currentPoll ? "Active Vote Live" : "Quiz & Surveys"}</Text>
                </Pressable>

                {/* 3. Shared Resources */}
                <Pressable
                  onPress={() => {
                    setToolsDrawerVisible(false);
                    setResourcesModalVisible(true);
                  }}
                  style={styles.toolCard}
                >
                  <View style={[styles.toolIconBox, { backgroundColor: "rgba(245, 158, 11, 0.15)" }]}>
                    <MaterialCommunityIcons name="folder-text-outline" size={24} color="#F59E0B" />
                  </View>
                  <Text style={styles.toolTitle}>Resources</Text>
                  <Text style={styles.toolSub}>{sharedResources.length} files & links</Text>
                </Pressable>

                {/* 4. Key Moment Bookmarks */}
                <Pressable
                  onPress={() => {
                    setToolsDrawerVisible(false);
                    setBookmarksModalVisible(true);
                  }}
                  style={styles.toolCard}
                >
                  <View style={[styles.toolIconBox, { backgroundColor: "rgba(239, 68, 68, 0.15)" }]}>
                    <MaterialCommunityIcons name="bookmark-check" size={24} color="#EF4444" />
                  </View>
                  <Text style={styles.toolTitle}>Bookmarks</Text>
                  <Text style={styles.toolSub}>{bookmarkedMoments.length} moments saved</Text>
                </Pressable>

                {/* 5. Breakout Study Groups */}
                <Pressable
                  onPress={() => {
                    setToolsDrawerVisible(false);
                    setBreakoutModalVisible(true);
                  }}
                  style={styles.toolCard}
                >
                  <View style={[styles.toolIconBox, { backgroundColor: "rgba(168, 85, 247, 0.15)" }]}>
                    <MaterialCommunityIcons name="account-supervisor-circle" size={24} color="#A855F7" />
                  </View>
                  <Text style={styles.toolTitle}>Breakouts</Text>
                  <Text style={styles.toolSub}>Peer study pairs</Text>
                </Pressable>

                {/* 6. Live Meeting Notes */}
                <Pressable
                  onPress={() => {
                    setToolsDrawerVisible(false);
                    setNotesModalVisible(true);
                  }}
                  style={styles.toolCard}
                >
                  <View style={[styles.toolIconBox, { backgroundColor: "rgba(14, 165, 233, 0.15)" }]}>
                    <MaterialCommunityIcons name="notebook-outline" size={24} color="#0EA5E9" />
                  </View>
                  <Text style={styles.toolTitle}>Agenda Notes</Text>
                  <Text style={styles.toolSub}>Shared live minutes</Text>
                </Pressable>

                {/* 7. Audio Filter Booster */}
                <Pressable
                  onPress={() => {
                    const nextMode = audioFilterMode === "standard" ? "voice_boost" : audioFilterMode === "voice_boost" ? "music" : "standard";
                    setAudioFilterMode(nextMode);
                    triggerHaptic();
                  }}
                  style={styles.toolCard}
                >
                  <View style={[styles.toolIconBox, { backgroundColor: "rgba(236, 72, 153, 0.15)" }]}>
                    <MaterialCommunityIcons name="tune-vertical" size={24} color="#EC4899" />
                  </View>
                  <Text style={styles.toolTitle}>Voice Filter</Text>
                  <Text style={styles.toolSub}>
                    {audioFilterMode === "voice_boost" ? "🎙️ Voice Boost" : audioFilterMode === "music" ? "🎵 Music Mode" : "Standard"}
                  </Text>
                </Pressable>

                {/* 8. Virtual Backdrop */}
                <Pressable
                  onPress={() => {
                    const bgs: Array<"none" | "blur" | "library" | "sunset" | "studio"> = ["none", "blur", "library", "sunset", "studio"];
                    const currIdx = bgs.indexOf(virtualBackground);
                    const next = bgs[(currIdx + 1) % bgs.length];
                    setVirtualBackground(next);
                    triggerHaptic();
                  }}
                  style={styles.toolCard}
                >
                  <View style={[styles.toolIconBox, { backgroundColor: "rgba(139, 92, 246, 0.15)" }]}>
                    <MaterialCommunityIcons name="image-filter-hdr" size={24} color="#8B5CF6" />
                  </View>
                  <Text style={styles.toolTitle}>Backdrop</Text>
                  <Text style={styles.toolSub}>
                    {virtualBackground === "library" ? "📚 Library" : virtualBackground === "sunset" ? "🌅 Sunset" : virtualBackground === "studio" ? "🌌 Studio" : virtualBackground === "blur" ? "Privacy Blur" : "Off"}
                  </Text>
                </Pressable>

                {/* 9. Urgent Broadcast Announcement (Host) */}
                {isHost && (
                  <Pressable
                    onPress={() => {
                      setToolsDrawerVisible(false);
                      setBroadcastModalVisible(true);
                    }}
                    style={styles.toolCard}
                  >
                    <View style={[styles.toolIconBox, { backgroundColor: "rgba(245, 158, 11, 0.15)" }]}>
                      <MaterialCommunityIcons name="bullhorn-outline" size={24} color="#F59E0B" />
                    </View>
                    <Text style={styles.toolTitle}>Announcement</Text>
                    <Text style={styles.toolSub}>Broadcast ticker</Text>
                  </Pressable>
                )}

                {/* 10. Screen Share Mode */}
                <Pressable
                  onPress={() => {
                    setToolsDrawerVisible(false);
                    toggleScreenShare();
                  }}
                  style={styles.toolCard}
                >
                  <View style={[styles.toolIconBox, { backgroundColor: isScreenSharing ? "rgba(16, 185, 129, 0.2)" : "rgba(100, 116, 139, 0.15)" }]}>
                    <MaterialCommunityIcons name="monitor-share" size={24} color={isScreenSharing ? "#10B981" : "#94A3B8"} />
                  </View>
                  <Text style={styles.toolTitle}>Screen Share</Text>
                  <Text style={styles.toolSub}>{isScreenSharing ? "Sharing Active" : "Share slides"}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Collaborative Whiteboard Modal ──────────────────────────────── */}
      <Modal
        visible={whiteboardModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setWhiteboardModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.whiteboardBox}>
            <View style={styles.modalHeader}>
              <MaterialCommunityIcons name="draw" size={22} color="#38BDF8" />
              <Text style={styles.modalTitle}>Collaborative Whiteboard</Text>
              <Pressable onPress={() => setWhiteboardModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#94A3B8" />
              </Pressable>
            </View>

            {/* Canvas Area */}
            <View style={styles.whiteboardCanvas}>
              {whiteboardStrokes.map((s, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.whiteboardDot,
                    {
                      left: s.x || 50,
                      top: s.y || 50,
                      backgroundColor: s.color || "#38BDF8",
                    },
                  ]}
                />
              ))}
              <Text style={styles.whiteboardHint}>
                Touch canvas or use tools to sketch formulas, math equations, and study notes in real-time.
              </Text>
            </View>

            {/* Whiteboard Controls */}
            <View style={styles.whiteboardToolsRow}>
              {["#FFFFFF", "#38BDF8", "#EF4444", "#10B981", "#F59E0B"].map((c) => (
                <Pressable
                  key={c}
                  onPress={() => {
                    setWbColor(c);
                    setWbTool("pen");
                    triggerHaptic();
                  }}
                  style={[styles.colorDot, { backgroundColor: c }, wbColor === c && styles.colorDotActive]}
                />
              ))}
              <Pressable
                onPress={() => {
                  broadcastStroke({ x: Math.random() * 260 + 20, y: Math.random() * 180 + 20, color: wbColor });
                }}
                style={styles.wbActionBtn}
              >
                <MaterialCommunityIcons name="pencil-plus" size={16} color="#38BDF8" />
                <Text style={styles.wbActionBtnText}>Quick Draw</Text>
              </Pressable>
              <Pressable onPress={clearWhiteboard} style={[styles.wbActionBtn, { backgroundColor: "rgba(239, 68, 68, 0.15)" }]}>
                <MaterialCommunityIcons name="trash-can-outline" size={16} color="#EF4444" />
                <Text style={[styles.wbActionBtnText, { color: "#EF4444" }]}>Clear</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Live Interactive Polls Modal ──────────────────────────────────── */}
      <Modal
        visible={pollModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPollModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheetBox}>
            <View style={styles.modalHeader}>
              <MaterialCommunityIcons name="poll" size={22} color="#10B981" />
              <Text style={styles.modalTitle}>Live Room Poll</Text>
              <Pressable onPress={() => setPollModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#94A3B8" />
              </Pressable>
            </View>

            {currentPoll ? (
              <View style={styles.pollActiveContainer}>
                <Text style={styles.pollQuestionText}>{currentPoll.question}</Text>
                <Text style={styles.pollCreatorText}>Launched by {currentPoll.creatorName}</Text>

                {currentPoll.options.map((opt) => {
                  const totalVotes = currentPoll.options.reduce((acc, o) => acc + o.votes, 0);
                  const percent = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
                  const hasVotedThis = currentPoll.voters[currentUserId] === opt.id;

                  return (
                    <Pressable
                      key={opt.id}
                      onPress={() => {
                        votePoll(opt.id);
                      }}
                      style={[styles.pollOptionBox, hasVotedThis && styles.pollOptionBoxVoted]}
                    >
                      <View style={[styles.pollProgressBar, { width: `${percent}%` }]} />
                      <View style={styles.pollOptionContent}>
                        <Text style={[styles.pollOptionText, hasVotedThis && { color: "#10B981", fontWeight: "700" }]}>
                          {opt.text}
                        </Text>
                        <Text style={styles.pollOptionCount}>
                          {percent}% ({opt.votes})
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}

                {isHost && currentPoll.isOpen && (
                  <Pressable onPress={closePoll} style={styles.endPollBtn}>
                    <Text style={styles.endPollBtnText}>Close Poll</Text>
                  </Pressable>
                )}
              </View>
            ) : isHost ? (
              <View style={styles.createPollContainer}>
                <Text style={styles.fieldLabel}>Question</Text>
                <TextInput
                  style={styles.pollInput}
                  placeholder="e.g. Did everyone follow Step 3?"
                  placeholderTextColor="#64748B"
                  value={newPollQuestion}
                  onChangeText={setNewPollQuestion}
                />
                <Text style={styles.fieldLabel}>Option 1</Text>
                <TextInput
                  style={styles.pollInput}
                  placeholder="Option 1"
                  placeholderTextColor="#64748B"
                  value={newPollOpt1}
                  onChangeText={setNewPollOpt1}
                />
                <Text style={styles.fieldLabel}>Option 2</Text>
                <TextInput
                  style={styles.pollInput}
                  placeholder="Option 2"
                  placeholderTextColor="#64748B"
                  value={newPollOpt2}
                  onChangeText={setNewPollOpt2}
                />
                <Pressable
                  onPress={() => {
                    if (!newPollQuestion.trim() || !newPollOpt1.trim() || !newPollOpt2.trim()) {
                      Alert.alert("Missing Fields", "Please provide a question and at least 2 options.");
                      return;
                    }
                    createPoll(newPollQuestion, [newPollOpt1, newPollOpt2]);
                    setNewPollQuestion("");
                    setNewPollOpt1("");
                    setNewPollOpt2("");
                  }}
                  style={styles.createPollSubmitBtn}
                >
                  <Text style={styles.createPollSubmitText}>Launch Live Poll</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.emptyQueueText}>No active poll in this room. The host will launch one soon.</Text>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Shared Resources Modal ────────────────────────────────────────── */}
      <Modal
        visible={resourcesModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setResourcesModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheetBox}>
            <View style={styles.modalHeader}>
              <MaterialCommunityIcons name="folder-text-outline" size={22} color="#F59E0B" />
              <Text style={styles.modalTitle}>Shared Study Resources ({sharedResources.length})</Text>
              <Pressable onPress={() => setResourcesModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#94A3B8" />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 260 }}>
              {sharedResources.length === 0 ? (
                <Text style={styles.emptyQueueText}>No resources shared yet during this session.</Text>
              ) : (
                sharedResources.map((res) => (
                  <View key={res.id} style={styles.resourceCard}>
                    <MaterialCommunityIcons
                      name={res.type === "pdf" ? "file-pdf-box" : res.type === "code" ? "code-tags" : "link-variant"}
                      size={20}
                      color="#38BDF8"
                    />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.resourceTitleText}>{res.title}</Text>
                      <Text style={styles.resourceSubText}>Shared by {res.sharedByName}</Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            {/* Share Form */}
            <View style={styles.addResourceBox}>
              <TextInput
                style={styles.resInput}
                placeholder="Resource title (e.g. Chapter 4 Slides)"
                placeholderTextColor="#64748B"
                value={newResTitle}
                onChangeText={setNewResTitle}
              />
              <TextInput
                style={styles.resInput}
                placeholder="Resource URL (https://...)"
                placeholderTextColor="#64748B"
                value={newResUrl}
                onChangeText={setNewResUrl}
              />
              <Pressable
                onPress={() => {
                  if (!newResTitle.trim() || !newResUrl.trim()) return;
                  shareResource(newResTitle, newResUrl, newResType);
                  setNewResTitle("");
                  setNewResUrl("");
                }}
                style={styles.shareResSubmitBtn}
              >
                <Text style={styles.shareResSubmitText}>Share with Room</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Key Moment Bookmarking Modal ──────────────────────────────────── */}
      <Modal
        visible={bookmarksModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setBookmarksModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheetBox}>
            <View style={styles.modalHeader}>
              <MaterialCommunityIcons name="bookmark-check" size={22} color="#EF4444" />
              <Text style={styles.modalTitle}>Lecture Key Moments ({bookmarkedMoments.length})</Text>
              <Pressable onPress={() => setBookmarksModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#94A3B8" />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 220 }}>
              {bookmarkedMoments.length === 0 ? (
                <Text style={styles.emptyQueueText}>No key moments saved yet.</Text>
              ) : (
                bookmarkedMoments.map((bm) => (
                  <View key={bm.id} style={styles.bookmarkRow}>
                    <View style={styles.timestampBadge}>
                      <Text style={styles.timestampText}>{formatTimer(bm.timestampSeconds)}</Text>
                    </View>
                    <Text style={styles.bookmarkNoteText}>{bm.note}</Text>
                  </View>
                ))
              )}
            </ScrollView>

            <View style={styles.addBookmarkBox}>
              <TextInput
                style={styles.bookmarkInput}
                placeholder={`Note at ${formatTimer(durationSeconds)} (e.g. Step 2 derivation)`}
                placeholderTextColor="#64748B"
                value={newBookmarkText}
                onChangeText={setNewBookmarkText}
              />
              <Pressable
                onPress={() => {
                  if (!newBookmarkText.trim()) return;
                  bookmarkMoment(newBookmarkText);
                  setNewBookmarkText("");
                }}
                style={styles.saveBookmarkBtn}
              >
                <Text style={styles.saveBookmarkBtnText}>Bookmark Current Moment</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Breakout Groups Modal ────────────────────────────────────────── */}
      <Modal
        visible={breakoutModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setBreakoutModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheetBox}>
            <View style={styles.modalHeader}>
              <MaterialCommunityIcons name="account-supervisor-circle" size={22} color="#A855F7" />
              <Text style={styles.modalTitle}>Breakout Study Rooms</Text>
              <Pressable onPress={() => setBreakoutModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#94A3B8" />
              </Pressable>
            </View>
            <Text style={styles.modalDescription}>
              Split the room into 2-person study pairs for 10 minutes of interactive problem solving and peer review.
            </Text>

            {isHost ? (
              <View style={{ gap: 10, marginTop: 12 }}>
                <Pressable
                  onPress={() => {
                    startBreakout(10, 2);
                    setBreakoutModalVisible(false);
                  }}
                  style={[styles.breakoutActionBtn, { backgroundColor: "#8B5CF6" }]}
                >
                  <MaterialCommunityIcons name="play-circle" size={18} color="#FFF" />
                  <Text style={styles.breakoutActionBtnText}>Launch 10m Pairs (2 per group)</Text>
                </Pressable>
                {breakoutInfo && (
                  <Pressable
                    onPress={() => {
                      endBreakout();
                      setBreakoutModalVisible(false);
                    }}
                    style={[styles.breakoutActionBtn, { backgroundColor: "#EF4444" }]}
                  >
                    <MaterialCommunityIcons name="stop-circle" size={18} color="#FFF" />
                    <Text style={styles.breakoutActionBtnText}>End Breakout & Return</Text>
                  </Pressable>
                )}
              </View>
            ) : (
              <Text style={styles.emptyQueueText}>Only the host can launch breakout rooms.</Text>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Meeting Agenda Notes Modal ────────────────────────────────────── */}
      <Modal
        visible={notesModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setNotesModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheetBox}>
            <View style={styles.modalHeader}>
              <MaterialCommunityIcons name="notebook-outline" size={22} color="#0EA5E9" />
              <Text style={styles.modalTitle}>Live Room Agenda & Notes</Text>
              <Pressable onPress={() => setNotesModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#94A3B8" />
              </Pressable>
            </View>
            <TextInput
              style={styles.notesEditorInput}
              multiline
              value={sharedNotes}
              onChangeText={setSharedNotes}
              placeholder="Write agenda items, formulas, questions..."
              placeholderTextColor="#64748B"
            />
          </View>
        </View>
      </Modal>

      {/* ── Private In-Room Whisper Modal ─────────────────────────────────── */}
      {whisperTarget && (
        <Modal
          visible={whisperModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setWhisperModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalSheetBox}>
              <View style={styles.modalHeader}>
                <MaterialCommunityIcons name="message-lock-outline" size={22} color="#A855F7" />
                <Text style={styles.modalTitle}>Private Whisper to {whisperTarget.name}</Text>
                <Pressable onPress={() => setWhisperModalVisible(false)}>
                  <MaterialCommunityIcons name="close" size={20} color="#94A3B8" />
                </Pressable>
              </View>
              <TextInput
                style={styles.pollInput}
                placeholder={`Ask ${whisperTarget.name} a private question...`}
                placeholderTextColor="#64748B"
                value={whisperInput}
                onChangeText={setWhisperInput}
              />
              <Pressable
                onPress={() => {
                  if (!whisperInput.trim()) return;
                  sendWhisper(whisperTarget.socketId, whisperInput);
                  setWhisperInput("");
                  setWhisperModalVisible(false);
                }}
                style={[styles.createPollSubmitBtn, { backgroundColor: "#A855F7" }]}
              >
                <Text style={styles.createPollSubmitText}>Send Whisper</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}

      {/* ── Urgent Broadcast Announcement Modal (Host) ────────────────────── */}
      <Modal
        visible={broadcastModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setBroadcastModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheetBox}>
            <View style={styles.modalHeader}>
              <MaterialCommunityIcons name="bullhorn-outline" size={22} color="#F59E0B" />
              <Text style={styles.modalTitle}>Broadcast Ticker Notice</Text>
              <Pressable onPress={() => setBroadcastModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#94A3B8" />
              </Pressable>
            </View>
            <TextInput
              style={styles.pollInput}
              placeholder="e.g. Please open Chapter 4 PDF from resources!"
              placeholderTextColor="#64748B"
              value={broadcastInput}
              onChangeText={setBroadcastInput}
            />
            <Pressable
              onPress={() => {
                if (!broadcastInput.trim()) return;
                sendBroadcast(broadcastInput, 10000);
                setBroadcastInput("");
                setBroadcastModalVisible(false);
              }}
              style={[styles.createPollSubmitBtn, { backgroundColor: "#F59E0B" }]}
            >
              <Text style={styles.createPollSubmitText}>Pin Announcement on All Screens</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── Network Diagnostics Modal ─────────────────────────────────────── */}
      <Modal
        visible={networkStatsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNetworkStatsVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheetBox}>
            <View style={styles.modalHeader}>
              <MaterialCommunityIcons name="wifi-check" size={22} color="#10B981" />
              <Text style={styles.modalTitle}>Real-time Network Diagnostics</Text>
              <Pressable onPress={() => setNetworkStatsVisible(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#94A3B8" />
              </Pressable>
            </View>
            <View style={styles.netStatRow}>
              <Text style={styles.netStatLabel}>Latency (RTT):</Text>
              <Text style={[styles.netStatValue, { color: "#10B981" }]}>{latencyMs} ms</Text>
            </View>
            <View style={styles.netStatRow}>
              <Text style={styles.netStatLabel}>Network Health:</Text>
              <Text style={styles.netStatValue}>{networkQuality.toUpperCase()}</Text>
            </View>
            <View style={styles.netStatRow}>
              <Text style={styles.netStatLabel}>Audio Protocol:</Text>
              <Text style={styles.netStatValue}>OPUS (WebRTC HD Mesh)</Text>
            </View>
            <View style={styles.netStatRow}>
              <Text style={styles.netStatLabel}>Bandwidth Mode:</Text>
              <Text style={styles.netStatValue}>{isLowDataMode ? "Data Saver (Audio Priority)" : "Full HD Multi-stream"}</Text>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Responsive Live Session Attendance Modal ────────────────────── */}
      <RoomSessionAttendanceModal
        visible={attendanceModalVisible}
        roomId={roomId}
        roomTitle={roomTitle}
        isTeacher={Boolean(isHost)}
        onClose={() => setAttendanceModalVisible(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B0F19",
  },
  topHud: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(15, 23, 42, 0.92)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(51, 65, 85, 0.5)",
  },
  hudLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(239, 68, 68, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.5)",
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#EF4444",
  },
  liveText: {
    color: "#EF4444",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  titleColumn: {
    flex: 1,
  },
  roomTitleText: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "700",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  durationText: {
    color: "#94A3B8",
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
  metaSeparator: {
    color: "#475569",
    fontSize: 11,
  },
  participantCountText: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "600",
  },
  engineBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  engineText: {
    color: "#10B981",
    fontSize: 10,
    fontWeight: "700",
  },
  hudRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pomodoroPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(30, 41, 59, 0.8)",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(51, 65, 85, 0.6)",
  },
  pomodoroPillActive: {
    backgroundColor: "rgba(244, 63, 94, 0.15)",
    borderColor: "#F43F5E",
  },
  pomodoroText: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  pomodoroTextActive: {
    color: "#F43F5E",
  },
  iconBtnRound: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(30, 41, 59, 0.8)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(51, 65, 85, 0.6)",
  },
  iconBtnActive: {
    backgroundColor: "rgba(56, 189, 248, 0.2)",
    borderColor: "#38BDF8",
  },
  leaveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EF4444",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  leaveBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  handRaiseAlertBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(245, 158, 11, 0.18)",
    borderBottomWidth: 1,
    borderBottomColor: "#F59E0B",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  handRaiseAlertText: {
    color: "#F59E0B",
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
    marginLeft: 6,
  },
  handRaiseAlertAction: {
    color: "#F59E0B",
    fontSize: 12,
    fontWeight: "800",
  },
  arenaContainer: {
    flex: 1,
    position: "relative",
    overflow: "hidden",
    backgroundColor: "#050811",
  },
  gridContainer: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 6,
    gap: 6,
    justifyContent: "center",
  },
  gridTile: {
    backgroundColor: "#131C2E",
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
    borderWidth: 1,
    borderColor: "rgba(51, 65, 85, 0.6)",
  },
  gridTileSingle: {
    width: "100%",
    height: "100%",
  },
  gridTileHalf: {
    width: "100%",
    height: "48.5%",
  },
  gridTileQuarter: {
    width: "48.8%",
    height: "48.5%",
  },
  gridTileSpeaking: {
    borderColor: "#38BDF8",
    borderWidth: 2,
  },
  avatarTilePlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  avatarPulseRing: {
    padding: 4,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "transparent",
  },
  gridAvatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
  },
  gridAvatarInitial: {
    color: "#FFFFFF",
    fontSize: 26,
    fontWeight: "800",
  },
  placeholderBg: {
    backgroundColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
  },
  gridParticipantName: {
    color: "#F8FAFC",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 8,
  },
  tileFooter: {
    position: "absolute",
    bottom: 8,
    left: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tileNameTag: {
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tileNameTagText: {
    color: "#F8FAFC",
    fontSize: 11,
    fontWeight: "600",
  },
  tileMicPill: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  tileHandBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "rgba(245, 158, 11, 0.9)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  cinemaContainer: {
    flex: 1,
  },
  cinemaMainTile: {
    flex: 1,
    backgroundColor: "#0B0F19",
  },
  largeAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  largeAvatarText: {
    color: "#FFFFFF",
    fontSize: 38,
    fontWeight: "800",
  },
  spotlightName: {
    color: "#F8FAFC",
    fontSize: 16,
    fontWeight: "700",
    marginTop: 12,
  },
  cinemaCarousel: {
    height: 90,
    backgroundColor: "#0F172A",
    borderTopWidth: 1,
    borderTopColor: "rgba(51, 65, 85, 0.6)",
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  carouselBubble: {
    width: 74,
    height: 74,
    borderRadius: 10,
    backgroundColor: "#1E293B",
    marginRight: 8,
    overflow: "hidden",
    position: "relative",
    borderWidth: 1,
    borderColor: "rgba(51, 65, 85, 0.8)",
  },
  carouselAvatarBg: {
    flex: 1,
    backgroundColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
  },
  carouselAvatarInitial: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "700",
  },
  bubbleNameTag: {
    position: "absolute",
    bottom: 2,
    left: 2,
    right: 2,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 4,
    paddingVertical: 1,
    alignItems: "center",
  },
  bubbleNameText: {
    color: "#F8FAFC",
    fontSize: 9,
    fontWeight: "600",
  },
  bubbleHandBadge: {
    position: "absolute",
    top: 2,
    right: 2,
  },
  loungeScroll: {
    padding: 16,
  },
  loungeHeader: {
    alignItems: "center",
    marginBottom: 20,
  },
  loungeTitle: {
    color: "#F8FAFC",
    fontSize: 18,
    fontWeight: "700",
    marginTop: 6,
  },
  loungeSub: {
    color: "#94A3B8",
    fontSize: 12,
    textAlign: "center",
    marginTop: 4,
  },
  loungeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    justifyContent: "center",
  },
  loungeCard: {
    width: 90,
    alignItems: "center",
  },
  loungeAvatarContainer: {
    position: "relative",
    padding: 3,
    borderRadius: 45,
    borderWidth: 2,
    borderColor: "transparent",
  },
  loungeAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  loungeAvatarInitial: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
  },
  micMiniBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#0B0F19",
  },
  loungeNameText: {
    color: "#F8FAFC",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 6,
    textAlign: "center",
  },
  loungeHandText: {
    color: "#F59E0B",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2,
  },
  floatingEmojiContainer: {
    position: "absolute",
    bottom: 20,
    alignItems: "center",
  },
  floatingEmojiText: {
    fontSize: 34,
  },
  floatingSenderText: {
    color: "#F8FAFC",
    fontSize: 9,
    fontWeight: "700",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 4,
    borderRadius: 4,
    marginTop: 2,
  },
  dockContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: "rgba(15, 23, 42, 0.95)",
    borderTopWidth: 1,
    borderTopColor: "rgba(51, 65, 85, 0.5)",
  },
  dockBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    minWidth: 54,
  },
  dockBtnActive: {
    backgroundColor: "rgba(56, 189, 248, 0.2)",
  },
  dockBtnMuted: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
  },
  dockBtnSecondary: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    minWidth: 50,
  },
  dockBtnHandActive: {
    backgroundColor: "rgba(245, 158, 11, 0.25)",
  },
  dockBtnLabel: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "600",
    marginTop: 4,
  },
  chatBadge: {
    position: "absolute",
    top: -4,
    right: -8,
    backgroundColor: "#F43F5E",
    borderRadius: 9,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  chatBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  reactionPickerBox: {
    backgroundColor: "#1E293B",
    borderRadius: 18,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(51, 65, 85, 0.8)",
  },
  reactionPickerTitle: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 12,
  },
  reactionPickerRow: {
    flexDirection: "row",
    gap: 12,
  },
  reactionBtn: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: "rgba(51, 65, 85, 0.4)",
  },
  reactionBtnEmoji: {
    fontSize: 26,
  },
  coStudyModalBox: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#1E293B",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(51, 65, 85, 0.8)",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: {
    color: "#F8FAFC",
    fontSize: 16,
    fontWeight: "700",
    flex: 1,
    marginLeft: 8,
  },
  modalDescription: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 18,
    marginVertical: 14,
  },
  mediaQuickActions: {
    gap: 10,
  },
  sampleMediaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(16, 185, 129, 0.18)",
    paddingVertical: 12,
    borderRadius: 12,
  },
  sampleMediaBtnText: {
    color: "#10B981",
    fontSize: 14,
    fontWeight: "700",
  },
  moderationBox: {
    width: 260,
    backgroundColor: "#1E293B",
    borderRadius: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(51, 65, 85, 0.8)",
  },
  moderationTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "700",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(51, 65, 85, 0.5)",
  },
  moderationItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(51, 65, 85, 0.3)",
  },
  moderationItemText: {
    color: "#F8FAFC",
    fontSize: 13,
    fontWeight: "600",
  },
  // Network Latency & Streak HUD Pills
  networkPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(30, 41, 59, 0.7)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(51, 65, 85, 0.5)",
  },
  networkPillText: {
    fontSize: 10,
    fontWeight: "700",
  },
  streakPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(249, 115, 22, 0.12)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(249, 115, 22, 0.3)",
  },
  streakPillText: {
    color: "#F97316",
    fontSize: 10,
    fontWeight: "700",
  },
  xpBadgeText: {
    color: "#10B981",
    fontSize: 9,
    fontWeight: "800",
  },
  iconBtnDataSaverActive: {
    backgroundColor: "rgba(56, 189, 248, 0.2)",
    borderColor: "#38BDF8",
  },

  // Banner Banners
  reconnectingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(245, 158, 11, 0.18)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(245, 158, 11, 0.4)",
  },
  reconnectingBannerText: {
    color: "#F59E0B",
    fontSize: 12,
    fontWeight: "600",
  },
  broadcastBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(245, 158, 11, 0.2)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(245, 158, 11, 0.6)",
  },
  broadcastSender: {
    color: "#F59E0B",
    fontSize: 11,
    fontWeight: "700",
  },
  broadcastText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  breakoutBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(168, 85, 247, 0.2)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(168, 85, 247, 0.5)",
  },
  breakoutBannerText: {
    color: "#E9D5FF",
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
    marginLeft: 6,
  },
  endBreakoutBtn: {
    backgroundColor: "#EF4444",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  endBreakoutBtnText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "700",
  },

  // Equalizer
  equalizerContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
    height: 14,
    marginLeft: 4,
  },
  equalizerBar: {
    width: 2.5,
    borderRadius: 1.5,
    backgroundColor: "#38BDF8",
  },

  // Dock tools button
  dockBtnTools: {
    backgroundColor: "rgba(56, 189, 248, 0.15)",
    borderColor: "rgba(56, 189, 248, 0.4)",
  },

  // Generic modal sheet box
  modalSheetBox: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#1E293B",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(51, 65, 85, 0.8)",
  },

  // Tools Drawer
  toolsDrawerBox: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: "#0F172A",
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(51, 65, 85, 0.8)",
  },
  toolsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14,
  },
  toolCard: {
    width: "48%",
    backgroundColor: "rgba(30, 41, 59, 0.7)",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(51, 65, 85, 0.5)",
  },
  toolIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  toolTitle: {
    color: "#F8FAFC",
    fontSize: 13,
    fontWeight: "700",
  },
  toolSub: {
    color: "#94A3B8",
    fontSize: 11,
    marginTop: 2,
  },

  // Whiteboard Modal
  whiteboardBox: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: "#0F172A",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(51, 65, 85, 0.8)",
  },
  whiteboardCanvas: {
    width: "100%",
    height: 240,
    backgroundColor: "#020617",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(51, 65, 85, 0.6)",
    marginVertical: 12,
    position: "relative",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  whiteboardDot: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  whiteboardHint: {
    color: "#475569",
    fontSize: 11,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  whiteboardToolsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "space-between",
  },
  colorDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorDotActive: {
    borderColor: "#FFF",
    transform: [{ scale: 1.2 }],
  },
  wbActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(56, 189, 248, 0.15)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  wbActionBtnText: {
    color: "#38BDF8",
    fontSize: 12,
    fontWeight: "700",
  },

  // Polls Modal
  pollActiveContainer: {
    marginTop: 12,
  },
  pollQuestionText: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  pollCreatorText: {
    color: "#94A3B8",
    fontSize: 11,
    marginTop: 2,
    marginBottom: 12,
  },
  pollOptionBox: {
    backgroundColor: "rgba(30, 41, 59, 0.6)",
    borderRadius: 12,
    marginVertical: 4,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(51, 65, 85, 0.6)",
    position: "relative",
  },
  pollOptionBoxVoted: {
    borderColor: "#10B981",
  },
  pollProgressBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(16, 185, 129, 0.22)",
  },
  pollOptionContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pollOptionText: {
    color: "#F8FAFC",
    fontSize: 13,
    fontWeight: "600",
  },
  pollOptionCount: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "700",
  },
  endPollBtn: {
    backgroundColor: "#EF4444",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 12,
  },
  endPollBtnText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "700",
  },
  createPollContainer: {
    marginTop: 10,
    gap: 8,
  },
  fieldLabel: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600",
  },
  pollInput: {
    backgroundColor: "rgba(15, 23, 42, 0.8)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#F8FAFC",
    fontSize: 13,
    borderWidth: 1,
    borderColor: "rgba(51, 65, 85, 0.6)",
  },
  createPollSubmitBtn: {
    backgroundColor: "#10B981",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  createPollSubmitText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "700",
  },

  // Resources Modal
  resourceCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(30, 41, 59, 0.6)",
    padding: 10,
    borderRadius: 12,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(51, 65, 85, 0.5)",
  },
  resourceTitleText: {
    color: "#F8FAFC",
    fontSize: 13,
    fontWeight: "600",
  },
  resourceSubText: {
    color: "#94A3B8",
    fontSize: 11,
  },
  addResourceBox: {
    gap: 6,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(51, 65, 85, 0.5)",
    paddingTop: 12,
  },
  resInput: {
    backgroundColor: "rgba(15, 23, 42, 0.8)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: "#F8FAFC",
    fontSize: 12,
    borderWidth: 1,
    borderColor: "rgba(51, 65, 85, 0.6)",
  },
  shareResSubmitBtn: {
    backgroundColor: "#F59E0B",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 4,
  },
  shareResSubmitText: {
    color: "#0F172A",
    fontSize: 13,
    fontWeight: "700",
  },

  // Bookmarks Modal
  bookmarkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(30, 41, 59, 0.5)",
    padding: 10,
    borderRadius: 10,
    marginVertical: 4,
  },
  timestampBadge: {
    backgroundColor: "rgba(239, 68, 68, 0.2)",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.4)",
  },
  timestampText: {
    color: "#EF4444",
    fontSize: 11,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  bookmarkNoteText: {
    color: "#F8FAFC",
    fontSize: 13,
    flex: 1,
  },
  addBookmarkBox: {
    gap: 8,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(51, 65, 85, 0.5)",
    paddingTop: 12,
  },
  bookmarkInput: {
    backgroundColor: "rgba(15, 23, 42, 0.8)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#F8FAFC",
    fontSize: 13,
    borderWidth: 1,
    borderColor: "rgba(51, 65, 85, 0.6)",
  },
  saveBookmarkBtn: {
    backgroundColor: "#EF4444",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  saveBookmarkBtnText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "700",
  },

  // Breakout Modal
  breakoutActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  breakoutActionBtnText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "700",
  },

  // Notes Modal
  notesEditorInput: {
    height: 240,
    backgroundColor: "rgba(15, 23, 42, 0.9)",
    borderRadius: 12,
    padding: 14,
    color: "#F8FAFC",
    fontSize: 13,
    lineHeight: 20,
    textAlignVertical: "top",
    marginTop: 12,
    borderWidth: 1,
    borderColor: "rgba(51, 65, 85, 0.6)",
  },

  // Network Diagnostics
  netStatRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(51, 65, 85, 0.4)",
  },
  netStatLabel: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "600",
  },
  netStatValue: {
    color: "#F8FAFC",
    fontSize: 13,
    fontWeight: "700",
  },

  // Hand Raise Queue
  queueItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(30, 41, 59, 0.6)",
    padding: 10,
    borderRadius: 12,
    marginVertical: 4,
  },
  queueIdxBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(245, 158, 11, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  queueIdxText: {
    color: "#F59E0B",
    fontSize: 12,
    fontWeight: "700",
  },
  queueItemName: {
    color: "#F8FAFC",
    fontSize: 13,
    fontWeight: "700",
  },
  queueItemSub: {
    color: "#94A3B8",
    fontSize: 11,
  },
  inviteSpeakBtn: {
    backgroundColor: "#10B981",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  inviteSpeakBtnText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "700",
  },
  emptyQueueText: {
    color: "#64748B",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 24,
  },

});
