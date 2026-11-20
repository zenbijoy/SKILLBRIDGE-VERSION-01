import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useLocalSearchParams, router } from "expo-router";
import {
  Alert,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  ScrollView,
  Pressable,
  Platform,
  PermissionsAndroid,
  TextInput,
  Modal,
  Animated,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import {
  AudioSession,
  LiveKitRoom,
  VideoTrack,
  useRoomContext,
  useTracks,
  useParticipants,
} from "@livekit/react-native";
import { Track, RoomEvent, Participant } from "livekit-client";
import {
  encodeLivePacket,
  decodeLivePacket,
  LiveReactionPacket,
  LiveHandRaisePacket,
  LiveChatPacket,
  LivePollPacket,
  LiveQAQueuePacket,
} from "./liveDataPacket";
import { api } from "../../lib/api";
import { RoomLiveStage } from "../room/live/RoomLiveStage";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface LiveCreds {
  provider?: "livekit" | "webrtc";
  url: string;
  token: string;
  canPublish: boolean;
  isHost?: boolean;
  role?: string;
  sessionId?: string;
  roomName?: string;
  participantName?: string;
  iceServers?: any[];
}

interface ChatMessage {
  id: string;
  senderName: string;
  senderId: string;
  text: string;
  timestamp: number;
  isMe: boolean;
}

interface QAQuestion {
  id: string;
  title: string;
  senderName: string;
  senderId: string;
  upvotes: number;
  isAnswered: boolean;
  timestamp: number;
}

interface ActivePoll {
  id: string;
  question: string;
  options: { id: string; text: string; votes: number }[];
  isOpen: boolean;
  totalVotes: number;
  userVotedId?: string;
}

type NavbarTab = "stage" | "presentation" | "whiteboard";

function getParticipantDisplayName(participant: any): string {
  if (participant?.name && participant.name.trim() !== "") {
    return participant.name;
  }
  try {
    const meta = JSON.parse(participant?.metadata || "{}");
    if (meta.fullName) return meta.fullName;
    if (meta.username) return `@${meta.username}`;
  } catch {}
  return participant?.identity || "Participant";
}

// ─────────────────────────────────────────────────────────────────────────────
// Main LiveRoomScreen (Native)
// ─────────────────────────────────────────────────────────────────────────────
export default function LiveRoomScreen() {
  const { roomId, sessionId } = useLocalSearchParams<{ roomId: string; sessionId?: string }>();
  const [creds, setCreds] = useState<LiveCreds | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joiningRoom, setJoiningRoom] = useState(false);

  const requestNativePermissions = useCallback(async () => {
    if (Platform.OS === "android") {
      try {
        await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          PermissionsAndroid.PERMISSIONS.CAMERA,
        ]);
      } catch (e) {
        console.warn("Permission request error:", e);
      }
    }
  }, []);

  const fetchToken = useCallback(() => {
    const rawTarget = sessionId || roomId;
    if (!rawTarget) return;
    const target = rawTarget.replace(/^qa-stage-/, "");
    const cleanRoomId = roomId ? roomId.replace(/^qa-stage-/, "") : "";
    setLoading(true);
    setError(null);

    api<LiveCreds>(`/live/token/${target}`, { method: "POST" })
      .then((data) => {
        setCreds(data);
        setLoading(false);
      })
      .catch((e) => {
        const msg = e.message || "Failed to join live room.";
        if (msg.includes("Join the learning room first") && cleanRoomId) {
          api(`/rooms/${cleanRoomId}/join`, { method: "POST" })
            .then(() => api<LiveCreds>(`/live/token/${target}`, { method: "POST" }))
            .then((data) => {
              setCreds(data);
              setLoading(false);
            })
            .catch((retryErr) => {
              setError(retryErr.message || msg);
              setLoading(false);
            });
          return;
        }

        setError(msg);
        setLoading(false);
      });
  }, [roomId, sessionId]);

  const joinAndRetry = useCallback(async () => {
    const rawRoom = roomId || (sessionId ? creds?.sessionId : null);
    const targetRoom = rawRoom ? rawRoom.replace(/^qa-stage-/, "") : null;
    if (!targetRoom) {
      fetchToken();
      return;
    }
    setJoiningRoom(true);
    try {
      await api(`/rooms/${targetRoom}/join`, { method: "POST" });
      setJoiningRoom(false);
      fetchToken();
    } catch (joinErr: any) {
      setJoiningRoom(false);
      const msg = joinErr?.message || "";
      if (
        msg.toLowerCase().includes("approval") ||
        msg.toLowerCase().includes("knock") ||
        msg.toLowerCase().includes("private") ||
        msg.toLowerCase().includes("invit")
      ) {
        Alert.alert(
          "Host Approval Required",
          "This room requires approval from the host before entering. Please request entry in the room lobby.",
          [
            {
              text: "Go to Lobby",
              onPress: () => router.replace(`/room/${targetRoom}` as any),
            },
            { text: "Cancel", style: "cancel" },
          ]
        );
      } else {
        setError(msg || "Could not join room.");
      }
    }
  }, [roomId, sessionId, creds?.sessionId, fetchToken]);

  useEffect(() => {
    void requestNativePermissions();
    AudioSession.startAudioSession();
    fetchToken();

    return () => {
      AudioSession.stopAudioSession();
    };
  }, [fetchToken, requestNativePermissions]);

  if (loading) {
    return (
      <View style={s.centerScreen}>
        <ActivityIndicator size="large" color="#38BDF8" />
        <Text style={s.connectingTitle}>Connecting to Live Space…</Text>
        <Text style={s.connectingSub}>Configuring low-latency real-time video audio</Text>
      </View>
    );
  }

  if (error || !creds) {
    const isMembershipError =
      error?.toLowerCase().includes("join") ||
      error?.toLowerCase().includes("learning room") ||
      error?.toLowerCase().includes("membership");

    return (
      <View style={s.centerScreen}>
        <View style={s.errorBox}>
          <Text style={{ fontSize: 36, marginBottom: 8, textAlign: "center" }}>🛰️</Text>
          <Text style={s.errorTitle}>Connection Notice</Text>
          <Text style={s.errorSub}>{error || "Could not retrieve live room credentials."}</Text>
          <View style={s.errorBtnRow}>
            <Pressable onPress={() => router.back()} style={s.btnSecondary}>
              <Text style={s.btnSecondaryText}>Go Back</Text>
            </Pressable>
            {isMembershipError && roomId ? (
              <Pressable
                onPress={joinAndRetry}
                disabled={joiningRoom}
                style={[s.btnPrimary, { backgroundColor: "#10B981" }]}
              >
                {joiningRoom ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={s.btnPrimaryText}>Join & Enter</Text>
                )}
              </Pressable>
            ) : (
              <Pressable onPress={fetchToken} style={s.btnPrimary}>
                <Text style={s.btnPrimaryText}>Retry</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    );
  }

  // WebRTC fallback mode
  if (creds.provider === "webrtc" || !creds.url) {
    return (
      <RoomLiveStage
        roomId={roomId || creds.sessionId || ""}
        roomTitle={creds.roomName || "Live Study Space"}
        currentUserId={creds.participantName || "user"}
        currentUserName={creds.participantName || "Member"}
        currentUserRole={creds.role || "member"}
        isHost={Boolean(creds.isHost)}
        onLeave={() => router.back()}
      />
    );
  }

  return (
    <View style={s.root}>
      <LiveKitRoom
        serverUrl={creds.url}
        token={creds.token}
        connect={true}
        audio={true}
        video={true}
        options={{ adaptiveStream: true, dynacast: true }}
      >
        <ModernNativeMeetingView
          creds={creds}
          roomId={roomId || creds.sessionId || ""}
        />
      </LiveKitRoom>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Redesigned Native Meeting View
// ─────────────────────────────────────────────────────────────────────────────
function ModernNativeMeetingView({
  creds,
  roomId,
}: {
  creds: LiveCreds;
  roomId: string;
}) {
  const insets = useSafeAreaInsets();
  const room = useRoomContext();
  const participants = useParticipants();

  const allTracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  // Navbar View States
  const [navbarTab, setNavbarTab] = useState<NavbarTab>("stage");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Modals
  const [copiedToast, setCopiedToast] = useState(false);
  const [showRoster, setShowRoster] = useState(false);
  const [showHostModal, setShowHostModal] = useState(false);
  const [showChatModal, setShowChatModal] = useState(false);
  const [showQAModal, setShowQAModal] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  const [showReactionsBar, setShowReactionsBar] = useState(false);

  // Inputs
  const [chatInput, setChatInput] = useState("");
  const [qaInput, setQaInput] = useState("");
  const [rosterSearch, setRosterSearch] = useState("");
  const [page, setPage] = useState(0);

  // Realtime Data Packets
  const [reactions, setReactions] = useState<
    { id: string; emoji: string; senderName: string; anim: Animated.Value; xPercent: number }[]
  >([]);
  const [raisedHands, setRaisedHands] = useState<Set<string>>(new Set());
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [qaQuestions, setQaQuestions] = useState<QAQuestion[]>([
    {
      id: "demo-q1",
      title: "Could you please explain how live WebRTC video channels handle mobile bandwidth?",
      senderName: "Arif",
      senderId: "arif-1",
      upvotes: 3,
      isAnswered: false,
      timestamp: Date.now() - 100000,
    },
  ]);
  const [activePoll, setActivePoll] = useState<ActivePoll | null>({
    id: "poll-1",
    question: "Are the camera and microphone audio crystal clear?",
    options: [
      { id: "opt-1", text: "Yes, 100% clear", votes: 8 },
      { id: "opt-2", text: "Slight echo", votes: 2 },
      { id: "opt-3", text: "Audio only is better", votes: 1 },
    ],
    isOpen: true,
    totalVotes: 11,
    userVotedId: undefined,
  });

  // Reaction animator
  const triggerReaction = useCallback((emoji: string, senderName: string) => {
    const anim = new Animated.Value(0);
    const id = `${Date.now()}-${Math.random()}`;
    const xPercent = 15 + Math.random() * 65;
    const item = { id, emoji, senderName, anim, xPercent };

    setReactions((prev) => [...prev.slice(-12), item]);

    Animated.timing(anim, {
      toValue: 1,
      duration: 2400,
      useNativeDriver: true,
    }).start(() => {
      setReactions((prev) => prev.filter((r) => r.id !== id));
    });
  }, []);

  // Listen to LiveKit Data Channel
  useEffect(() => {
    if (!room) return;

    const onDataReceived = (payload: Uint8Array, participant?: Participant) => {
      const packet = decodeLivePacket(payload);
      if (!packet) return;

      if (packet.type === "reaction") {
        triggerReaction(packet.emoji, packet.senderName || participant?.name || "Participant");
      } else if (packet.type === "hand_raise") {
        const id = packet.senderId || participant?.identity;
        if (id) {
          setRaisedHands((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          });
        }
      } else if (packet.type === "chat") {
        setChatMessages((prev) => [
          ...prev,
          {
            id: `${packet.timestamp}-${Math.random()}`,
            senderName: packet.senderName,
            senderId: packet.senderId,
            text: packet.text,
            timestamp: packet.timestamp,
            isMe: packet.senderId === room.localParticipant?.identity,
          },
        ]);
      } else if (packet.type === "poll") {
        if (packet.action === "start") {
          setActivePoll({
            id: packet.pollId,
            question: packet.question,
            options: packet.options.map((o) => ({ id: o.id, text: o.text, votes: 0 })),
            isOpen: true,
            totalVotes: 0,
          });
        }
      } else if (packet.type === "qa_queue") {
        if (packet.action === "ask") {
          setQaQuestions((prev) => [
            {
              id: packet.questionId,
              title: packet.title,
              senderName: packet.senderName,
              senderId: packet.senderId,
              upvotes: 1,
              isAnswered: false,
              timestamp: packet.timestamp,
            },
            ...prev,
          ]);
        }
      }
    };

    room.on(RoomEvent.DataReceived, onDataReceived);
    return () => {
      room.off(RoomEvent.DataReceived, onDataReceived);
    };
  }, [room, triggerReaction]);

  // Actions
  const sendReaction = (emoji: string) => {
    if (!room?.localParticipant) return;
    const senderName = getParticipantDisplayName(room.localParticipant);
    const packet: LiveReactionPacket = {
      version: 1,
      type: "reaction",
      emoji,
      senderId: room.localParticipant.identity,
      senderName,
      timestamp: Date.now(),
    };
    try {
      room.localParticipant.publishData(encodeLivePacket(packet) as any, { reliable: true });
    } catch {}
    triggerReaction(emoji, "You");
  };

  const toggleHandRaise = () => {
    if (!room?.localParticipant) return;
    const myId = room.localParticipant.identity;
    const isCurrentlyRaised = raisedHands.has(myId);
    const nextState = !isCurrentlyRaised;
    setRaisedHands((prev) => {
      const next = new Set(prev);
      if (nextState) next.add(myId);
      else next.delete(myId);
      return next;
    });

    const packet: LiveHandRaisePacket = {
      version: 1,
      type: "hand_raise",
      senderId: myId,
      senderName: getParticipantDisplayName(room.localParticipant),
      timestamp: Date.now(),
    };
    try {
      room.localParticipant.publishData(encodeLivePacket(packet) as any, { reliable: true });
    } catch {}
  };

  const sendChatMessage = () => {
    if (!room?.localParticipant || !chatInput.trim()) return;
    const text = chatInput.trim();
    const senderName = getParticipantDisplayName(room.localParticipant);
    const packet: LiveChatPacket = {
      version: 1,
      type: "chat",
      text,
      senderId: room.localParticipant.identity,
      senderName,
      timestamp: Date.now(),
    };
    try {
      room.localParticipant.publishData(encodeLivePacket(packet) as any, { reliable: true });
    } catch {}
    setChatMessages((prev) => [
      ...prev,
      {
        id: `${packet.timestamp}-${Math.random()}`,
        senderName: "You",
        senderId: room.localParticipant.identity,
        text,
        timestamp: packet.timestamp,
        isMe: true,
      },
    ]);
    setChatInput("");
  };

  const handleAskQuestion = () => {
    if (!qaInput.trim() || !room?.localParticipant) return;
    const qItem: QAQuestion = {
      id: `q-${Date.now()}`,
      title: qaInput.trim(),
      senderName: getParticipantDisplayName(room.localParticipant),
      senderId: room.localParticipant.identity,
      upvotes: 1,
      isAnswered: false,
      timestamp: Date.now(),
    };
    setQaQuestions((prev) => [qItem, ...prev]);
    setQaInput("");

    const packet: LiveQAQueuePacket = {
      version: 1,
      type: "qa_queue",
      questionId: qItem.id,
      title: qItem.title,
      senderId: qItem.senderId,
      senderName: qItem.senderName,
      action: "ask",
      timestamp: Date.now(),
    };
    try {
      room.localParticipant.publishData(encodeLivePacket(packet) as any, { reliable: true });
    } catch {}
  };

  const handleVotePoll = (optionId: string) => {
    if (!activePoll || !activePoll.isOpen || activePoll.userVotedId) return;
    setActivePoll((curr) => {
      if (!curr) return null;
      return {
        ...curr,
        userVotedId: optionId,
        totalVotes: curr.totalVotes + 1,
        options: curr.options.map((o) => (o.id === optionId ? { ...o, votes: o.votes + 1 } : o)),
      };
    });
  };

  const handleLaunchNativePoll = (question: string, options: string[]) => {
    if (!question.trim() || !room?.localParticipant) return;
    const pollId = `poll-${Date.now()}`;
    const newP: ActivePoll = {
      id: pollId,
      question: question.trim(),
      options: options.map((opt, i) => ({ id: `opt-${i}`, text: opt.trim(), votes: 0 })),
      isOpen: true,
      totalVotes: 0,
    };
    setActivePoll(newP);

    const packet: LivePollPacket = {
      version: 1,
      type: "poll",
      pollId,
      question: newP.question,
      options: newP.options.map((o) => ({ id: o.id, text: o.text })),
      action: "start",
      timestamp: Date.now(),
    };
    try {
      room.localParticipant.publishData(encodeLivePacket(packet) as any, { reliable: true });
    } catch {}
  };

  // Screen share priority detection
  const screenShareTrack = useMemo(() => {
    return allTracks.find((t) => t.source === Track.Source.ScreenShare);
  }, [allTracks]);

  const cameraTracks = useMemo(() => {
    const list = allTracks.filter((t) => t.source === Track.Source.Camera);
    return [...list].sort((a, b) => {
      const aSpeaking = a.participant?.isSpeaking ? 1 : 0;
      const bSpeaking = b.participant?.isSpeaking ? 1 : 0;
      return bSpeaking - aSpeaking;
    });
  }, [allTracks]);

  // Auto switch to presentation mode if screen share begins
  useEffect(() => {
    if (screenShareTrack && navbarTab !== "presentation") {
      setNavbarTab("presentation");
    }
  }, [screenShareTrack, navbarTab]);

  const TILES_PER_PAGE = 8;
  const totalPages = Math.max(1, Math.ceil(cameraTracks.length / TILES_PER_PAGE));
  const currentPageTracks = cameraTracks.slice(page * TILES_PER_PAGE, (page + 1) * TILES_PER_PAGE);

  const handleCopyInviteLink = async () => {
    const inviteUrl = `https://skillbridge.app/live/${roomId}`;
    await Clipboard.setStringAsync(inviteUrl);
    setCopiedToast(true);
    setTimeout(() => setCopiedToast(false), 2500);
  };

  const handleLeave = async () => {
    try {
      if (room) await room.disconnect();
    } catch {}
    router.back();
  };

  const activeRaisedHandsCount = raisedHands.size;

  return (
    <View style={[s.viewContainer, { paddingTop: Math.max(insets.top, 10) }]}>
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 1. ADVANCED TOP NAVIGATION BAR                                      */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <View style={s.topNavbar}>
        {/* Left cluster */}
        <View style={s.navLeftCluster}>
          <Pressable onPress={handleLeave} style={s.navExitBtn}>
            <Text style={s.navExitBtnText}>←</Text>
          </Pressable>

          <View style={s.liveBadgePill}>
            <View style={s.liveDot} />
            <Text style={s.liveBadgeText}>LIVE</Text>
            <Text style={s.timerText}>{formatTimer(elapsedSeconds)}</Text>
          </View>
        </View>

        {/* Center: Interactive Stage Tabs */}
        <View style={s.navSegmentedTabs}>
          <Pressable
            onPress={() => setNavbarTab("stage")}
            style={navbarTab === "stage" ? s.navTabActive : s.navTab}
          >
            <Text style={navbarTab === "stage" ? s.navTabTextActive : s.navTabText}>🎥 Stage</Text>
          </Pressable>

          <Pressable
            onPress={() => setNavbarTab("presentation")}
            style={navbarTab === "presentation" ? s.navTabActive : s.navTab}
          >
            <Text style={navbarTab === "presentation" ? s.navTabTextActive : s.navTabText}>🖥️ Screen</Text>
          </Pressable>

          <Pressable
            onPress={() => setNavbarTab("whiteboard")}
            style={navbarTab === "whiteboard" ? s.navTabActive : s.navTab}
          >
            <Text style={navbarTab === "whiteboard" ? s.navTabTextActive : s.navTabText}>🎨 Board</Text>
          </Pressable>
        </View>

        {/* Right cluster */}
        <View style={s.navRightCluster}>
          <Pressable onPress={handleCopyInviteLink} style={s.navInviteBtn}>
            <Text style={s.navInviteBtnText}>🔗</Text>
          </Pressable>

          <Pressable onPress={() => setShowRoster(true)} style={s.navPeersBtn}>
            <Text style={s.navPeersBtnText}>👥 {participants.length}</Text>
          </Pressable>
        </View>
      </View>

      {/* Copy Invite Feedback Toast */}
      {copiedToast && (
        <View style={s.toastBanner}>
          <Text style={s.toastBannerText}>Invite link copied to clipboard!</Text>
        </View>
      )}

      {/* Hand Raised Priority Alert Banner */}
      {activeRaisedHandsCount > 0 && (
        <Pressable onPress={() => setShowRoster(true)} style={s.handRaiseAlertBanner}>
          <Text style={s.handRaiseAlertText}>
            ✋ {activeRaisedHandsCount} peer{activeRaisedHandsCount > 1 ? "s" : ""} raised hand — Tap to view
          </Text>
        </Pressable>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 2. MAIN VIEWPORT (STAGE / PRESENTATION / WHITEBOARD)                */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <View style={s.stage}>
        {navbarTab === "whiteboard" ? (
          <NativeWhiteboardPad />
        ) : navbarTab === "presentation" && screenShareTrack ? (
          // Presentation Stage
          <View style={s.screenShareContainer}>
            <View style={s.screenShareMain}>
              <VideoTrack trackRef={screenShareTrack as any} style={StyleSheet.absoluteFill} />
              <View style={s.screenShareTag}>
                <Text style={s.screenShareTagText}>
                  🖥️ {getParticipantDisplayName(screenShareTrack.participant)}'s Screen
                </Text>
              </View>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={s.screenStripScroll}
              contentContainerStyle={s.screenStripContent}
            >
              {currentPageTracks.map((tr, i) => (
                <View
                  key={`${tr.participant?.identity || i}-${tr.source}-${i}`}
                  style={s.stripTile}
                >
                  <NativeParticipantTile
                    trackRef={tr}
                    isHandRaised={raisedHands.has(tr.participant?.identity || "")}
                  />
                </View>
              ))}
            </ScrollView>
          </View>
        ) : (
          // Dynamic Adaptive Video Grid
          <View style={s.gridContainer}>
            <View style={s.gridRowWrap}>
              {currentPageTracks.map((tr, i) => (
                <View
                  key={`${tr.participant?.identity || i}-${tr.source}-${i}`}
                  style={[
                    s.gridCell,
                    currentPageTracks.length <= 1
                      ? s.gridCellFull
                      : currentPageTracks.length <= 2
                      ? s.gridCellHalf
                      : s.gridCellQuarter,
                  ]}
                >
                  <NativeParticipantTile
                    trackRef={tr}
                    isHandRaised={raisedHands.has(tr.participant?.identity || "")}
                  />
                </View>
              ))}
            </View>

            {totalPages > 1 && (
              <View style={s.paginationBar}>
                <Pressable
                  disabled={page === 0}
                  onPress={() => setPage((p) => Math.max(0, p - 1))}
                  style={s.pageNavBtn}
                >
                  <Text style={s.pageNavBtnText}>◀ Prev</Text>
                </Pressable>
                <Text style={s.pageIndicatorText}>
                  Page {page + 1} of {totalPages}
                </Text>
                <Pressable
                  disabled={page >= totalPages - 1}
                  onPress={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  style={s.pageNavBtn}
                >
                  <Text style={s.pageNavBtnText}>Next ▶</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* Floating Animated Emojis Layer */}
        {reactions.map((r) => {
          const translateY = r.anim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, -320],
          });
          const opacity = r.anim.interpolate({
            inputRange: [0, 0.15, 0.8, 1],
            outputRange: [0, 1, 1, 0],
          });
          const scale = r.anim.interpolate({
            inputRange: [0, 0.2, 0.85, 1],
            outputRange: [0.5, 1.25, 1.1, 0.8],
          });

          return (
            <Animated.View
              key={r.id}
              pointerEvents="none"
              style={[
                s.floatingReaction,
                {
                  left: `${r.xPercent}%`,
                  opacity,
                  transform: [{ translateY }, { scale }],
                },
              ]}
            >
              <Text style={s.floatingEmoji}>{r.emoji}</Text>
              <Text style={s.floatingSender} numberOfLines={1}>
                {r.senderName}
              </Text>
            </Animated.View>
          );
        })}
      </View>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 3. GLASSMORPHIC FLOATING CONTROLS DOCK                             */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <ModernNativeControls
        isHost={Boolean(creds.isHost)}
        isHandRaised={Boolean(
          room?.localParticipant && raisedHands.has(room.localParticipant.identity),
        )}
        onToggleHand={toggleHandRaise}
        showReactionsBar={showReactionsBar}
        onToggleReactionsBar={() => setShowReactionsBar((prev) => !prev)}
        onSendReaction={sendReaction}
        onOpenChat={() => setShowChatModal(true)}
        unreadChatCount={chatMessages.length}
        onOpenQA={() => setShowQAModal(true)}
        qaCount={qaQuestions.length}
        onOpenPoll={() => setShowPollModal(true)}
        hasActivePoll={Boolean(activePoll?.isOpen)}
        onOpenRoster={() => setShowRoster(true)}
        onOpenHostMenu={() => setShowHostModal(true)}
        onLeave={handleLeave}
      />

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 4. IN-CALL CHAT BOTTOM SHEET                                        */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <Modal
        visible={showChatModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowChatModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={s.modalBackdrop}
        >
          <View style={[s.modalSheet, { maxHeight: "80%", paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={s.sheetHandle} />
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>💬 In-Call Realtime Chat</Text>
              <Pressable onPress={() => setShowChatModal(false)} style={s.modalCloseBtn}>
                <Text style={s.modalCloseBtnText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView style={s.chatList} contentContainerStyle={{ paddingVertical: 10 }}>
              {chatMessages.length === 0 ? (
                <View style={s.emptyChatBox}>
                  <Text style={{ fontSize: 32, marginBottom: 6 }}>💬</Text>
                  <Text style={s.emptyChatTitle}>No messages yet</Text>
                  <Text style={s.emptyChatSub}>Send a message to everyone in the room</Text>
                </View>
              ) : (
                chatMessages.map((msg) => (
                  <View
                    key={msg.id}
                    style={[s.chatBubble, msg.isMe ? s.chatBubbleMe : s.chatBubbleOther]}
                  >
                    <Text style={s.chatSender}>{msg.senderName}</Text>
                    <Text style={s.chatText}>{msg.text}</Text>
                  </View>
                ))
              )}
            </ScrollView>

            <View style={s.chatInputRow}>
              <TextInput
                placeholder="Message in call…"
                placeholderTextColor="#64748B"
                value={chatInput}
                onChangeText={setChatInput}
                style={s.chatInput}
                onSubmitEditing={sendChatMessage}
                returnKeyType="send"
              />
              <Pressable onPress={sendChatMessage} style={s.chatSendBtn}>
                <Text style={s.chatSendBtnText}>Send</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 5. LIVE Q&A QUEUE MODAL                                             */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <Modal
        visible={showQAModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowQAModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={s.modalBackdrop}
        >
          <View style={[s.modalSheet, { maxHeight: "80%", paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={s.sheetHandle} />
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>❓ Classroom Q&A Queue</Text>
              <Pressable onPress={() => setShowQAModal(false)} style={s.modalCloseBtn}>
                <Text style={s.modalCloseBtnText}>✕</Text>
              </Pressable>
            </View>

            <View style={s.qaInputRow}>
              <TextInput
                placeholder="Ask the presenter a question…"
                placeholderTextColor="#64748B"
                value={qaInput}
                onChangeText={setQaInput}
                style={s.qaInput}
              />
              <Pressable onPress={handleAskQuestion} style={s.qaSendBtn}>
                <Text style={s.qaSendBtnText}>Ask</Text>
              </Pressable>
            </View>

            <ScrollView style={{ flex: 1, marginTop: 10 }}>
              {qaQuestions.map((q) => (
                <View key={q.id} style={s.qaItemCard}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                    <Text style={s.qaAuthorText}>{q.senderName}</Text>
                    {q.isAnswered ? (
                      <Text style={s.qaAnsweredBadge}>✓ Answered</Text>
                    ) : (
                      creds.isHost && (
                        <Pressable
                          onPress={() =>
                            setQaQuestions((prev) =>
                              prev.map((item) => (item.id === q.id ? { ...item, isAnswered: true } : item)),
                            )
                          }
                          style={s.qaMarkAnsweredBtn}
                        >
                          <Text style={s.qaMarkAnsweredText}>Mark Answered</Text>
                        </Pressable>
                      )
                    )}
                  </View>
                  <Text style={s.qaQuestionBody}>{q.title}</Text>
                  <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
                    <Pressable
                      onPress={() =>
                        setQaQuestions((prev) =>
                          prev.map((item) => (item.id === q.id ? { ...item, upvotes: item.upvotes + 1 } : item)),
                        )
                      }
                      style={s.qaUpvotePill}
                    >
                      <Text style={s.qaUpvoteText}>▲ Upvote ({q.upvotes})</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 6. LIVE POLLS MODAL                                                 */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <Modal
        visible={showPollModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowPollModal(false)}
      >
        <View style={s.modalBackdrop}>
          <View style={[s.modalSheet, { maxHeight: "75%", paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={s.sheetHandle} />
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>📊 Interactive Live Polls</Text>
              <Pressable onPress={() => setShowPollModal(false)} style={s.modalCloseBtn}>
                <Text style={s.modalCloseBtnText}>✕</Text>
              </Pressable>
            </View>

            {creds.isHost && (
              <Pressable
                onPress={() => {
                  handleLaunchNativePoll("Is this concept clear so far?", [
                    "Yes, 100% clear",
                    "Need more examples",
                    "Let's review later",
                  ]);
                }}
                style={s.nativeCreatePollBtn}
              >
                <Text style={s.nativeCreatePollBtnText}>➕ Host: Launch Live Poll</Text>
              </Pressable>
            )}

            {activePoll ? (
              <View style={s.nativePollCard}>
                <Text style={s.nativePollQuestion}>{activePoll.question}</Text>
                <Text style={s.nativePollVotes}>{activePoll.totalVotes} total votes</Text>

                <View style={{ gap: 8, marginTop: 12 }}>
                  {activePoll.options.map((opt) => {
                    const pct =
                      activePoll.totalVotes > 0
                        ? Math.round((opt.votes / activePoll.totalVotes) * 100)
                        : 0;
                    const hasVoted = activePoll.userVotedId === opt.id;

                    return (
                      <Pressable
                        key={opt.id}
                        onPress={() => handleVotePoll(opt.id)}
                        disabled={Boolean(activePoll.userVotedId)}
                        style={[
                          s.nativePollOption,
                          hasVoted && { borderColor: "#38BDF8", backgroundColor: "rgba(56, 189, 248, 0.12)" },
                        ]}
                      >
                        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                          <Text style={s.nativePollOptionText}>
                            {hasVoted ? "✓ " : ""}
                            {opt.text}
                          </Text>
                          <Text style={s.nativePollOptionPct}>{pct}%</Text>
                        </View>
                        <View style={s.nativePollBarTrack}>
                          <View style={[s.nativePollBarFill, { width: `${pct}%` }]} />
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : (
              <View style={s.emptyChatBox}>
                <Text style={{ fontSize: 32, marginBottom: 6 }}>📊</Text>
                <Text style={s.emptyChatTitle}>No Active Poll</Text>
                <Text style={s.emptyChatSub}>The host will launch a poll during lecture</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 7. PARTICIPANTS ROSTER MODAL                                        */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <Modal visible={showRoster} animationType="slide" transparent onRequestClose={() => setShowRoster(false)}>
        <View style={s.modalBackdrop}>
          <View style={[s.modalSheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={s.sheetHandle} />
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>👥 Participants ({participants.length})</Text>
              <Pressable onPress={() => setShowRoster(false)} style={s.modalCloseBtn}>
                <Text style={s.modalCloseBtnText}>✕</Text>
              </Pressable>
            </View>

            {creds.isHost && (
              <Pressable
                onPress={async () => {
                  try {
                    await api(`/live/rooms/${creds.sessionId}/mute-all`, { method: "POST" });
                    Alert.alert("Host Action", "All participants muted.");
                  } catch (e: any) {
                    Alert.alert("Error", e.message);
                  }
                }}
                style={s.muteAllBanner}
              >
                <Text style={s.muteAllBannerText}>🔇 Mute All Participants</Text>
              </Pressable>
            )}

            <TextInput
              placeholder="Search peers…"
              placeholderTextColor="#64748B"
              value={rosterSearch}
              onChangeText={setRosterSearch}
              style={s.searchBar}
            />

            <ScrollView style={{ flex: 1 }}>
              {participants
                .filter((p) =>
                  rosterSearch
                    ? getParticipantDisplayName(p).toLowerCase().includes(rosterSearch.toLowerCase())
                    : true,
                )
                .map((p) => {
                  const isLocal = p.identity === room?.localParticipant?.identity;
                  const name = getParticipantDisplayName(p);
                  const isMicMuted = p.isMicrophoneEnabled === false;
                  const hasHandRaised = raisedHands.has(p.identity);

                  return (
                    <View key={p.identity} style={s.peerRow}>
                      <View style={s.peerAvatar}>
                        <Text style={s.peerAvatarText}>{(name[0] || "?").toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={s.peerName} numberOfLines={1}>
                          {name} {isLocal && "(You)"}
                        </Text>
                        <Text style={s.peerStatus}>
                          {hasHandRaised ? "✋ Hand Raised" : p.isSpeaking ? "🗣️ Speaking" : isMicMuted ? "Muted" : "Active"}
                        </Text>
                      </View>

                      <Text style={{ marginRight: 6 }}>{isMicMuted ? "🔇" : "🎤"}</Text>

                      {creds.isHost && !isLocal && (
                        <View style={{ flexDirection: "row", gap: 6 }}>
                          <Pressable
                            onPress={async () => {
                              try {
                                await api(`/live/rooms/${creds.sessionId}/mute-participant`, {
                                  method: "POST",
                                  body: JSON.stringify({ participantIdentity: p.identity, mute: true }),
                                });
                              } catch {}
                            }}
                            style={s.tinyActionBtn}
                          >
                            <Text style={s.tinyActionText}>Mute</Text>
                          </Pressable>
                          <Pressable
                            onPress={async () => {
                              Alert.alert("Remove Participant", `Remove ${name}?`, [
                                { text: "Cancel", style: "cancel" },
                                {
                                  text: "Remove",
                                  style: "destructive",
                                  onPress: async () => {
                                    try {
                                      await api(`/live/rooms/${creds.sessionId}/remove-participant`, {
                                        method: "POST",
                                        body: JSON.stringify({ participantIdentity: p.identity }),
                                      });
                                    } catch {}
                                  },
                                },
                              ]);
                            }}
                            style={s.tinyDangerBtn}
                          >
                            <Text style={s.tinyDangerText}>Remove</Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  );
                })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 8. HOST CONTROLS MODAL                                              */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <Modal visible={showHostModal} animationType="fade" transparent onRequestClose={() => setShowHostModal(false)}>
        <View style={s.modalBackdropCenter}>
          <View style={s.hostModalCard}>
            <Text style={s.hostModalTitle}>🛡️ Host Management</Text>
            <Pressable
              onPress={async () => {
                setShowHostModal(false);
                try {
                  await api(`/live/rooms/${creds.sessionId}/mute-all`, { method: "POST" });
                  Alert.alert("Host Action", "All participants muted.");
                } catch (e: any) {
                  Alert.alert("Error", e.message);
                }
              }}
              style={s.hostMenuBtn}
            >
              <Text style={s.hostMenuBtnText}>🔇 Mute All Participants</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setShowHostModal(false);
                handleCopyInviteLink();
              }}
              style={s.hostMenuBtn}
            >
              <Text style={s.hostMenuBtnText}>🔗 Copy Invite Link</Text>
            </Pressable>

            <View style={s.modalDivider} />

            <Pressable
              onPress={() => {
                setShowHostModal(false);
                Alert.alert("End Meeting", "Are you sure you want to end this session for everyone?", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "End Meeting For All",
                    style: "destructive",
                    onPress: async () => {
                      try {
                        await api(`/live/rooms/${creds.sessionId}/end`, { method: "POST" });
                        if (room) await room.disconnect();
                        router.back();
                      } catch {}
                    },
                  },
                ]);
              }}
              style={[s.hostMenuBtn, { backgroundColor: "rgba(239, 68, 68, 0.15)" }]}
            >
              <Text style={[s.hostMenuBtnText, { color: "#EF4444" }]}>⏹️ End Meeting For All</Text>
            </Pressable>

            <Pressable onPress={() => setShowHostModal(false)} style={s.cancelModalBtn}>
              <Text style={s.cancelModalBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Native Participant Tile
// ─────────────────────────────────────────────────────────────────────────────
function NativeParticipantTile({
  trackRef,
  isHandRaised,
}: {
  trackRef: any;
  isHandRaised?: boolean;
}) {
  const p = trackRef?.participant;
  const isVideoPublished =
    trackRef?.publication &&
    !trackRef.publication.isMuted &&
    trackRef.source === Track.Source.Camera;
  const isSpeaking = p?.isSpeaking;
  const isMicMuted = p?.isMicrophoneEnabled === false;
  const name = getParticipantDisplayName(p);

  return (
    <View
      style={[
        s.tileContainer,
        isSpeaking && { borderColor: "#10B981", borderWidth: 2 },
        isHandRaised && { borderColor: "#F59E0B", borderWidth: 2 },
      ]}
    >
      {isVideoPublished ? (
        <VideoTrack trackRef={trackRef} style={StyleSheet.absoluteFill} />
      ) : (
        <View style={s.avatarBox}>
          <View style={s.avatarCircle}>
            <Text style={s.avatarLetter}>{(name[0] || "?").toUpperCase()}</Text>
          </View>
          <Text style={s.avatarName} numberOfLines={1}>
            {name}
          </Text>
        </View>
      )}

      {/* Floating Hand Raise Badge */}
      {isHandRaised && (
        <View style={s.handRaisedBadge}>
          <Text style={{ fontSize: 16 }}>✋</Text>
        </View>
      )}

      {/* Bottom Nameplate */}
      <View style={s.tileBadge}>
        <Text style={s.tileBadgeName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={{ fontSize: 10 }}>{isMicMuted ? "🔇" : isSpeaking ? "🗣️" : "🎤"}</Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Native Controls Toolbar
// ─────────────────────────────────────────────────────────────────────────────
function ModernNativeControls({
  isHost,
  isHandRaised,
  onToggleHand,
  showReactionsBar,
  onToggleReactionsBar,
  onSendReaction,
  onOpenChat,
  unreadChatCount,
  onOpenQA,
  qaCount,
  onOpenPoll,
  hasActivePoll,
  onOpenRoster,
  onOpenHostMenu,
  onLeave,
}: {
  isHost: boolean;
  isHandRaised: boolean;
  onToggleHand: () => void;
  showReactionsBar: boolean;
  onToggleReactionsBar: () => void;
  onSendReaction: (emoji: string) => void;
  onOpenChat: () => void;
  unreadChatCount: number;
  onOpenQA: () => void;
  qaCount: number;
  onOpenPoll: () => void;
  hasActivePoll: boolean;
  onOpenRoster: () => void;
  onOpenHostMenu: () => void;
  onLeave: () => void;
}) {
  const insets = useSafeAreaInsets();
  const room = useRoomContext();
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [sharing, setSharing] = useState(false);

  const toggleMic = async () => {
    try {
      const next = !mic;
      await room?.localParticipant?.setMicrophoneEnabled(next);
      setMic(next);
    } catch {}
  };

  const toggleCam = async () => {
    try {
      const next = !cam;
      await room?.localParticipant?.setCameraEnabled(next);
      setCam(next);
    } catch {}
  };

  const flipCam = async () => {
    try {
      const camTrack = room?.localParticipant?.getTrackPublication(Track.Source.Camera)?.videoTrack;
      if (camTrack && typeof (camTrack as any).switchCamera === "function") {
        await (camTrack as any).switchCamera();
      }
    } catch {}
  };

  const toggleShare = async () => {
    try {
      const next = !sharing;
      await room?.localParticipant?.setScreenShareEnabled(next);
      setSharing(next);
    } catch (e: any) {
      Alert.alert("Screen Share", e.message || "Could not toggle screen share.");
    }
  };

  return (
    <View style={[s.controlsWrapper, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      {/* Floating Reactions Bar */}
      {showReactionsBar && (
        <View style={s.reactionsBarPill}>
          {["👍", "❤️", "😂", "😮", "👏", "🔥", "🎉", "💡"].map((emoji) => (
            <Pressable
              key={emoji}
              onPress={() => {
                onSendReaction(emoji);
                onToggleReactionsBar();
              }}
              style={s.reactionEmojiBtn}
            >
              <Text style={s.reactionEmojiText}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.controlsPill}
      >
        <Pressable onPress={toggleMic} style={mic ? s.ctrlBtn : s.ctrlBtnMuted}>
          <Text style={s.ctrlIcon}>{mic ? "🎤" : "🔇"}</Text>
          <Text style={mic ? s.ctrlLabel : s.ctrlLabelMuted}>{mic ? "Mute" : "Unmute"}</Text>
        </Pressable>

        <Pressable onPress={toggleCam} style={cam ? s.ctrlBtn : s.ctrlBtnMuted}>
          <Text style={s.ctrlIcon}>{cam ? "📹" : "📷"}</Text>
          <Text style={cam ? s.ctrlLabel : s.ctrlLabelMuted}>{cam ? "Stop" : "Start"}</Text>
        </Pressable>

        {cam && (
          <Pressable onPress={flipCam} style={s.ctrlBtn}>
            <Text style={s.ctrlIcon}>🔄</Text>
            <Text style={s.ctrlLabel}>Flip</Text>
          </Pressable>
        )}

        <Pressable onPress={onToggleHand} style={isHandRaised ? s.ctrlBtnRaised : s.ctrlBtn}>
          <Text style={s.ctrlIcon}>✋</Text>
          <Text style={isHandRaised ? s.ctrlLabelRaised : s.ctrlLabel}>
            {isHandRaised ? "Lower" : "Raise"}
          </Text>
        </Pressable>

        <Pressable onPress={onToggleReactionsBar} style={showReactionsBar ? s.ctrlBtnActive : s.ctrlBtn}>
          <Text style={s.ctrlIcon}>✨</Text>
          <Text style={showReactionsBar ? s.ctrlLabelActive : s.ctrlLabel}>React</Text>
        </Pressable>

        <Pressable onPress={onOpenChat} style={s.ctrlBtn}>
          <View>
            <Text style={s.ctrlIcon}>💬</Text>
            {unreadChatCount > 0 && (
              <View style={s.chatCountBadge}>
                <Text style={s.chatCountBadgeText}>{unreadChatCount > 9 ? "9+" : unreadChatCount}</Text>
              </View>
            )}
          </View>
          <Text style={s.ctrlLabel}>Chat</Text>
        </Pressable>

        <Pressable onPress={onOpenQA} style={s.ctrlBtn}>
          <View>
            <Text style={s.ctrlIcon}>❓</Text>
            {qaCount > 0 && (
              <View style={s.chatCountBadge}>
                <Text style={s.chatCountBadgeText}>{qaCount}</Text>
              </View>
            )}
          </View>
          <Text style={s.ctrlLabel}>Q&A</Text>
        </Pressable>

        <Pressable onPress={onOpenPoll} style={s.ctrlBtn}>
          <View>
            <Text style={s.ctrlIcon}>📊</Text>
            {hasActivePoll && <View style={s.activePollDot} />}
          </View>
          <Text style={s.ctrlLabel}>Polls</Text>
        </Pressable>

        <Pressable onPress={toggleShare} style={sharing ? s.ctrlBtnActive : s.ctrlBtn}>
          <Text style={s.ctrlIcon}>🖥️</Text>
          <Text style={sharing ? s.ctrlLabelActive : s.ctrlLabel}>{sharing ? "Stop" : "Share"}</Text>
        </Pressable>

        <Pressable onPress={onOpenRoster} style={s.ctrlBtn}>
          <Text style={s.ctrlIcon}>👥</Text>
          <Text style={s.ctrlLabel}>Peers</Text>
        </Pressable>

        {isHost && (
          <Pressable onPress={onOpenHostMenu} style={s.ctrlBtn}>
            <Text style={s.ctrlIcon}>🛡️</Text>
            <Text style={s.ctrlLabel}>Host</Text>
          </Pressable>
        )}

        <Pressable onPress={onLeave} style={s.leaveBtn}>
          <Text style={s.leaveBtnText}>Leave</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Native Touch Whiteboard Pad
// ─────────────────────────────────────────────────────────────────────────────
function NativeWhiteboardPad() {
  const [lines, setLines] = useState<{ id: string; points: { x: number; y: number }[]; color: string }[]>([]);
  const [currentColor, setCurrentColor] = useState("#38BDF8");

  const handleTouchStart = (evt: any) => {
    const { locationX, locationY } = evt.nativeEvent;
    const newLine = {
      id: `line-${Date.now()}`,
      points: [{ x: locationX, y: locationY }],
      color: currentColor,
    };
    setLines((prev) => [...prev, newLine]);
  };

  const handleTouchMove = (evt: any) => {
    const { locationX, locationY } = evt.nativeEvent;
    setLines((prev) => {
      if (prev.length === 0) return prev;
      const lastIndex = prev.length - 1;
      const last = prev[lastIndex];
      const updated = {
        ...last,
        points: [...last.points, { x: locationX, y: locationY }],
      };
      const copy = [...prev];
      copy[lastIndex] = updated;
      return copy;
    });
  };

  return (
    <View style={s.nativeWbContainer}>
      <View style={s.nativeWbToolbar}>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          {["#38BDF8", "#10B981", "#F59E0B", "#F43F5E", "#FFFFFF"].map((col) => (
            <Pressable
              key={col}
              onPress={() => setCurrentColor(col)}
              style={[
                s.nativeColorPill,
                { backgroundColor: col },
                currentColor === col && { borderColor: "#FFFFFF", borderWidth: 2 },
              ]}
            />
          ))}
        </View>

        <Pressable onPress={() => setLines([])} style={s.nativeClearBtn}>
          <Text style={s.nativeClearBtnText}>🗑️ Clear</Text>
        </Pressable>
      </View>

      <View
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        style={s.nativeCanvasArea}
      >
        {lines.map((l) => (
          <React.Fragment key={l.id}>
            {l.points.map((pt, idx) => (
              <View
                key={`${l.id}-${idx}`}
                style={{
                  position: "absolute",
                  left: pt.x - 3,
                  top: pt.y - 3,
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: l.color,
                }}
              />
            ))}
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stylesheet
// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#070A12" },
  centerScreen: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#070A12",
    padding: 24,
  },
  connectingTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
    marginTop: 16,
  },
  connectingSub: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 4,
  },
  errorBox: {
    backgroundColor: "#0B1120",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 360,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  errorTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 6,
  },
  errorSub: {
    color: "#94A3B8",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 18,
  },
  errorBtnRow: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
  },
  btnPrimary: {
    backgroundColor: "#0284C7",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  btnPrimaryText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 13,
  },
  btnSecondary: {
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  btnSecondaryText: {
    color: "#E2E8F0",
    fontWeight: "600",
    fontSize: 13,
  },
  viewContainer: {
    flex: 1,
    backgroundColor: "#070A12",
  },
  topNavbar: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    backgroundColor: "rgba(11, 17, 32, 0.9)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  navLeftCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  navExitBtn: {
    padding: 6,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 8,
  },
  navExitBtnText: {
    color: "#E2E8F0",
    fontSize: 16,
    fontWeight: "700",
  },
  liveBadgePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.35)",
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#EF4444",
  },
  liveBadgeText: {
    color: "#EF4444",
    fontSize: 10,
    fontWeight: "800",
  },
  timerText: {
    color: "#F8FAFC",
    fontSize: 10,
    fontWeight: "700",
    marginLeft: 2,
  },
  navSegmentedTabs: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.06)",
    padding: 2,
    borderRadius: 12,
  },
  navTab: {
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  navTabActive: {
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: "#0284C7",
  },
  navTabText: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "600",
  },
  navTabTextActive: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  navRightCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  navInviteBtn: {
    backgroundColor: "rgba(56, 189, 248, 0.15)",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.3)",
  },
  navInviteBtnText: {
    color: "#38BDF8",
    fontSize: 12,
  },
  navPeersBtn: {
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  navPeersBtnText: {
    color: "#E2E8F0",
    fontSize: 11,
    fontWeight: "600",
  },
  toastBanner: {
    position: "absolute",
    top: 60,
    alignSelf: "center",
    backgroundColor: "#0284C7",
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
    zIndex: 100,
  },
  toastBannerText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  handRaiseAlertBanner: {
    backgroundColor: "#D97706",
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  handRaiseAlertText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  stage: {
    flex: 1,
    padding: 6,
  },
  screenShareContainer: {
    flex: 1,
  },
  screenShareMain: {
    flex: 1,
    backgroundColor: "#000000",
    borderRadius: 14,
    overflow: "hidden",
    position: "relative",
  },
  screenShareTag: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "rgba(11, 17, 32, 0.85)",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  screenShareTagText: {
    color: "#38BDF8",
    fontSize: 11,
    fontWeight: "600",
  },
  screenStripScroll: {
    height: 96,
    marginTop: 6,
  },
  screenStripContent: {
    gap: 6,
  },
  stripTile: {
    width: 120,
    height: "100%",
  },
  gridContainer: {
    flex: 1,
  },
  gridRowWrap: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  gridCell: {
    borderRadius: 12,
    overflow: "hidden",
  },
  gridCellFull: {
    width: "100%",
    height: "100%",
  },
  gridCellHalf: {
    width: "100%",
    height: "48%",
  },
  gridCellQuarter: {
    width: "48%",
    height: "31%",
  },
  tileContainer: {
    flex: 1,
    backgroundColor: "#0B1120",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  avatarBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0B1120",
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(56, 189, 248, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.3)",
    marginBottom: 6,
  },
  avatarLetter: {
    color: "#38BDF8",
    fontSize: 20,
    fontWeight: "700",
  },
  avatarName: {
    color: "#E2E8F0",
    fontSize: 11,
    fontWeight: "600",
  },
  handRaisedBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(245, 158, 11, 0.95)",
    borderRadius: 14,
    padding: 4,
    zIndex: 10,
  },
  tileBadge: {
    position: "absolute",
    bottom: 6,
    left: 6,
    backgroundColor: "rgba(11, 17, 32, 0.85)",
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tileBadgeName: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "600",
    maxWidth: 90,
  },
  paginationBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 4,
  },
  pageNavBtn: {
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  pageNavBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
  },
  pageIndicatorText: {
    color: "#94A3B8",
    fontSize: 11,
  },
  controlsWrapper: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  controlsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(11, 17, 32, 0.95)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  ctrlBtn: {
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  ctrlBtnMuted: {
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: "rgba(239, 68, 68, 0.18)",
  },
  ctrlBtnActive: {
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: "rgba(56, 189, 248, 0.2)",
  },
  ctrlBtnRaised: {
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: "rgba(245, 158, 11, 0.25)",
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
  ctrlIcon: {
    fontSize: 15,
  },
  ctrlLabel: {
    color: "#E2E8F0",
    fontSize: 9,
    marginTop: 2,
    fontWeight: "600",
  },
  ctrlLabelMuted: {
    color: "#EF4444",
    fontSize: 9,
    marginTop: 2,
    fontWeight: "600",
  },
  ctrlLabelActive: {
    color: "#38BDF8",
    fontSize: 9,
    marginTop: 2,
    fontWeight: "600",
  },
  ctrlLabelRaised: {
    color: "#F59E0B",
    fontSize: 9,
    marginTop: 2,
    fontWeight: "700",
  },
  leaveBtn: {
    backgroundColor: "#DC2626",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginLeft: 4,
  },
  leaveBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  activePollDot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#38BDF8",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#0B1120",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignSelf: "center",
    marginBottom: 12,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  modalTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  modalCloseBtn: {
    padding: 6,
  },
  modalCloseBtnText: {
    color: "#94A3B8",
    fontSize: 14,
  },
  chatList: {
    flex: 1,
    width: "100%",
  },
  emptyChatBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 36,
  },
  emptyChatTitle: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  emptyChatSub: {
    color: "#64748B",
    fontSize: 12,
    textAlign: "center",
  },
  chatBubble: {
    maxWidth: "82%",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    marginBottom: 8,
  },
  chatBubbleMe: {
    alignSelf: "flex-end",
    backgroundColor: "#0284C7",
    borderBottomRightRadius: 2,
  },
  chatBubbleOther: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderBottomLeftRadius: 2,
  },
  chatSender: {
    color: "#93C5FD",
    fontSize: 10,
    fontWeight: "700",
    marginBottom: 2,
  },
  chatText: {
    color: "#FFFFFF",
    fontSize: 13,
    lineHeight: 18,
  },
  chatInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
  },
  chatInput: {
    flex: 1,
    backgroundColor: "#1E293B",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    color: "#FFFFFF",
    fontSize: 13,
  },
  chatSendBtn: {
    backgroundColor: "#10B981",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
  },
  chatSendBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  qaInputRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  qaInput: {
    flex: 1,
    backgroundColor: "#1E293B",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: "#FFFFFF",
    fontSize: 13,
  },
  qaSendBtn: {
    backgroundColor: "#38BDF8",
    paddingHorizontal: 14,
    justifyContent: "center",
    borderRadius: 12,
  },
  qaSendBtnText: {
    color: "#080C16",
    fontWeight: "700",
    fontSize: 12,
  },
  qaItemCard: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  qaAuthorText: {
    color: "#38BDF8",
    fontSize: 11,
    fontWeight: "700",
  },
  qaAnsweredBadge: {
    color: "#10B981",
    fontSize: 10,
    fontWeight: "700",
  },
  qaMarkAnsweredBtn: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  qaMarkAnsweredText: {
    color: "#10B981",
    fontSize: 10,
    fontWeight: "600",
  },
  qaQuestionBody: {
    color: "#F8FAFC",
    fontSize: 13,
    lineHeight: 18,
    marginVertical: 4,
  },
  qaUpvotePill: {
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  qaUpvoteText: {
    color: "#E2E8F0",
    fontSize: 11,
    fontWeight: "600",
  },
  nativePollCard: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  nativePollQuestion: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  nativePollVotes: {
    color: "#94A3B8",
    fontSize: 11,
    marginTop: 2,
  },
  nativePollOption: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  nativePollOptionText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  nativePollOptionPct: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "700",
  },
  nativePollBarTrack: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 2,
    marginTop: 6,
    overflow: "hidden",
  },
  nativePollBarFill: {
    height: "100%",
    backgroundColor: "#38BDF8",
    borderRadius: 2,
  },
  muteAllBanner: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 10,
  },
  muteAllBannerText: {
    color: "#EF4444",
    fontSize: 12,
    fontWeight: "700",
  },
  searchBar: {
    backgroundColor: "#1E293B",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: "#FFFFFF",
    fontSize: 12,
    marginBottom: 12,
  },
  peerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  peerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(56, 189, 248, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  peerAvatarText: {
    color: "#38BDF8",
    fontSize: 13,
    fontWeight: "700",
  },
  peerName: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  peerStatus: {
    color: "#94A3B8",
    fontSize: 10,
  },
  tinyActionBtn: {
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  tinyActionText: {
    color: "#E2E8F0",
    fontSize: 10,
  },
  tinyDangerBtn: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  tinyDangerText: {
    color: "#EF4444",
    fontSize: 10,
  },
  modalBackdropCenter: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  hostModalCard: {
    backgroundColor: "#0B1120",
    borderRadius: 20,
    padding: 20,
    width: "100%",
    maxWidth: 320,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  hostModalTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 14,
    textAlign: "center",
  },
  hostMenuBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginBottom: 8,
  },
  hostMenuBtnText: {
    color: "#F8FAFC",
    fontSize: 12,
    fontWeight: "600",
  },
  modalDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginVertical: 6,
  },
  cancelModalBtn: {
    alignItems: "center",
    paddingVertical: 10,
    marginTop: 4,
  },
  cancelModalBtnText: {
    color: "#94A3B8",
    fontSize: 12,
  },
  floatingReaction: {
    position: "absolute",
    bottom: 30,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 99,
  },
  floatingEmoji: {
    fontSize: 38,
  },
  floatingSender: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 2,
  },
  reactionsBarPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(11, 17, 32, 0.95)",
    borderRadius: 28,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 8,
    alignSelf: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
  },
  reactionEmojiBtn: {
    padding: 4,
    borderRadius: 14,
  },
  reactionEmojiText: {
    fontSize: 22,
  },
  chatCountBadge: {
    position: "absolute",
    top: -4,
    right: -6,
    backgroundColor: "#10B981",
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  chatCountBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
  },
  nativeWbContainer: {
    flex: 1,
    backgroundColor: "#0B1120",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  nativeWbToolbar: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    backgroundColor: "rgba(15, 23, 42, 0.9)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  nativeColorPill: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  nativeClearBtn: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  nativeClearBtnText: {
    color: "#EF4444",
    fontSize: 11,
    fontWeight: "700",
  },
  nativeCanvasArea: {
    flex: 1,
    backgroundColor: "#0B1120",
  },
  nativeCreatePollBtn: {
    backgroundColor: "rgba(56, 189, 248, 0.15)",
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.3)",
  },
  nativeCreatePollBtnText: {
    color: "#38BDF8",
    fontSize: 12,
    fontWeight: "700",
  },
});
