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
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { VideoView } from "@/features/calls/components/VideoView";
import { useRoomWebRTC, RoomRemotePeer, FloatingReaction } from "./useRoomWebRTC";
import { triggerHaptic } from "@/components/ui";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

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
    isVideoOn,
    isFrontCamera,
    isHandRaised,
    activeSpeakerId,
    reactions,
    mediaSync,
    participantCount,
    leave,
    toggleMicrophone,
    toggleCamera,
    toggleCameraFacing,
    toggleRaiseHand,
    sendReaction,
    sendMediaSync,
    moderatePeer,
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

  // Call duration counter
  const [durationSeconds, setDurationSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setDurationSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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

  const spotlightPeer = useMemo(() => {
    if (!spotlightUserId) return remotePeers[0] || null;
    return remotePeers.find((p) => p.userId === spotlightUserId) || null;
  }, [spotlightUserId, remotePeers]);

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
              <View style={styles.engineBadge}>
                <MaterialCommunityIcons name="lightning-bolt" size={12} color="#10B981" />
                <Text style={styles.engineText}>WebRTC HD</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.hudRight}>
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

          {/* Leave Button */}
          <Pressable onPress={handleExit} style={styles.leaveBtn}>
            <MaterialCommunityIcons name="phone-hangup" size={16} color="#FFFFFF" />
            <Text style={styles.leaveBtnText}>Leave</Text>
          </Pressable>
        </View>
      </View>

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
                      spotlightPeer?.isSpeaking && { transform: [{ scale: pulseAnim }], borderColor: "#38BDF8" },
                    ]}
                  >
                    {spotlightPeer?.avatarUrl ? (
                      <Image source={{ uri: spotlightPeer.avatarUrl }} style={styles.largeAvatar} />
                    ) : (
                      <View style={[styles.largeAvatar, styles.placeholderBg]}>
                        <Text style={styles.largeAvatarText}>
                          {(spotlightPeer?.name || currentUserName || "M").charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </Animated.View>
                  <Text style={styles.spotlightName}>{spotlightPeer?.name || currentUserName}</Text>
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
                    !isMuted && { transform: [{ scale: pulseAnim }], borderColor: "#10B981" },
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
                <Text style={styles.loungeNameText}>You (Host)</Text>
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
                      peer.isSpeaking && { transform: [{ scale: pulseAnim }], borderColor: "#38BDF8" },
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
                  <Text style={styles.loungeNameText} numberOfLines={1}>
                    {peer.name}
                  </Text>
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
                      !isMuted && { transform: [{ scale: pulseAnim }], borderColor: "#10B981" },
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
                  <Text style={styles.gridParticipantName}>You ({currentUserRole})</Text>
                </View>
              )}

              {/* Status Pills */}
              <View style={styles.tileFooter}>
                <View style={styles.tileNameTag}>
                  <Text style={styles.tileNameTagText}>You</Text>
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
                        peer.isSpeaking && { transform: [{ scale: pulseAnim }], borderColor: "#38BDF8" },
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
                    <Text style={styles.gridParticipantName}>{peer.name}</Text>
                  </View>
                )}

                {/* Status Pills */}
                <View style={styles.tileFooter}>
                  <View style={styles.tileNameTag}>
                    <Text style={styles.tileNameTagText} numberOfLines={1}>
                      {peer.name}
                    </Text>
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
});
