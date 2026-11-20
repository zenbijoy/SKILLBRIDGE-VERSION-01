import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useLocalSearchParams, router } from "expo-router";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  useRoomContext,
  useTracks,
  useParticipants,
  useLocalParticipant,
} from "@livekit/components-react";
import { Track, RoomEvent, Participant } from "livekit-client";
import "@livekit/components-styles";
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
import { useLocalRecorder } from "./useLocalRecorder";

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

interface FloatingEmoji {
  id: string;
  emoji: string;
  senderName: string;
  xPercent: number;
}

type NavbarView = "stage" | "presentation" | "whiteboard";
type SidebarTab = "chat" | "qa" | "polls" | "roster" | "settings";

// ─────────────────────────────────────────────────────────────────────────────
// Root Container (Handles Auth, Fallback & LiveKit Room Provider)
// ─────────────────────────────────────────────────────────────────────────────
export default function LiveRoomScreenWeb() {
  const { roomId, sessionId } = useLocalSearchParams<{ roomId: string; sessionId?: string }>();
  const [creds, setCreds] = useState<LiveCreds | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permGranted, setPermGranted] = useState<boolean | null>(null);

  // Browser media permissions check
  const requestMediaPermissions = useCallback(async () => {
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        stream.getTracks().forEach((track) => track.stop());
        setPermGranted(true);
      } catch (err: any) {
        console.warn("Media permissions check:", err?.message || err);
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          audioStream.getTracks().forEach((track) => track.stop());
          setPermGranted(true);
        } catch {
          setPermGranted(false);
        }
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
      .then((data: LiveCreds) => {
        setCreds(data);
        setLoading(false);
      })
      .catch((e: any) => {
        const msg = e.message || "Failed to join live room";
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
    const cleanRoomId = roomId ? roomId.replace(/^qa-stage-/, "") : "";
    if (!cleanRoomId) {
      fetchToken();
      return;
    }
    try {
      await api(`/rooms/${cleanRoomId}/join`, { method: "POST" });
      fetchToken();
    } catch (joinErr: any) {
      const msg = joinErr?.message || "";
      if (
        msg.toLowerCase().includes("approval") ||
        msg.toLowerCase().includes("knock") ||
        msg.toLowerCase().includes("private") ||
        msg.toLowerCase().includes("invit")
      ) {
        window.alert("This room requires host approval. Please request access from the room lobby.");
        router.replace(`/room/${cleanRoomId}` as any);
      } else {
        setError(msg || "Failed to join room");
      }
    }
  }, [roomId, fetchToken]);

  useEffect(() => {
    void requestMediaPermissions();
    fetchToken();
  }, [fetchToken, requestMediaPermissions]);

  if (loading) {
    return (
      <div style={styles.centerContainer}>
        <div style={styles.spinner} />
        <h3 style={styles.title}>Connecting to Live Space…</h3>
        <p style={styles.subtitle}>Configuring secure WebRTC audio and video pipeline</p>
      </div>
    );
  }

  if (error || !creds) {
    const isMembershipError =
      error?.toLowerCase().includes("join") ||
      error?.toLowerCase().includes("learning room") ||
      error?.toLowerCase().includes("membership");

    return (
      <div style={styles.centerContainer}>
        <div style={styles.card}>
          <div style={{ fontSize: "40px", marginBottom: "14px" }}>🛰️</div>
          <h2 style={styles.cardHeading}>Live Connection Notice</h2>
          <p style={styles.cardSub}>
            {error || "Could not retrieve access credentials for this live room."}
          </p>
          <div style={styles.actionRow}>
            <button onClick={() => router.back()} style={styles.btnSecondary}>
              Go Back
            </button>
            {isMembershipError && roomId ? (
              <button onClick={joinAndRetry} style={{ ...styles.btnPrimary, backgroundColor: "#10B981" }}>
                Join Room & Enter
              </button>
            ) : (
              <button onClick={fetchToken} style={styles.btnPrimary}>
                Retry Connection
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // WebRTC fallback mode
  if (creds.provider === "webrtc" || !creds.url) {
    return (
      <RoomLiveStage
        roomId={roomId || creds.sessionId || ""}
        roomTitle={creds.roomName || "Live Interactive Room"}
        currentUserId={creds.participantName || "user"}
        currentUserName={creds.participantName || "Member"}
        currentUserRole={creds.role || "member"}
        isHost={Boolean(creds.isHost)}
        onLeave={() => router.back()}
      />
    );
  }

  return (
    <div style={styles.container}>
      <LiveKitRoom
        video={true}
        audio={true}
        token={creds.token}
        serverUrl={creds.url}
        connect={true}
        data-lk-theme="default"
        options={{
          adaptiveStream: true,
          dynacast: true,
        }}
        style={{ height: "100vh", width: "100vw", display: "flex", flexDirection: "column" }}
        onDisconnected={() => {
          router.back();
        }}
      >
        <ModernLiveMeetingView
          creds={creds}
          roomId={roomId || creds.sessionId || ""}
          permGranted={permGranted}
          onRequestPerms={requestMediaPermissions}
        />
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Redesigned Modern Live Meeting View
// ─────────────────────────────────────────────────────────────────────────────
function ModernLiveMeetingView({
  creds,
  roomId,
  permGranted,
  onRequestPerms,
}: {
  creds: LiveCreds;
  roomId: string;
  permGranted: boolean | null;
  onRequestPerms: () => Promise<void>;
}) {
  const room = useRoomContext();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } =
    useLocalParticipant();
  const participants = useParticipants();

  // Tracks query
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  // Navigation & View States
  const [navbarView, setNavbarView] = useState<NavbarView>("stage");
  const [sidebarTab, setSidebarTab] = useState<SidebarTab | null>("chat");
  const [layoutMode, setLayoutMode] = useState<"grid" | "spotlight">("grid");
  const [spotlightId, setSpotlightId] = useState<string | null>(null);

  // Live Timer
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Realtime States
  const [copiedToast, setCopiedToast] = useState(false);
  const [showReactionsBar, setShowReactionsBar] = useState(false);
  const [showHostMenu, setShowHostMenu] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [raisedHands, setRaisedHands] = useState<Set<string>>(new Set());
  const [reactions, setReactions] = useState<FloatingEmoji[]>([]);
  const [page, setPage] = useState(0);

  // In-Call Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // Q&A Hub State
  const [qaQuestions, setQaQuestions] = useState<QAQuestion[]>([
    {
      id: "demo-q1",
      title: "Could you please explain how LiveKit dynacast optimizes multi-user video feeds?",
      senderName: "Devin",
      senderId: "devin-1",
      upvotes: 4,
      isAnswered: false,
      timestamp: Date.now() - 120000,
    },
  ]);
  const [qaInput, setQaInput] = useState("");

  // Live Poll State
  const [activePoll, setActivePoll] = useState<ActivePoll | null>({
    id: "poll-active-1",
    question: "Do you prefer Dynamic Auto-Grid or Spotlight presenter layout?",
    options: [
      { id: "opt-1", text: "Dynamic Auto-Grid (Equal tiles)", votes: 6 },
      { id: "opt-2", text: "Spotlight Presenter (Focus speaker)", votes: 9 },
      { id: "opt-3", text: "Collaborative Whiteboard mode", votes: 4 },
    ],
    isOpen: true,
    totalVotes: 19,
    userVotedId: undefined,
  });
  const [showCreatePoll, setShowCreatePoll] = useState(false);
  const [newPollQuestion, setNewPollQuestion] = useState("");
  const [newPollOptions, setNewPollOptions] = useState(["", ""]);

  // Local Media Recorder Hook
  const recorder = useLocalRecorder();

  // Roster Search
  const [rosterSearch, setRosterSearch] = useState("");

  // Floating Reaction Trigger
  const triggerReaction = useCallback((emoji: string, senderName: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    const xPercent = 20 + Math.random() * 60;
    setReactions((prev) => [...prev.slice(-12), { id, emoji, senderName, xPercent }]);
    setTimeout(() => {
      setReactions((prev) => prev.filter((r) => r.id !== id));
    }, 2800);
  }, []);

  // Listen to Data Channel Packets
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
        setTimeout(() => {
          if (chatScrollRef.current) {
            chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
          }
        }, 50);
      } else if (packet.type === "poll") {
        if (packet.action === "start") {
          setActivePoll({
            id: packet.pollId,
            question: packet.question,
            options: packet.options.map((o) => ({ id: o.id, text: o.text, votes: 0 })),
            isOpen: true,
            totalVotes: 0,
          });
        } else if (packet.action === "close") {
          setActivePoll((curr) => (curr && curr.id === packet.pollId ? { ...curr, isOpen: false } : curr));
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
    const senderName = localParticipant.name || "You";
    const packet: LiveReactionPacket = {
      version: 1,
      type: "reaction",
      emoji,
      senderId: localParticipant.identity,
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
    const nextState = !isHandRaised;
    setIsHandRaised(nextState);

    const packet: LiveHandRaisePacket = {
      version: 1,
      type: "hand_raise",
      senderId: localParticipant.identity,
      senderName: localParticipant.name || "You",
      isRaised: nextState,
      timestamp: Date.now(),
    };
    try {
      room.localParticipant.publishData(encodeLivePacket(packet) as any, { reliable: true });
    } catch {}

    setRaisedHands((prev) => {
      const next = new Set(prev);
      if (nextState) next.add(localParticipant.identity);
      else next.delete(localParticipant.identity);
      return next;
    });
  };

  const sendChatMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!room?.localParticipant || !chatInput.trim()) return;

    const text = chatInput.trim();
    const senderName = localParticipant.name || "You";
    const packet: LiveChatPacket = {
      version: 1,
      type: "chat",
      text,
      senderId: localParticipant.identity,
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
        senderId: localParticipant.identity,
        text,
        timestamp: packet.timestamp,
        isMe: true,
      },
    ]);
    setChatInput("");
    setTimeout(() => {
      if (chatScrollRef.current) {
        chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
      }
    }, 50);
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

  const handleCreatePoll = () => {
    if (!newPollQuestion.trim()) return;
    const validOpts = newPollOptions.filter((o) => o.trim().length > 0);
    if (validOpts.length < 2) {
      alert("Please provide at least 2 options for the poll.");
      return;
    }

    const pollId = `poll-${Date.now()}`;
    const newP: ActivePoll = {
      id: pollId,
      question: newPollQuestion.trim(),
      options: validOpts.map((text, idx) => ({ id: `opt-${idx}`, text: text.trim(), votes: 0 })),
      isOpen: true,
      totalVotes: 0,
    };
    setActivePoll(newP);
    setShowCreatePoll(false);
    setNewPollQuestion("");
    setNewPollOptions(["", ""]);

    if (room?.localParticipant) {
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
    }
  };

  const handleAskQuestion = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!qaInput.trim() || !room?.localParticipant) return;

    const qItem: QAQuestion = {
      id: `q-${Date.now()}`,
      title: qaInput.trim(),
      senderName: localParticipant.name || "You",
      senderId: localParticipant.identity,
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

  const handleUpvoteQuestion = (qId: string) => {
    setQaQuestions((prev) =>
      prev.map((q) => (q.id === qId ? { ...q, upvotes: q.upvotes + 1 } : q)),
    );
  };

  const handleMarkAnswered = (qId: string) => {
    setQaQuestions((prev) =>
      prev.map((q) => (q.id === qId ? { ...q, isAnswered: true } : q)),
    );
  };

  // Screen share & Camera tracks
  const screenShareTrack = useMemo(() => {
    return tracks.find((t) => t.source === Track.Source.ScreenShare);
  }, [tracks]);

  const cameraTracks = useMemo(() => {
    const list = tracks.filter((t) => t.source === Track.Source.Camera);
    return [...list].sort((a, b) => {
      const aSpeaking = a.participant?.isSpeaking ? 1 : 0;
      const bSpeaking = b.participant?.isSpeaking ? 1 : 0;
      return bSpeaking - aSpeaking;
    });
  }, [tracks]);

  // Determine effective presentation / stage mode
  useEffect(() => {
    if (screenShareTrack && navbarView !== "presentation") {
      setNavbarView("presentation");
    }
  }, [screenShareTrack, navbarView]);

  const TILES_PER_PAGE = 12;
  const totalPages = Math.max(1, Math.ceil(cameraTracks.length / TILES_PER_PAGE));
  const currentPageTracks = cameraTracks.slice(page * TILES_PER_PAGE, (page + 1) * TILES_PER_PAGE);

  // Invite Link
  const handleCopyInviteLink = useCallback(() => {
    const inviteUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/live/${roomId}`
        : `https://skillbridge.app/live/${roomId}`;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(inviteUrl).then(() => {
        setCopiedToast(true);
        setTimeout(() => setCopiedToast(false), 2500);
      });
    }
  }, [roomId]);

  // Media Controls
  const handleToggleMic = async () => {
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch {
      alert("Could not access microphone. Please check your browser audio permissions.");
    }
  };

  const handleToggleCam = async () => {
    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled);
    } catch {
      alert("Could not access camera. Please check your browser video permissions.");
    }
  };

  const handleToggleScreenShare = async () => {
    try {
      await localParticipant.setScreenShareEnabled(!isScreenShareEnabled);
    } catch (err: any) {
      if (err?.name !== "NotAllowedError") {
        alert("Screen sharing cancelled or unavailable: " + (err?.message || ""));
      }
    }
  };

  const handleToggleRecording = async () => {
    if (recorder.isRecording) {
      const blob = await recorder.stopRecording();
      if (blob) {
        alert("Meeting recording finished and saved successfully.");
      }
    } else {
      const started = await recorder.startRecording();
      if (!started) {
        alert("Could not start recording. Check screen capture permissions.");
      }
    }
  };

  // Host Controls
  const handleMuteAll = async () => {
    if (!creds.sessionId) return;
    try {
      await api(`/live/rooms/${creds.sessionId}/mute-all`, { method: "POST" });
      alert("All participant microphones have been muted.");
    } catch (err: any) {
      alert("Failed to mute all: " + err.message);
    }
  };

  const handleMuteParticipant = async (identity: string) => {
    if (!creds.sessionId) return;
    try {
      await api(`/live/rooms/${creds.sessionId}/mute-participant`, {
        method: "POST",
        body: JSON.stringify({ participantIdentity: identity, mute: true }),
      });
    } catch (err: any) {
      alert("Failed to mute participant: " + err.message);
    }
  };

  const handleRemoveParticipant = async (identity: string) => {
    if (!creds.sessionId) return;
    if (!confirm(`Are you sure you want to remove this participant?`)) return;
    try {
      await api(`/live/rooms/${creds.sessionId}/remove-participant`, {
        method: "POST",
        body: JSON.stringify({ participantIdentity: identity }),
      });
    } catch (err: any) {
      alert("Failed to remove participant: " + err.message);
    }
  };

  const handleEndRoomForAll = async () => {
    if (!creds.sessionId) return;
    if (!confirm("Are you sure you want to terminate this live meeting for everyone?")) return;
    try {
      await api(`/live/rooms/${creds.sessionId}/end`, { method: "POST" });
      room.disconnect();
      router.back();
    } catch (err: any) {
      alert("Failed to end room: " + err.message);
    }
  };

  const handleLeave = () => {
    room.disconnect();
    router.back();
  };

  // Filtered participants list for roster
  const filteredParticipants = useMemo(() => {
    const q = rosterSearch.toLowerCase().trim();
    if (!q) return participants;
    return participants.filter((p) => {
      const name = p.name || p.identity;
      return name.toLowerCase().includes(q);
    });
  }, [participants, rosterSearch]);

  const activeRaisedHandsCount = raisedHands.size;

  return (
    <div style={styles.viewRoot}>
      {/* Media Permission Warning Banner */}
      {permGranted === false && (
        <div style={styles.permBanner}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span>⚠️</span>
            <span>Camera or microphone access is restricted by your browser.</span>
          </div>
          <button onClick={onRequestPerms} style={styles.permBtn}>
            Enable Permissions
          </button>
        </div>
      )}

      {/* Hand Raise Alert Toast for Host */}
      {activeRaisedHandsCount > 0 && (
        <div style={styles.handRaiseBanner}>
          <span>✋ {activeRaisedHandsCount} participant{activeRaisedHandsCount > 1 ? "s have" : " has"} raised their hand</span>
          <button
            onClick={() => setSidebarTab("roster")}
            style={styles.handRaiseActionBtn}
          >
            Review Queue
          </button>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 1. ADVANCED GLASSMORPHIC NAVIGATION BAR                             */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <header style={styles.topNavbar}>
        {/* Left: Brand, Live status, Timer & Room Title */}
        <div style={styles.navLeft}>
          <button onClick={handleLeave} style={styles.exitRoomBtn} title="Leave Session">
            <span style={{ fontSize: "16px" }}>←</span>
            <span style={{ fontSize: "12px", fontWeight: 600 }}>Exit</span>
          </button>

          <div style={styles.liveIndicatorBadge}>
            <span style={styles.pulseDot} />
            <span style={styles.liveBadgeText}>LIVE</span>
            <span style={styles.timerDivider}>|</span>
            <span style={styles.timerText}>{formatTimer(elapsedSeconds)}</span>
          </div>

          <div style={styles.roomInfoCluster}>
            <span style={styles.roomTitleText}>{creds.roomName || "Interactive Masterclass"}</span>
            <span style={styles.subjectPill}>{creds.role ? `${creds.role.toUpperCase()}` : "LIVE ROOM"}</span>
          </div>

          {recorder.isRecording && (
            <div style={styles.recordingPill}>
              <span style={styles.recDot} />
              <span>REC {formatTimer(recorder.durationSeconds)}</span>
            </div>
          )}
        </div>

        {/* Center: Stage Mode Navbar Switcher */}
        <nav style={styles.navCenter}>
          <div style={styles.navTabGroup}>
            <button
              onClick={() => setNavbarView("stage")}
              style={navbarView === "stage" ? styles.navTabActive : styles.navTab}
            >
              <span style={styles.navTabIcon}>🎥</span>
              <span>Stage</span>
            </button>

            <button
              onClick={() => setNavbarView("presentation")}
              style={navbarView === "presentation" ? styles.navTabActive : styles.navTab}
            >
              <span style={styles.navTabIcon}>🖥️</span>
              <span>Presentation</span>
            </button>

            <button
              onClick={() => setNavbarView("whiteboard")}
              style={navbarView === "whiteboard" ? styles.navTabActive : styles.navTab}
            >
              <span style={styles.navTabIcon}>🎨</span>
              <span>Whiteboard</span>
            </button>
          </div>
        </nav>

        {/* Right: Quick actions, Recorder, Invite, Settings */}
        <div style={styles.navRight}>
          {creds.isHost && (
            <button
              onClick={handleToggleRecording}
              style={recorder.isRecording ? styles.navRecActiveBtn : styles.navRecBtn}
              title={recorder.isRecording ? "Stop Recording" : "Start Cloud Recording"}
            >
              <span style={{ fontSize: "12px" }}>{recorder.isRecording ? "⏹️ Stop REC" : "⏺️ Record"}</span>
            </button>
          )}

          <div style={styles.networkBadge} title="Connection: Ultra HD low-latency WebRTC">
            <span style={{ color: "#10B981" }}>📶</span>
            <span style={{ fontSize: "11px", fontWeight: 600, color: "#94A3B8" }}>HD</span>
          </div>

          <button
            onClick={() => setLayoutMode((m) => (m === "grid" ? "spotlight" : "grid"))}
            style={styles.navIconBtn}
            title={layoutMode === "grid" ? "Switch to Spotlight Layout" : "Switch to Grid Layout"}
          >
            {layoutMode === "grid" ? "⊞ Grid" : "🔍 Focus"}
          </button>

          <button onClick={handleCopyInviteLink} style={styles.inviteShareBtn} title="Copy Meeting Link">
            <span>🔗 Invite</span>
          </button>
          {copiedToast && <div style={styles.toast}>Meeting link copied!</div>}

          <button
            onClick={() => setShowSettingsModal(true)}
            style={styles.navIconBtn}
            title="Audio & Video Settings"
          >
            ⚙️
          </button>
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 2. MAIN WORKSPACE (STAGE + COLLAPSIBLE INTERACTIVE SIDEBAR)         */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div style={styles.mainWorkspace}>
        {/* Stage Content Area */}
        <main style={styles.stageViewport}>
          {navbarView === "whiteboard" ? (
            <ModernWhiteboardCanvas />
          ) : navbarView === "presentation" && screenShareTrack ? (
            <div style={styles.screenShareStage}>
              <div style={styles.screenShareMain}>
                <VideoTrack trackRef={screenShareTrack as any} style={styles.screenVideo} />
                <div style={styles.screenShareLabel}>
                  🖥️ {screenShareTrack.participant?.name || "Presenter"}'s Screen
                </div>
              </div>
              <div style={styles.screenStrip}>
                {currentPageTracks.map((tr) => (
                  <div
                    key={tr.publication?.trackSid || tr.participant?.identity}
                    style={styles.stripTile}
                    onClick={() => setSpotlightId(tr.participant?.identity || null)}
                  >
                    <ModernParticipantTile
                      trackRef={tr}
                      isHandRaised={raisedHands.has(tr.participant?.identity || "")}
                      isSpotlight={spotlightId === tr.participant?.identity}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            // Dynamic Grid / Spotlight Layout
            <div style={styles.gridContainer}>
              <div
                style={{
                  ...styles.grid,
                  gridTemplateColumns: getGridColumns(currentPageTracks.length),
                }}
              >
                {currentPageTracks.map((tr) => (
                  <div
                    key={tr.publication?.trackSid || tr.participant?.identity}
                    style={styles.gridCell}
                    onClick={() => {
                      if (layoutMode === "spotlight") {
                        setSpotlightId(tr.participant?.identity || null);
                      }
                    }}
                  >
                    <ModernParticipantTile
                      trackRef={tr}
                      isHandRaised={raisedHands.has(tr.participant?.identity || "")}
                      isSpotlight={spotlightId === tr.participant?.identity}
                    />
                  </div>
                ))}
              </div>

              {/* Grid Pagination for 12+ participants */}
              {totalPages > 1 && (
                <div style={styles.paginationBar}>
                  <button
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    style={styles.pageBtn}
                  >
                    ◀ Previous
                  </button>
                  <span style={styles.pageInfo}>
                    Page {page + 1} of {totalPages} ({participants.length} peers connected)
                  </span>
                  <button
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    style={styles.pageBtn}
                  >
                    Next ▶
                  </button>
                </div>
              )}
            </div>
          )}
        </main>

        {/* Collapsible Interactive Glassmorphism Sidebar */}
        {sidebarTab && (
          <aside style={styles.interactiveSidebar}>
            {/* Sidebar Navigation Tabs */}
            <div style={styles.sidebarHeader}>
              <div style={styles.sidebarTabSwitch}>
                <button
                  onClick={() => setSidebarTab("chat")}
                  style={sidebarTab === "chat" ? styles.sideTabBtnActive : styles.sideTabBtn}
                >
                  💬 Chat {chatMessages.length > 0 && `(${chatMessages.length})`}
                </button>
                <button
                  onClick={() => setSidebarTab("qa")}
                  style={sidebarTab === "qa" ? styles.sideTabBtnActive : styles.sideTabBtn}
                >
                  ❓ Q&A {qaQuestions.length > 0 && `(${qaQuestions.length})`}
                </button>
                <button
                  onClick={() => setSidebarTab("polls")}
                  style={sidebarTab === "polls" ? styles.sideTabBtnActive : styles.sideTabBtn}
                >
                  📊 Polls
                </button>
                <button
                  onClick={() => setSidebarTab("roster")}
                  style={sidebarTab === "roster" ? styles.sideTabBtnActive : styles.sideTabBtn}
                >
                  👥 ({participants.length})
                </button>
              </div>
              <button onClick={() => setSidebarTab(null)} style={styles.closeSidebarBtn} title="Close sidebar">
                ✕
              </button>
            </div>

            {/* Sidebar Tab 1: Live Chat */}
            {sidebarTab === "chat" && (
              <div style={styles.sidebarBody}>
                <div style={styles.chatScroll} ref={chatScrollRef}>
                  {chatMessages.length === 0 ? (
                    <div style={styles.emptyStateContainer}>
                      <span style={{ fontSize: "32px", marginBottom: "8px" }}>💬</span>
                      <span style={styles.emptyTitle}>No messages yet</span>
                      <span style={styles.emptySub}>Say hi or share study thoughts with everyone</span>
                    </div>
                  ) : (
                    chatMessages.map((msg) => (
                      <div
                        key={msg.id}
                        style={{
                          ...styles.chatBubbleContainer,
                          alignItems: msg.isMe ? "flex-end" : "flex-start",
                        }}
                      >
                        <span style={styles.chatAuthor}>{msg.senderName}</span>
                        <div style={msg.isMe ? styles.chatBubbleMe : styles.chatBubbleOther}>
                          {msg.text}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <form onSubmit={sendChatMessage} style={styles.chatInputRow}>
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Send a message to everyone…"
                    style={styles.chatInputField}
                  />
                  <button type="submit" style={styles.chatSendBtn} title="Send">
                    ➤
                  </button>
                </form>
              </div>
            )}

            {/* Sidebar Tab 2: Live Q&A */}
            {sidebarTab === "qa" && (
              <div style={styles.sidebarBody}>
                <form onSubmit={handleAskQuestion} style={styles.qaInputBlock}>
                  <input
                    type="text"
                    value={qaInput}
                    onChange={(e) => setQaInput(e.target.value)}
                    placeholder="Ask a question for the speaker…"
                    style={styles.qaInputField}
                  />
                  <button type="submit" style={styles.qaSubmitBtn}>
                    Ask
                  </button>
                </form>

                <div style={styles.qaListScroll}>
                  {qaQuestions.map((q) => (
                    <div key={q.id} style={styles.qaCard}>
                      <div style={styles.qaCardHeader}>
                        <span style={styles.qaAuthor}>{q.senderName}</span>
                        {q.isAnswered ? (
                          <span style={styles.qaResolvedBadge}>✓ Answered</span>
                        ) : (
                          creds.isHost && (
                            <button
                              onClick={() => handleMarkAnswered(q.id)}
                              style={styles.qaAnswerBtn}
                            >
                              Mark Answered
                            </button>
                          )
                        )}
                      </div>
                      <p style={styles.qaText}>{q.title}</p>
                      <div style={styles.qaFooter}>
                        <button
                          onClick={() => handleUpvoteQuestion(q.id)}
                          style={styles.qaUpvoteBtn}
                        >
                          ▲ Upvote ({q.upvotes})
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sidebar Tab 3: Interactive Polls */}
            {sidebarTab === "polls" && (
              <div style={styles.sidebarBody}>
                {creds.isHost && (
                  <button
                    onClick={() => setShowCreatePoll((p) => !p)}
                    style={styles.createPollToggleBtn}
                  >
                    {showCreatePoll ? "Cancel Poll Draft" : "➕ Create New Poll"}
                  </button>
                )}

                {showCreatePoll && (
                  <div style={styles.pollDraftCard}>
                    <span style={styles.pollDraftHeading}>New Classroom Poll</span>
                    <input
                      type="text"
                      placeholder="Ask a question…"
                      value={newPollQuestion}
                      onChange={(e) => setNewPollQuestion(e.target.value)}
                      style={styles.pollDraftInput}
                    />
                    {newPollOptions.map((opt, i) => (
                      <input
                        key={i}
                        type="text"
                        placeholder={`Option ${i + 1}`}
                        value={opt}
                        onChange={(e) => {
                          const copy = [...newPollOptions];
                          copy[i] = e.target.value;
                          setNewPollOptions(copy);
                        }}
                        style={styles.pollDraftInput}
                      />
                    ))}
                    <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
                      <button
                        onClick={() => setNewPollOptions((prev) => [...prev, ""])}
                        style={styles.addOptionBtn}
                      >
                        + Add Option
                      </button>
                      <button onClick={handleCreatePoll} style={styles.launchPollBtn}>
                        Launch Poll 🚀
                      </button>
                    </div>
                  </div>
                )}

                {activePoll ? (
                  <div style={styles.activePollBox}>
                    <div style={styles.pollHeaderRow}>
                      <span style={styles.pollBadge}>ACTIVE POLL</span>
                      <span style={styles.pollTotalVotes}>{activePoll.totalVotes} votes</span>
                    </div>
                    <h4 style={styles.pollQuestionTitle}>{activePoll.question}</h4>

                    <div style={styles.pollOptionsContainer}>
                      {activePoll.options.map((opt) => {
                        const pct =
                          activePoll.totalVotes > 0
                            ? Math.round((opt.votes / activePoll.totalVotes) * 100)
                            : 0;
                        const hasVoted = activePoll.userVotedId === opt.id;

                        return (
                          <button
                            key={opt.id}
                            onClick={() => handleVotePoll(opt.id)}
                            disabled={Boolean(activePoll.userVotedId)}
                            style={{
                              ...styles.pollOptionBtn,
                              borderColor: hasVoted ? "#38BDF8" : "rgba(255,255,255,0.1)",
                              backgroundColor: hasVoted ? "rgba(56, 189, 248, 0.12)" : "rgba(255,255,255,0.04)",
                            }}
                          >
                            <div style={{ ...styles.pollOptionProgress, width: `${pct}%` }} />
                            <div style={styles.pollOptionTextRow}>
                              <span style={styles.pollOptionLabel}>
                                {hasVoted && "✓ "}
                                {opt.text}
                              </span>
                              <span style={styles.pollOptionPct}>{pct}% ({opt.votes})</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div style={styles.emptyStateContainer}>
                    <span style={{ fontSize: "32px", marginBottom: "8px" }}>📊</span>
                    <span style={styles.emptyTitle}>No active poll</span>
                    <span style={styles.emptySub}>The host has not launched a poll yet</span>
                  </div>
                )}
              </div>
            )}

            {/* Sidebar Tab 4: Participants Roster */}
            {sidebarTab === "roster" && (
              <div style={styles.sidebarBody}>
                {creds.isHost && (
                  <button onClick={handleMuteAll} style={styles.muteAllBtn}>
                    🔇 Mute All Participants
                  </button>
                )}

                <input
                  type="text"
                  placeholder="Search participants…"
                  value={rosterSearch}
                  onChange={(e) => setRosterSearch(e.target.value)}
                  style={styles.rosterSearchInput}
                />

                <div style={styles.rosterList}>
                  {filteredParticipants.map((p) => {
                    const isLocal = p.identity === localParticipant.identity;
                    const isSpeaking = p.isSpeaking;
                    const isMicMuted = p.isMicrophoneEnabled === false;
                    const isCamOn = p.isCameraEnabled;
                    const hasHandRaised = raisedHands.has(p.identity);

                    return (
                      <div key={p.identity} style={styles.rosterItem}>
                        <div style={styles.rosterAvatar}>
                          {(p.name?.[0] || p.identity[0] || "?").toUpperCase()}
                        </div>
                        <div style={styles.rosterDetails}>
                          <span style={styles.rosterName}>
                            {p.name || p.identity} {isLocal && "(You)"}
                          </span>
                          <span style={styles.rosterStatus}>
                            {hasHandRaised ? "✋ Hand Raised" : isSpeaking ? "🗣️ Speaking" : isMicMuted ? "Muted" : "Active"}
                          </span>
                        </div>

                        <div style={styles.rosterActions}>
                          <span>{isMicMuted ? "🔇" : "🎤"}</span>
                          <span>{isCamOn ? "📹" : "📷"}</span>

                          {creds.isHost && !isLocal && (
                            <>
                              <button
                                onClick={() => handleMuteParticipant(p.identity)}
                                style={styles.smallActionBtn}
                                title="Mute participant"
                              >
                                Mute
                              </button>
                              <button
                                onClick={() => handleRemoveParticipant(p.identity)}
                                style={styles.removeBtn}
                                title="Remove from room"
                              >
                                ✕
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 3. ADVANCED GLASSMORPHIC FLOATING DOCK (BOTTOM CONTROLS)            */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <footer style={styles.floatingDockWrapper}>
        <div style={styles.floatingDock}>
          {/* Audio Mic Toggle */}
          <button
            onClick={handleToggleMic}
            style={isMicrophoneEnabled ? styles.dockBtn : styles.dockBtnDanger}
            title={isMicrophoneEnabled ? "Mute Microphone" : "Unmute Microphone"}
          >
            <span style={styles.dockIcon}>{isMicrophoneEnabled ? "🎤" : "🔇"}</span>
            <span style={styles.dockLabel}>{isMicrophoneEnabled ? "Mute" : "Unmute"}</span>
          </button>

          {/* Video Cam Toggle */}
          <button
            onClick={handleToggleCam}
            style={isCameraEnabled ? styles.dockBtn : styles.dockBtnDanger}
            title={isCameraEnabled ? "Stop Camera" : "Start Camera"}
          >
            <span style={styles.dockIcon}>{isCameraEnabled ? "📹" : "📷"}</span>
            <span style={styles.dockLabel}>{isCameraEnabled ? "Stop Cam" : "Start Cam"}</span>
          </button>

          {/* Screen Share Toggle */}
          <button
            onClick={handleToggleScreenShare}
            style={isScreenShareEnabled ? styles.dockBtnActive : styles.dockBtn}
            title={isScreenShareEnabled ? "Stop Sharing Screen" : "Share Screen"}
          >
            <span style={styles.dockIcon}>🖥️</span>
            <span style={styles.dockLabel}>{isScreenShareEnabled ? "Sharing" : "Share"}</span>
          </button>

          {/* Interactive Whiteboard Switch */}
          <button
            onClick={() => setNavbarView(navbarView === "whiteboard" ? "stage" : "whiteboard")}
            style={navbarView === "whiteboard" ? styles.dockBtnActive : styles.dockBtn}
            title="Toggle Collaborative Whiteboard"
          >
            <span style={styles.dockIcon}>🎨</span>
            <span style={styles.dockLabel}>Board</span>
          </button>

          {/* Hand Raise Toggle */}
          <button
            onClick={toggleHandRaise}
            style={isHandRaised ? styles.dockBtnAmber : styles.dockBtn}
            title={isHandRaised ? "Lower Hand" : "Raise Hand"}
          >
            <span style={styles.dockIcon}>{isHandRaised ? "✋" : "👋"}</span>
            <span style={styles.dockLabel}>{isHandRaised ? "Lower" : "Raise"}</span>
          </button>

          {/* Reactions Popover */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowReactionsBar((prev) => !prev)}
              style={showReactionsBar ? styles.dockBtnActive : styles.dockBtn}
              title="Send Reaction"
            >
              <span style={styles.dockIcon}>✨</span>
              <span style={styles.dockLabel}>React</span>
            </button>

            {showReactionsBar && (
              <div style={styles.reactionsTray}>
                {["❤️", "👏", "🔥", "🎉", "💡", "🚀", "😂", "💯"].map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => {
                      sendReaction(emoji);
                      setShowReactionsBar(false);
                    }}
                    style={styles.reactionEmojiItem}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={styles.dockDivider} />

          {/* Chat Toggle Button */}
          <button
            onClick={() => setSidebarTab(sidebarTab === "chat" ? null : "chat")}
            style={sidebarTab === "chat" ? styles.dockBtnActive : styles.dockBtn}
            title="Open In-Call Chat"
          >
            <span style={styles.dockIcon}>💬</span>
            <span style={styles.dockLabel}>Chat</span>
          </button>

          {/* Q&A Hub Toggle */}
          <button
            onClick={() => setSidebarTab(sidebarTab === "qa" ? null : "qa")}
            style={sidebarTab === "qa" ? styles.dockBtnActive : styles.dockBtn}
            title="Open Q&A Queue"
          >
            <span style={styles.dockIcon}>❓</span>
            <span style={styles.dockLabel}>Q&A</span>
          </button>

          {/* Polls Toggle */}
          <button
            onClick={() => setSidebarTab(sidebarTab === "polls" ? null : "polls")}
            style={sidebarTab === "polls" ? styles.dockBtnActive : styles.dockBtn}
            title="Open Live Polls"
          >
            <span style={styles.dockIcon}>📊</span>
            <span style={styles.dockLabel}>Polls</span>
          </button>

          {/* Participants Roster Toggle */}
          <button
            onClick={() => setSidebarTab(sidebarTab === "roster" ? null : "roster")}
            style={sidebarTab === "roster" ? styles.dockBtnActive : styles.dockBtn}
            title="View Participants"
          >
            <span style={styles.dockIcon}>👥</span>
            <span style={styles.dockLabel}>{participants.length}</span>
          </button>

          {/* Host Management Options */}
          {creds.isHost && (
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowHostMenu((prev) => !prev)}
                style={showHostMenu ? styles.dockBtnActive : styles.dockBtn}
                title="Host Management Menu"
              >
                <span style={styles.dockIcon}>🛡️</span>
                <span style={styles.dockLabel}>Host</span>
              </button>

              {showHostMenu && (
                <div style={styles.hostDropdown}>
                  <div style={styles.hostMenuHeader}>Host Management</div>
                  <button
                    onClick={() => {
                      setShowHostMenu(false);
                      handleMuteAll();
                    }}
                    style={styles.hostMenuItem}
                  >
                    🔇 Mute All Mics
                  </button>
                  <button
                    onClick={() => {
                      setShowHostMenu(false);
                      handleCopyInviteLink();
                    }}
                    style={styles.hostMenuItem}
                  >
                    🔗 Copy Room Invite
                  </button>
                  <div style={styles.hostDivider} />
                  <button
                    onClick={() => {
                      setShowHostMenu(false);
                      handleEndRoomForAll();
                    }}
                    style={{ ...styles.hostMenuItem, color: "#EF4444" }}
                  >
                    ⏹️ End Meeting For All
                  </button>
                </div>
              )}
            </div>
          )}

          {/* End / Leave Button */}
          <button onClick={handleLeave} style={styles.dockLeaveBtn} title="Exit Meeting">
            <span style={styles.dockIcon}>📞</span>
            <span style={styles.dockLabel}>Leave</span>
          </button>
        </div>
      </footer>

      {/* Floating Animated Emojis Layer */}
      {reactions.length > 0 && (
        <div style={styles.floatingReactionsLayer}>
          {reactions.map((r) => (
            <div
              key={r.id}
              style={{
                ...styles.floatingReactionPill,
                left: `${r.xPercent}%`,
              }}
            >
              <span style={{ fontSize: "22px" }}>{r.emoji}</span>
              <span style={{ fontSize: "11px", fontWeight: 600 }}>{r.senderName}</span>
            </div>
          ))}
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div style={styles.modalOverlay} onClick={() => setShowSettingsModal(false)}>
          <div style={styles.settingsModalCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeaderRow}>
              <h3 style={styles.modalTitle}>Audio & Video Preferences</h3>
              <button onClick={() => setShowSettingsModal(false)} style={styles.closeDrawerBtn}>
                ✕
              </button>
            </div>
            <div style={styles.settingsBody}>
              <div style={styles.settingsItem}>
                <span style={styles.settingsLabel}>Microphone Status</span>
                <span style={{ color: isMicrophoneEnabled ? "#10B981" : "#EF4444", fontWeight: 600 }}>
                  {isMicrophoneEnabled ? "Active (Broadcasting)" : "Muted"}
                </span>
              </div>
              <div style={styles.settingsItem}>
                <span style={styles.settingsLabel}>Camera Status</span>
                <span style={{ color: isCameraEnabled ? "#10B981" : "#EF4444", fontWeight: 600 }}>
                  {isCameraEnabled ? "HD Video Enabled" : "Camera Off"}
                </span>
              </div>
              <div style={styles.settingsItem}>
                <span style={styles.settingsLabel}>Noise Cancellation</span>
                <span style={{ color: "#38BDF8", fontWeight: 600 }}>Adaptive AI Filter</span>
              </div>
              <div style={styles.settingsItem}>
                <span style={styles.settingsLabel}>Video Stream Codec</span>
                <span style={{ color: "#94A3B8" }}>VP9 / Opus Dynamic Bitrate</span>
              </div>
            </div>
            <button onClick={() => setShowSettingsModal(false)} style={styles.saveSettingsBtn}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modern Participant Tile (Active Speaker Glow, Sound Waves & Hand Raise)
// ─────────────────────────────────────────────────────────────────────────────
function ModernParticipantTile({
  trackRef,
  isHandRaised = false,
  isSpotlight = false,
}: {
  trackRef: any;
  isHandRaised?: boolean;
  isSpotlight?: boolean;
}) {
  const p: Participant = trackRef.participant;
  const isVideoPublished =
    trackRef.publication &&
    !trackRef.publication.isMuted &&
    trackRef.source === Track.Source.Camera;
  const isSpeaking = p?.isSpeaking;
  const isMuted = p?.isMicrophoneEnabled === false;
  const displayName = p?.name || p?.identity || "Participant";

  return (
    <div
      style={{
        ...styles.tileWrapper,
        border: isSpeaking
          ? "2px solid #10B981"
          : isHandRaised
          ? "2px solid #F59E0B"
          : isSpotlight
          ? "2px solid #38BDF8"
          : "1px solid rgba(255,255,255,0.08)",
        boxShadow: isSpeaking
          ? "0 0 20px rgba(16, 185, 129, 0.45)"
          : isHandRaised
          ? "0 0 20px rgba(245, 158, 11, 0.45)"
          : "none",
      }}
    >
      {isVideoPublished ? (
        <VideoTrack trackRef={trackRef} style={styles.videoTrackElement} />
      ) : (
        <div style={styles.avatarTile}>
          <div style={styles.avatarCircle}>
            {(displayName[0] || "?").toUpperCase()}
          </div>
          <span style={styles.avatarLabel}>{displayName}</span>
        </div>
      )}

      {/* Floating Hand Raise Badge */}
      {isHandRaised && (
        <div style={styles.handRaisePill}>
          <span>✋ Hand Raised</span>
        </div>
      )}

      {/* Modern Floating Nameplate Badge */}
      <div style={styles.nameplate}>
        <span style={styles.nameplateText}>{displayName}</span>
        {isSpeaking && (
          <div style={styles.soundWaveBars}>
            <span style={{ ...styles.soundWaveBar, animationDelay: "0ms" }} />
            <span style={{ ...styles.soundWaveBar, animationDelay: "150ms" }} />
            <span style={{ ...styles.soundWaveBar, animationDelay: "300ms" }} />
          </div>
        )}
        <span style={{ fontSize: "12px", marginLeft: "2px" }}>
          {isMuted ? "🔇" : "🎤"}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Interactive Live Whiteboard Canvas
// ─────────────────────────────────────────────────────────────────────────────
function ModernWhiteboardCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentColor, setCurrentColor] = useState("#38BDF8");
  const [brushWidth, setBrushWidth] = useState(3);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Handle high DPI
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    ctx.fillStyle = "#0B1120";
    ctx.fillRect(0, 0, rect.width, rect.height);
  }, []);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = tool === "eraser" ? "#0B1120" : currentColor;
    ctx.lineWidth = tool === "eraser" ? 24 : brushWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = "#0B1120";
    ctx.fillRect(0, 0, rect.width, rect.height);
  };

  return (
    <div style={styles.whiteboardContainer}>
      {/* Whiteboard Floating Toolbar */}
      <div style={styles.whiteboardToolbar}>
        <div style={styles.colorPalette}>
          {["#38BDF8", "#10B981", "#F59E0B", "#F43F5E", "#A855F7", "#FFFFFF"].map((col) => (
            <button
              key={col}
              onClick={() => {
                setCurrentColor(col);
                setTool("pen");
              }}
              style={{
                ...styles.colorCircle,
                backgroundColor: col,
                border: currentColor === col && tool === "pen" ? "2px solid #FFFFFF" : "none",
              }}
            />
          ))}
        </div>

        <div style={styles.dockDivider} />

        <button
          onClick={() => setTool("pen")}
          style={tool === "pen" ? styles.toolBtnActive : styles.toolBtn}
          title="Pen"
        >
          ✏️ Pen
        </button>
        <button
          onClick={() => setTool("eraser")}
          style={tool === "eraser" ? styles.toolBtnActive : styles.toolBtn}
          title="Eraser"
        >
          🧹 Eraser
        </button>

        <div style={styles.dockDivider} />

        {[2, 5, 10].map((sz) => (
          <button
            key={sz}
            onClick={() => {
              setBrushWidth(sz);
              setTool("pen");
            }}
            style={brushWidth === sz && tool === "pen" ? styles.toolBtnActive : styles.toolBtn}
            title={`${sz}px Stroke Width`}
          >
            {sz === 2 ? "Fine" : sz === 5 ? "Med" : "Bold"}
          </button>
        ))}

        <div style={styles.dockDivider} />

        <button onClick={clearCanvas} style={styles.clearBoardBtn} title="Clear Whiteboard">
          🗑️ Clear
        </button>
      </div>

      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        style={styles.whiteboardCanvas}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic Grid Columns Helper
// ─────────────────────────────────────────────────────────────────────────────
function getGridColumns(count: number): string {
  if (count <= 1) return "1fr";
  if (count === 2) return "repeat(2, 1fr)";
  if (count <= 4) return "repeat(2, 1fr)";
  if (count <= 6) return "repeat(3, 1fr)";
  if (count <= 9) return "repeat(3, 1fr)";
  return "repeat(4, 1fr)";
}

// ─────────────────────────────────────────────────────────────────────────────
// Glassmorphic Styling Sheet
// ─────────────────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  container: {
    height: "100vh",
    width: "100vw",
    backgroundColor: "#070A12",
    color: "#FFFFFF",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    overflow: "hidden",
  },
  centerContainer: {
    height: "100vh",
    width: "100vw",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#070A12",
    color: "#F8FAFC",
  },
  spinner: {
    width: "44px",
    height: "44px",
    borderRadius: "50%",
    border: "3px solid rgba(56, 189, 248, 0.2)",
    borderTopColor: "#38BDF8",
    animation: "spin 1s linear infinite",
    marginBottom: "16px",
  },
  title: {
    fontSize: "19px",
    fontWeight: 600,
    margin: "0 0 6px 0",
  },
  subtitle: {
    fontSize: "13px",
    color: "#94A3B8",
    margin: 0,
  },
  card: {
    backgroundColor: "#0B1120",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "20px",
    padding: "36px",
    maxWidth: "420px",
    textAlign: "center",
    boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
  },
  cardHeading: {
    fontSize: "20px",
    fontWeight: 700,
    margin: "0 0 10px 0",
  },
  cardSub: {
    fontSize: "14px",
    color: "#94A3B8",
    lineHeight: "1.6",
    marginBottom: "26px",
  },
  actionRow: {
    display: "flex",
    gap: "12px",
    justifyContent: "center",
  },
  btnPrimary: {
    backgroundColor: "#0284C7",
    color: "#FFFFFF",
    border: "none",
    padding: "10px 20px",
    borderRadius: "12px",
    fontWeight: 600,
    fontSize: "13px",
    cursor: "pointer",
  },
  btnSecondary: {
    backgroundColor: "rgba(255,255,255,0.08)",
    color: "#E2E8F0",
    border: "1px solid rgba(255,255,255,0.12)",
    padding: "10px 20px",
    borderRadius: "12px",
    fontWeight: 600,
    fontSize: "13px",
    cursor: "pointer",
  },
  viewRoot: {
    height: "100%",
    width: "100%",
    display: "flex",
    flexDirection: "column",
    position: "relative",
    backgroundColor: "#070A12",
  },
  permBanner: {
    backgroundColor: "#B45309",
    color: "#FFFFFF",
    padding: "10px 20px",
    fontSize: "13px",
    fontWeight: 500,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 100,
  },
  permBtn: {
    backgroundColor: "#FFFFFF",
    color: "#78350F",
    border: "none",
    borderRadius: "8px",
    padding: "5px 12px",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: "12px",
  },
  handRaiseBanner: {
    backgroundColor: "#D97706",
    color: "#FFFFFF",
    padding: "8px 20px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontSize: "13px",
    fontWeight: 600,
    zIndex: 90,
  },
  handRaiseActionBtn: {
    backgroundColor: "#FFFFFF",
    color: "#92400E",
    border: "none",
    borderRadius: "6px",
    padding: "4px 10px",
    fontSize: "12px",
    fontWeight: 700,
    cursor: "pointer",
  },
  topNavbar: {
    height: "56px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 20px",
    backgroundColor: "rgba(11, 17, 32, 0.85)",
    backdropFilter: "blur(20px)",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    zIndex: 50,
  },
  navLeft: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  exitRoomBtn: {
    backgroundColor: "rgba(255,255,255,0.06)",
    color: "#E2E8F0",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "10px",
    padding: "6px 12px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    cursor: "pointer",
  },
  liveIndicatorBadge: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    padding: "5px 10px",
    borderRadius: "14px",
    border: "1px solid rgba(239, 68, 68, 0.35)",
  },
  pulseDot: {
    width: "7px",
    height: "7px",
    borderRadius: "50%",
    backgroundColor: "#EF4444",
  },
  liveBadgeText: {
    fontSize: "11px",
    fontWeight: 800,
    color: "#EF4444",
    letterSpacing: "0.5px",
  },
  timerDivider: {
    color: "rgba(239, 68, 68, 0.4)",
    fontSize: "11px",
  },
  timerText: {
    fontSize: "11px",
    fontWeight: 700,
    color: "#F8FAFC",
  },
  roomInfoCluster: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginLeft: "4px",
  },
  roomTitleText: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#F8FAFC",
    maxWidth: "200px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  subjectPill: {
    fontSize: "10px",
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: "6px",
    backgroundColor: "rgba(56, 189, 248, 0.15)",
    color: "#38BDF8",
    border: "1px solid rgba(56, 189, 248, 0.3)",
  },
  recordingPill: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    backgroundColor: "rgba(239, 68, 68, 0.2)",
    color: "#EF4444",
    padding: "4px 10px",
    borderRadius: "12px",
    fontSize: "11px",
    fontWeight: 700,
  },
  recDot: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    backgroundColor: "#EF4444",
  },
  navCenter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  navTabGroup: {
    display: "flex",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: "14px",
    padding: "3px",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  navTab: {
    backgroundColor: "transparent",
    color: "#94A3B8",
    border: "none",
    padding: "6px 14px",
    borderRadius: "11px",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    transition: "all 0.15s ease",
  },
  navTabActive: {
    backgroundColor: "#0284C7",
    color: "#FFFFFF",
    border: "none",
    padding: "6px 14px",
    borderRadius: "11px",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    boxShadow: "0 2px 10px rgba(2, 132, 199, 0.4)",
  },
  navTabIcon: {
    fontSize: "13px",
  },
  navRight: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    position: "relative",
  },
  navRecBtn: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    color: "#EF4444",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    borderRadius: "10px",
    padding: "6px 12px",
    fontWeight: 600,
    fontSize: "12px",
    cursor: "pointer",
  },
  navRecActiveBtn: {
    backgroundColor: "#EF4444",
    color: "#FFFFFF",
    border: "none",
    borderRadius: "10px",
    padding: "6px 12px",
    fontWeight: 600,
    fontSize: "12px",
    cursor: "pointer",
  },
  networkBadge: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    padding: "4px 8px",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: "8px",
    border: "1px solid rgba(255,255,255,0.06)",
  },
  inviteShareBtn: {
    backgroundColor: "rgba(56, 189, 248, 0.15)",
    color: "#38BDF8",
    border: "1px solid rgba(56, 189, 248, 0.35)",
    padding: "6px 14px",
    borderRadius: "10px",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
  },
  toast: {
    position: "absolute",
    top: "44px",
    right: "0",
    backgroundColor: "#0284C7",
    color: "#FFFFFF",
    padding: "6px 14px",
    borderRadius: "8px",
    fontSize: "12px",
    fontWeight: 600,
    boxShadow: "0 6px 16px rgba(0,0,0,0.5)",
    zIndex: 100,
    whiteSpace: "nowrap",
  },
  navIconBtn: {
    backgroundColor: "rgba(255,255,255,0.06)",
    color: "#E2E8F0",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "10px",
    padding: "6px 10px",
    fontSize: "14px",
    cursor: "pointer",
  },
  mainWorkspace: {
    flex: 1,
    display: "flex",
    position: "relative",
    overflow: "hidden",
  },
  stageViewport: {
    flex: 1,
    display: "flex",
    position: "relative",
    overflow: "hidden",
    padding: "10px 14px 84px 14px",
  },
  gridContainer: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  grid: {
    flex: 1,
    display: "grid",
    gap: "12px",
    alignContent: "center",
    justifyContent: "center",
    width: "100%",
    height: "100%",
  },
  gridCell: {
    position: "relative",
    width: "100%",
    height: "100%",
    minHeight: "150px",
  },
  tileWrapper: {
    position: "relative",
    width: "100%",
    height: "100%",
    borderRadius: "16px",
    overflow: "hidden",
    backgroundColor: "#0B1120",
    transition: "all 0.2s ease-in-out",
  },
  videoTrackElement: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  avatarTile: {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0B1120",
  },
  avatarCircle: {
    width: "60px",
    height: "60px",
    borderRadius: "30px",
    backgroundColor: "rgba(56, 189, 248, 0.15)",
    color: "#38BDF8",
    fontSize: "24px",
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "10px",
    border: "1px solid rgba(56, 189, 248, 0.3)",
  },
  avatarLabel: {
    fontSize: "13px",
    fontWeight: 600,
    color: "#E2E8F0",
  },
  handRaisePill: {
    position: "absolute",
    top: "10px",
    left: "10px",
    backgroundColor: "#F59E0B",
    color: "#000000",
    fontWeight: 700,
    fontSize: "11px",
    padding: "3px 8px",
    borderRadius: "8px",
    boxShadow: "0 4px 10px rgba(245, 158, 11, 0.4)",
  },
  nameplate: {
    position: "absolute",
    bottom: "10px",
    left: "10px",
    backgroundColor: "rgba(11, 17, 32, 0.85)",
    backdropFilter: "blur(10px)",
    padding: "4px 10px",
    borderRadius: "8px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  nameplateText: {
    fontSize: "12px",
    fontWeight: 600,
    color: "#F8FAFC",
  },
  soundWaveBars: {
    display: "flex",
    alignItems: "center",
    gap: "2px",
    height: "12px",
  },
  soundWaveBar: {
    width: "3px",
    height: "10px",
    backgroundColor: "#10B981",
    borderRadius: "2px",
  },
  screenShareStage: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    width: "100%",
    height: "100%",
  },
  screenShareMain: {
    flex: 1,
    position: "relative",
    backgroundColor: "#000000",
    borderRadius: "16px",
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.1)",
  },
  screenVideo: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
  },
  screenShareLabel: {
    position: "absolute",
    top: "12px",
    left: "12px",
    backgroundColor: "rgba(11, 17, 32, 0.85)",
    backdropFilter: "blur(8px)",
    padding: "5px 12px",
    borderRadius: "8px",
    fontSize: "12px",
    color: "#38BDF8",
    fontWeight: 600,
    border: "1px solid rgba(56, 189, 248, 0.3)",
  },
  screenStrip: {
    height: "120px",
    display: "flex",
    gap: "10px",
    overflowX: "auto",
    paddingBottom: "4px",
  },
  stripTile: {
    width: "160px",
    height: "100%",
    flexShrink: 0,
    cursor: "pointer",
  },
  interactiveSidebar: {
    width: "340px",
    height: "calc(100% - 84px)",
    backgroundColor: "rgba(11, 17, 32, 0.95)",
    backdropFilter: "blur(24px)",
    borderRadius: "20px",
    border: "1px solid rgba(255,255,255,0.1)",
    margin: "10px 14px 10px 0",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    boxShadow: "-8px 0 30px rgba(0,0,0,0.6)",
    zIndex: 40,
  },
  sidebarHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 14px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  sidebarTabSwitch: {
    display: "flex",
    gap: "4px",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: "3px",
    borderRadius: "10px",
  },
  sideTabBtn: {
    backgroundColor: "transparent",
    color: "#94A3B8",
    border: "none",
    padding: "5px 10px",
    borderRadius: "8px",
    fontSize: "11px",
    fontWeight: 600,
    cursor: "pointer",
  },
  sideTabBtnActive: {
    backgroundColor: "#0284C7",
    color: "#FFFFFF",
    border: "none",
    padding: "5px 10px",
    borderRadius: "8px",
    fontSize: "11px",
    fontWeight: 600,
    cursor: "pointer",
  },
  closeSidebarBtn: {
    backgroundColor: "transparent",
    border: "none",
    color: "#94A3B8",
    fontSize: "14px",
    cursor: "pointer",
  },
  sidebarBody: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    padding: "14px",
  },
  chatScroll: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    marginBottom: "12px",
  },
  chatBubbleContainer: {
    display: "flex",
    flexDirection: "column",
    maxWidth: "85%",
  },
  chatAuthor: {
    fontSize: "10px",
    color: "#94A3B8",
    marginBottom: "3px",
    paddingLeft: "4px",
  },
  chatBubbleMe: {
    backgroundColor: "#0284C7",
    color: "#FFFFFF",
    padding: "8px 12px",
    borderRadius: "14px 14px 2px 14px",
    fontSize: "12px",
    lineHeight: "1.4",
  },
  chatBubbleOther: {
    backgroundColor: "rgba(255,255,255,0.08)",
    color: "#F8FAFC",
    padding: "8px 12px",
    borderRadius: "14px 14px 14px 2px",
    fontSize: "12px",
    lineHeight: "1.4",
  },
  chatInputRow: {
    display: "flex",
    gap: "8px",
  },
  chatInputField: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "12px",
    padding: "10px 14px",
    color: "#FFFFFF",
    fontSize: "12px",
    outline: "none",
  },
  chatSendBtn: {
    backgroundColor: "#0284C7",
    color: "#FFFFFF",
    border: "none",
    borderRadius: "12px",
    padding: "0 14px",
    fontSize: "14px",
    cursor: "pointer",
  },
  emptyStateContainer: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "20px",
  },
  emptyTitle: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#F8FAFC",
    marginBottom: "4px",
  },
  emptySub: {
    fontSize: "12px",
    color: "#94A3B8",
    lineHeight: "1.4",
  },
  qaInputBlock: {
    display: "flex",
    gap: "8px",
    marginBottom: "14px",
  },
  qaInputField: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "10px",
    padding: "8px 12px",
    color: "#FFFFFF",
    fontSize: "12px",
    outline: "none",
  },
  qaSubmitBtn: {
    backgroundColor: "#38BDF8",
    color: "#080C16",
    border: "none",
    borderRadius: "10px",
    padding: "0 14px",
    fontWeight: 700,
    fontSize: "12px",
    cursor: "pointer",
  },
  qaListScroll: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  qaCard: {
    backgroundColor: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "12px",
    padding: "12px",
  },
  qaCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "6px",
  },
  qaAuthor: {
    fontSize: "11px",
    color: "#38BDF8",
    fontWeight: 600,
  },
  qaResolvedBadge: {
    fontSize: "10px",
    fontWeight: 700,
    color: "#10B981",
  },
  qaAnswerBtn: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    color: "#10B981",
    border: "none",
    borderRadius: "6px",
    padding: "3px 8px",
    fontSize: "10px",
    fontWeight: 600,
    cursor: "pointer",
  },
  qaText: {
    fontSize: "12px",
    color: "#F8FAFC",
    lineHeight: "1.4",
    margin: "0 0 8px 0",
  },
  qaFooter: {
    display: "flex",
    justifyContent: "flex-end",
  },
  qaUpvoteBtn: {
    backgroundColor: "rgba(255,255,255,0.06)",
    color: "#E2E8F0",
    border: "none",
    borderRadius: "6px",
    padding: "4px 8px",
    fontSize: "11px",
    fontWeight: 600,
    cursor: "pointer",
  },
  createPollToggleBtn: {
    backgroundColor: "rgba(56, 189, 248, 0.15)",
    color: "#38BDF8",
    border: "1px solid rgba(56, 189, 248, 0.3)",
    borderRadius: "10px",
    padding: "8px 14px",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
    marginBottom: "12px",
  },
  pollDraftCard: {
    backgroundColor: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "12px",
    padding: "12px",
    marginBottom: "14px",
  },
  pollDraftHeading: {
    fontSize: "12px",
    fontWeight: 700,
    color: "#F8FAFC",
    marginBottom: "8px",
    display: "block",
  },
  pollDraftInput: {
    width: "100%",
    backgroundColor: "#1E293B",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px",
    padding: "8px 10px",
    color: "#FFFFFF",
    fontSize: "12px",
    marginBottom: "8px",
    boxSizing: "border-box",
  },
  addOptionBtn: {
    backgroundColor: "transparent",
    color: "#94A3B8",
    border: "1px dashed rgba(255,255,255,0.2)",
    borderRadius: "8px",
    padding: "6px 10px",
    fontSize: "11px",
    cursor: "pointer",
    flex: 1,
  },
  launchPollBtn: {
    backgroundColor: "#10B981",
    color: "#FFFFFF",
    border: "none",
    borderRadius: "8px",
    padding: "6px 12px",
    fontSize: "11px",
    fontWeight: 700,
    cursor: "pointer",
  },
  activePollBox: {
    backgroundColor: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "14px",
    padding: "14px",
  },
  pollHeaderRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "8px",
  },
  pollBadge: {
    fontSize: "10px",
    fontWeight: 800,
    color: "#38BDF8",
    backgroundColor: "rgba(56, 189, 248, 0.15)",
    padding: "2px 6px",
    borderRadius: "4px",
  },
  pollTotalVotes: {
    fontSize: "11px",
    color: "#94A3B8",
  },
  pollQuestionTitle: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#FFFFFF",
    margin: "0 0 12px 0",
    lineHeight: "1.4",
  },
  pollOptionsContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  pollOptionBtn: {
    position: "relative",
    border: "1px solid",
    borderRadius: "10px",
    padding: "10px 12px",
    cursor: "pointer",
    overflow: "hidden",
    textAlign: "left",
  },
  pollOptionProgress: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(56, 189, 248, 0.2)",
    transition: "width 0.4s ease",
  },
  pollOptionTextRow: {
    position: "relative",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 1,
  },
  pollOptionLabel: {
    fontSize: "12px",
    fontWeight: 600,
    color: "#FFFFFF",
  },
  pollOptionPct: {
    fontSize: "11px",
    color: "#94A3B8",
    fontWeight: 600,
  },
  muteAllBtn: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    color: "#EF4444",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    padding: "8px 12px",
    borderRadius: "10px",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
    marginBottom: "12px",
  },
  rosterSearchInput: {
    backgroundColor: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "10px",
    padding: "8px 12px",
    color: "#FFFFFF",
    fontSize: "12px",
    marginBottom: "12px",
    outline: "none",
  },
  rosterList: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  rosterItem: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "8px 10px",
    borderRadius: "10px",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  rosterAvatar: {
    width: "32px",
    height: "32px",
    borderRadius: "16px",
    backgroundColor: "rgba(56, 189, 248, 0.2)",
    color: "#38BDF8",
    fontSize: "12px",
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  rosterDetails: {
    flex: 1,
    overflow: "hidden",
  },
  rosterName: {
    fontSize: "12px",
    fontWeight: 600,
    display: "block",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  rosterStatus: {
    fontSize: "10px",
    color: "#94A3B8",
  },
  rosterActions: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  smallActionBtn: {
    backgroundColor: "rgba(255,255,255,0.08)",
    color: "#E2E8F0",
    border: "none",
    borderRadius: "6px",
    padding: "3px 6px",
    fontSize: "11px",
    cursor: "pointer",
  },
  removeBtn: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    color: "#EF4444",
    border: "none",
    borderRadius: "6px",
    padding: "3px 8px",
    fontSize: "11px",
    cursor: "pointer",
  },
  floatingDockWrapper: {
    position: "absolute",
    bottom: "16px",
    left: "0",
    right: "0",
    display: "flex",
    justifyContent: "center",
    pointerEvents: "none",
    zIndex: 60,
  },
  floatingDock: {
    pointerEvents: "auto",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    backgroundColor: "rgba(11, 17, 32, 0.92)",
    backdropFilter: "blur(24px)",
    padding: "6px 14px",
    borderRadius: "32px",
    border: "1px solid rgba(255,255,255,0.14)",
    boxShadow: "0 16px 36px rgba(0,0,0,0.65)",
  },
  dockBtn: {
    backgroundColor: "rgba(255,255,255,0.06)",
    color: "#F8FAFC",
    border: "none",
    borderRadius: "22px",
    padding: "8px 14px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: 600,
    transition: "all 0.2s ease",
  },
  dockBtnActive: {
    backgroundColor: "rgba(56, 189, 248, 0.22)",
    color: "#38BDF8",
    border: "1px solid rgba(56, 189, 248, 0.45)",
    borderRadius: "22px",
    padding: "8px 14px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: 600,
    boxShadow: "0 0 12px rgba(56, 189, 248, 0.3)",
  },
  dockBtnDanger: {
    backgroundColor: "rgba(239, 68, 68, 0.2)",
    color: "#EF4444",
    border: "1px solid rgba(239, 68, 68, 0.35)",
    borderRadius: "22px",
    padding: "8px 14px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: 600,
  },
  dockBtnAmber: {
    backgroundColor: "rgba(245, 158, 11, 0.22)",
    color: "#F59E0B",
    border: "1px solid rgba(245, 158, 11, 0.45)",
    borderRadius: "22px",
    padding: "8px 14px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: 600,
  },
  dockDivider: {
    width: "1px",
    height: "24px",
    backgroundColor: "rgba(255,255,255,0.12)",
    margin: "0 2px",
  },
  dockLeaveBtn: {
    backgroundColor: "#DC2626",
    color: "#FFFFFF",
    border: "none",
    borderRadius: "22px",
    padding: "8px 16px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: 700,
    marginLeft: "4px",
  },
  dockIcon: {
    fontSize: "14px",
  },
  dockLabel: {
    fontSize: "12px",
  },
  reactionsTray: {
    position: "absolute",
    bottom: "58px",
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    gap: "8px",
    backgroundColor: "#0B1120",
    padding: "8px 14px",
    borderRadius: "24px",
    boxShadow: "0 12px 30px rgba(0,0,0,0.6)",
    border: "1px solid rgba(255,255,255,0.12)",
    zIndex: 100,
  },
  reactionEmojiItem: {
    background: "transparent",
    border: "none",
    fontSize: "22px",
    cursor: "pointer",
    padding: "4px 6px",
    borderRadius: "8px",
  },
  hostDropdown: {
    position: "absolute",
    bottom: "56px",
    left: "50%",
    transform: "translateX(-50%)",
    backgroundColor: "#0B1120",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: "14px",
    padding: "8px",
    minWidth: "210px",
    boxShadow: "0 12px 30px rgba(0,0,0,0.7)",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    zIndex: 100,
  },
  hostMenuHeader: {
    fontSize: "11px",
    color: "#94A3B8",
    textTransform: "uppercase",
    padding: "4px 8px",
    fontWeight: 700,
  },
  hostMenuItem: {
    backgroundColor: "transparent",
    color: "#F1F5F9",
    border: "none",
    borderRadius: "8px",
    padding: "8px 12px",
    fontSize: "12px",
    textAlign: "left",
    cursor: "pointer",
    fontWeight: 500,
  },
  hostDivider: {
    height: "1px",
    backgroundColor: "rgba(255,255,255,0.08)",
    margin: "4px 0",
  },
  floatingReactionsLayer: {
    position: "fixed",
    inset: 0,
    pointerEvents: "none",
    zIndex: 9999,
    overflow: "hidden",
  },
  floatingReactionPill: {
    position: "absolute",
    bottom: "100px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    background: "rgba(11, 17, 32, 0.9)",
    padding: "6px 14px",
    borderRadius: "20px",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    color: "#FFFFFF",
    fontSize: "14px",
    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
    animation: "floatUp 2.8s ease-out forwards",
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    backdropFilter: "blur(6px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 200,
  },
  settingsModalCard: {
    backgroundColor: "#0B1120",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "20px",
    padding: "24px",
    width: "100%",
    maxWidth: "420px",
    boxShadow: "0 24px 48px rgba(0,0,0,0.8)",
  },
  modalHeaderRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "18px",
  },
  modalTitle: {
    fontSize: "16px",
    fontWeight: 700,
    margin: 0,
  },
  settingsBody: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
    marginBottom: "20px",
  },
  settingsItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 14px",
    borderRadius: "10px",
    backgroundColor: "rgba(255,255,255,0.04)",
    fontSize: "13px",
  },
  settingsLabel: {
    color: "#E2E8F0",
    fontWeight: 500,
  },
  saveSettingsBtn: {
    width: "100%",
    backgroundColor: "#0284C7",
    color: "#FFFFFF",
    border: "none",
    borderRadius: "10px",
    padding: "10px 0",
    fontWeight: 600,
    fontSize: "13px",
    cursor: "pointer",
  },
  whiteboardContainer: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    position: "relative",
    width: "100%",
    height: "100%",
    borderRadius: "16px",
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.1)",
  },
  whiteboardToolbar: {
    position: "absolute",
    top: "14px",
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    backgroundColor: "rgba(11, 17, 32, 0.92)",
    backdropFilter: "blur(16px)",
    padding: "8px 16px",
    borderRadius: "24px",
    border: "1px solid rgba(255,255,255,0.12)",
    zIndex: 10,
    boxShadow: "0 10px 24px rgba(0,0,0,0.5)",
  },
  colorPalette: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  colorCircle: {
    width: "20px",
    height: "20px",
    borderRadius: "50%",
    cursor: "pointer",
    padding: 0,
  },
  toolBtn: {
    backgroundColor: "transparent",
    color: "#94A3B8",
    border: "none",
    padding: "4px 8px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
  },
  toolBtnActive: {
    backgroundColor: "rgba(56, 189, 248, 0.2)",
    color: "#38BDF8",
    border: "1px solid rgba(56, 189, 248, 0.4)",
    padding: "4px 8px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
  },
  clearBoardBtn: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    color: "#EF4444",
    border: "none",
    padding: "4px 10px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
  },
  whiteboardCanvas: {
    width: "100%",
    height: "100%",
    backgroundColor: "#0B1120",
    cursor: "crosshair",
  },
  paginationBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "14px",
    padding: "8px",
  },
  pageBtn: {
    backgroundColor: "rgba(255,255,255,0.08)",
    border: "none",
    color: "#FFFFFF",
    borderRadius: "8px",
    padding: "6px 12px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: 600,
  },
  pageInfo: {
    fontSize: "12px",
    color: "#94A3B8",
  },
};
