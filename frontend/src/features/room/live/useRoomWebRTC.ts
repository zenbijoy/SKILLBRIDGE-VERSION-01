import { useEffect, useRef, useState, useCallback } from "react";
import { Platform, PermissionsAndroid } from "react-native";
import { getSocket } from "@/lib/socket";
import { fetchIceServers, IceServerItem } from "@/features/calls/services/iceServers";
import { createPeerConnection } from "@/features/calls/services/peerConnection";
import { mediaDevices, RTCIceCandidate, RTCSessionDescription, isWebRTCSupported } from "@/features/calls/services/webrtc";
import { triggerHaptic } from "@/components/ui";

let NativeAudioSession: any = null;
if (Platform.OS !== "web") {
  try {
    NativeAudioSession = require("@livekit/react-native").AudioSession;
  } catch (_) {}
}

export interface RoomPeerMetadata {
  socketId: string;
  userId: string;
  name: string;
  avatarUrl?: string | null;
  role: string;
  media: "audio" | "video";
  isMuted: boolean;
  isVideoEnabled: boolean;
  isSpeaking: boolean;
  isHandRaised: boolean;
  joinedAt: number;
}

export interface RoomRemotePeer {
  socketId: string;
  userId: string;
  name: string;
  avatarUrl?: string | null;
  role: string;
  stream: any | null;
  isMuted: boolean;
  isVideoEnabled: boolean;
  isSpeaking: boolean;
  isHandRaised: boolean;
  audioLevel?: number;
}

export interface FloatingReaction {
  id: string;
  emoji: string;
  senderName: string;
  senderId: string;
  xOffset: number; // randomized floating trajectory 0..1
  timestamp: number;
}

export interface CoStudyMediaState {
  isPlaying: boolean;
  currentTime: number;
  mediaUrl: string | null;
  mediaTitle: string | null;
  lastUpdatedBy: string | null;
}

export interface RoomLivePoll {
  id: string;
  roomId: string;
  question: string;
  options: { id: number; text: string; votes: number }[];
  voters: Record<string, number>;
  creatorName: string;
  isOpen: boolean;
  createdAt: number;
}

export interface RoomSharedResource {
  id: string;
  roomId: string;
  title: string;
  url: string;
  type: "link" | "doc" | "pdf" | "code";
  sharedByName: string;
  sharedByAvatar?: string | null;
  timestamp: number;
}

export interface LiveBroadcastAlert {
  id: string;
  message: string;
  senderId: string;
  senderName: string;
  durationMs: number;
  timestamp: number;
}

export interface RoomWhisperMessage {
  id: string;
  senderSocketId: string;
  senderUserId: string;
  senderName: string;
  senderAvatar?: string | null;
  message: string;
  timestamp: number;
}

export interface BreakoutGroupInfo {
  roomId: string;
  groups: { groupId: string; groupName: string; members: string[] }[];
  durationMinutes: number;
  startedAt: number;
}

export interface BookmarkedMoment {
  id: string;
  timestampSeconds: number;
  note: string;
  createdAt: number;
}

export interface HandRaiseItem {
  socketId: string;
  userId: string;
  name: string;
  avatarUrl?: string | null;
  raisedAt: number;
}

export interface UseRoomWebRTCOptions {
  roomId: string;
  initialMedia?: "audio" | "video";
  userName?: string;
  userAvatar?: string | null;
  userRole?: string;
  customIceServers?: IceServerItem[];
  autoConnect?: boolean;
}

export function useRoomWebRTC({
  roomId,
  initialMedia = "video",
  userName = "Member",
  userAvatar = null,
  userRole = "member",
  customIceServers,
  autoConnect = true,
}: UseRoomWebRTCOptions) {
  const [connectionStatus, setConnectionStatus] = useState<
    "disconnected" | "connecting" | "connected" | "reconnecting" | "failed"
  >("disconnected");
  const [error, setError] = useState<string | null>(null);

  const [localStream, setLocalStream] = useState<any | null>(null);
  const [remotePeers, setRemotePeers] = useState<RoomRemotePeer[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isLocalSpeaking, setIsLocalSpeaking] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(initialMedia === "video");
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [mediaSync, setMediaSync] = useState<CoStudyMediaState>({
    isPlaying: false,
    currentTime: 0,
    mediaUrl: null,
    mediaTitle: null,
    lastUpdatedBy: null,
  });

  // 1. Network Latency & Quality Monitor
  const [networkQuality, setNetworkQuality] = useState<"excellent" | "good" | "poor" | "reconnecting">("excellent");
  const [latencyMs, setLatencyMs] = useState<number>(45);

  // 2. Interactive Live Polls
  const [currentPoll, setCurrentPoll] = useState<RoomLivePoll | null>(null);

  // 3. Stage Shared Resources Hub
  const [sharedResources, setSharedResources] = useState<RoomSharedResource[]>([]);

  // 4. Collaborative Live Whiteboard Strokes
  const [whiteboardStrokes, setWhiteboardStrokes] = useState<any[]>([]);

  // 5. Live Broadcast Alert Ticker
  const [activeBroadcast, setActiveBroadcast] = useState<LiveBroadcastAlert | null>(null);

  // 6. In-Room Private Whispers
  const [whispers, setWhispers] = useState<RoomWhisperMessage[]>([]);

  // 7. Breakout Study Groups
  const [breakoutInfo, setBreakoutInfo] = useState<BreakoutGroupInfo | null>(null);

  // 8. Low-Data Saver Mode
  const [isLowDataMode, setIsLowDataMode] = useState<boolean>(false);

  // 9. Screen Share State
  const [isScreenSharing, setIsScreenSharing] = useState<boolean>(false);

  // 10. Virtual Backdrop Filter
  const [virtualBackground, setVirtualBackground] = useState<"none" | "blur" | "library" | "sunset" | "studio">("none");

  // 11. Study Attendance & Focus Streak Tracker
  const [studyMinutes, setStudyMinutes] = useState<number>(0);
  const [xpEarned, setXpEarned] = useState<number>(0);

  // 12. Key Moment Bookmarks / Notes
  const [bookmarkedMoments, setBookmarkedMoments] = useState<BookmarkedMoment[]>([]);

  // 13. Audio Enhancement Filter Mode
  const [audioFilterMode, setAudioFilterMode] = useState<"standard" | "voice_boost" | "music">("standard");

  // 14. Speaker Spotlight Pinning
  const [pinnedPeerId, setPinnedPeerId] = useState<string | null>(null);

  // 15. Hand-Raise Queue with Ordered Timestamps
  const [handRaiseQueue, setHandRaiseQueue] = useState<HandRaiseItem[]>([]);

  const localStreamRef = useRef<any | null>(null);
  const peerConnectionsRef = useRef<Map<string, any>>(new Map()); // socketId -> RTCPeerConnection
  const remotePeersDataRef = useRef<Map<string, RoomRemotePeer>>(new Map()); // socketId -> Peer Data
  const iceServersRef = useRef<IceServerItem[]>(customIceServers || []);
  const pendingCandidatesRef = useRef<Map<string, any[]>>(new Map()); // socketId -> RTCIceCandidate[]
  const isJoinedRef = useRef(false);

  // VAD & Audio Monitoring References
  const audioContextRef = useRef<any>(null);
  const analyserRef = useRef<any>(null);
  const vadIntervalRef = useRef<any>(null);
  const speakingDebounceTimerRef = useRef<any>(null);
  const isSpeakingReportedRef = useRef<boolean>(false);
  const isMutedRef = useRef(false);
  const activeSpeakerIdRef = useRef<string | null>(null);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // 1. Initialize Local Audio / Video Tracks
  const setupLocalMedia = useCallback(
    async (mediaType: "audio" | "video"): Promise<any> => {
      if (!isWebRTCSupported() || !mediaDevices?.getUserMedia) {
        throw new Error("WebRTC media capture is not supported on this platform.");
      }

      // Android runtime permissions for audio & video
      if (Platform.OS === "android") {
        try {
          const perms = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
          if (mediaType === "video") {
            perms.push(PermissionsAndroid.PERMISSIONS.CAMERA);
          }
          await PermissionsAndroid.requestMultiple(perms);
        } catch (permErr) {
          console.warn("[useRoomWebRTC] Android permission request error:", permErr);
        }
      }

      // Initialize Native AudioSession for VoIP communication
      if (NativeAudioSession) {
        try {
          await NativeAudioSession.startAudioSession();
          await NativeAudioSession.selectAudioOutput(isSpeakerOn ? "speaker" : "earpiece");
        } catch (audioErr) {
          console.warn("[useRoomWebRTC] Native audio session start error:", audioErr);
        }
      }

      // Reuse active tracks if already live
      if (localStreamRef.current?.getTracks) {
        const liveTracks = localStreamRef.current.getTracks().filter((t: any) => t.readyState === "live");
        if (liveTracks.length > 0) {
          return localStreamRef.current;
        }
      }

      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video:
          mediaType === "video"
            ? {
                facingMode: isFrontCamera ? "user" : "environment",
                width: { ideal: 640 },
                height: { ideal: 480 },
                frameRate: { ideal: 24 },
              }
            : false,
      };

      try {
        const stream = await mediaDevices.getUserMedia(constraints);
        if (stream?.getAudioTracks) {
          stream.getAudioTracks().forEach((track: any) => {
            track.enabled = !isMutedRef.current;
          });
        }
        localStreamRef.current = stream;
        setLocalStream(stream);
        setIsVideoOn(mediaType === "video");
        return stream;
      } catch (err: any) {
        console.warn("Requested constraints failed, attempting audio-only fallback:", err?.message || err);
        const fallbackStream = await mediaDevices.getUserMedia({ audio: true, video: false });
        if (fallbackStream?.getAudioTracks) {
          fallbackStream.getAudioTracks().forEach((track: any) => {
            track.enabled = !isMutedRef.current;
          });
        }
        localStreamRef.current = fallbackStream;
        setLocalStream(fallbackStream);
        setIsVideoOn(false);
        return fallbackStream;
      }
    },
    [isFrontCamera, isSpeakerOn],
  );

  // Helper: Create peer connection to a specific remote peer socket
  const createPeer = useCallback(
    (targetSocketId: string, peerInfo: RoomPeerMetadata, isInitiator: boolean) => {
      const socket = getSocket();
      if (!socket) return null;

      try {
        const pc = createPeerConnection(iceServersRef.current);
        peerConnectionsRef.current.set(targetSocketId, pc);

        // Add local tracks to peer connection
        const stream = localStreamRef.current;
        if (stream) {
          if (stream.getTracks) {
            stream.getTracks().forEach((track: any) => {
              try {
                pc.addTrack(track, stream);
              } catch (e) {
                try {
                  pc.addStream(stream);
                } catch (_) {}
              }
            });
          } else if (pc.addStream) {
            pc.addStream(stream);
          }
        }

        // Handle remote stream / track arrival
        pc.ontrack = (event: any) => {
          let remoteStream = event.streams?.[0];
          if (!remoteStream && typeof window !== "undefined" && (window as any).MediaStream) {
            try {
              remoteStream = new (window as any).MediaStream([event.track]);
            } catch (_) {}
          }
          const current = remotePeersDataRef.current.get(targetSocketId) || {
            socketId: targetSocketId,
            userId: peerInfo.userId,
            name: peerInfo.name,
            avatarUrl: peerInfo.avatarUrl,
            role: peerInfo.role,
            stream: remoteStream || null,
            isMuted: peerInfo.isMuted,
            isVideoEnabled: peerInfo.isVideoEnabled,
            isSpeaking: peerInfo.isSpeaking,
            isHandRaised: peerInfo.isHandRaised,
          };
          if (remoteStream) {
            current.stream = remoteStream;
          } else if (current.stream && event.track && typeof current.stream.addTrack === "function") {
            try {
              current.stream.addTrack(event.track);
            } catch (_) {}
          }
          remotePeersDataRef.current.set(targetSocketId, { ...current });
          setRemotePeers(Array.from(remotePeersDataRef.current.values()));
        };

        if (pc.onaddstream !== undefined) {
          pc.onaddstream = (event: any) => {
            const current = remotePeersDataRef.current.get(targetSocketId) || {
              socketId: targetSocketId,
              userId: peerInfo.userId,
              name: peerInfo.name,
              avatarUrl: peerInfo.avatarUrl,
              role: peerInfo.role,
              stream: event.stream,
              isMuted: peerInfo.isMuted,
              isVideoEnabled: peerInfo.isVideoEnabled,
              isSpeaking: peerInfo.isSpeaking,
              isHandRaised: peerInfo.isHandRaised,
            };
            if (event.stream) {
              current.stream = event.stream;
            }
            remotePeersDataRef.current.set(targetSocketId, { ...current });
            setRemotePeers(Array.from(remotePeersDataRef.current.values()));
          };
        }

        // Handle ICE candidates generated locally
        pc.onicecandidate = (event: any) => {
          if (event.candidate) {
            socket.emit("room:webrtc:signal", {
              roomId,
              toSocketId: targetSocketId,
              type: "candidate",
              signal: event.candidate,
            });
          }
        };

        // Auto-recover from transient ICE connection failures (e.g. WiFi <-> 4G handover)
        pc.oniceconnectionstatechange = () => {
          const state = pc.iceConnectionState || pc.connectionState;
          if (state === "failed") {
            console.warn(`[useRoomWebRTC] ICE failed with peer ${targetSocketId}, restarting ICE`);
            if (isInitiator) {
              pc.createOffer({ iceRestart: true })
                .then((offer: any) => pc.setLocalDescription(offer))
                .then(() => {
                  socket.emit("room:webrtc:signal", {
                    roomId,
                    toSocketId: targetSocketId,
                    type: "offer",
                    signal: pc.localDescription,
                  });
                })
                .catch((e: any) => console.warn(`ICE restart failed with ${targetSocketId}:`, e));
            }
          }
        };

        // If this peer is initiator, create and send SDP Offer
        if (isInitiator) {
          pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
            .then((offer: any) => pc.setLocalDescription(offer))
            .then(() => {
              socket.emit("room:webrtc:signal", {
                roomId,
                toSocketId: targetSocketId,
                type: "offer",
                signal: pc.localDescription,
              });
            })
            .catch((err: any) => {
              console.warn(`Failed creating offer for peer ${targetSocketId}:`, err);
            });
        }

        return pc;
      } catch (err: any) {
        console.error(`Error initializing RTCPeerConnection for ${targetSocketId}:`, err);
        return null;
      }
    },
    [roomId],
  );

  // 2. Connect / Join Room Mesh
  const join = useCallback(async () => {
    if (!roomId || isJoinedRef.current) return;
    setConnectionStatus("connecting");
    setError(null);

    try {
      // Step A: Load ICE servers if not loaded
      if (iceServersRef.current.length === 0) {
        const servers = await fetchIceServers();
        iceServersRef.current = servers;
      }

      // Step B: Setup local media stream
      await setupLocalMedia(initialMedia);

      // Step C: Join room mesh signaling via Socket.IO
      const socket = getSocket();
      if (!socket) {
        throw new Error("Realtime socket is not connected. Please check your internet connection.");
      }

      socket.emit(
        "room:webrtc:join",
        {
          roomId,
          name: userName,
          avatarUrl: userAvatar,
          media: initialMedia,
          role: userRole,
        },
        (response: any) => {
          if (response?.error) {
            setError(response.error);
            setConnectionStatus("failed");
            return;
          }

          isJoinedRef.current = true;
          setConnectionStatus("connected");

          // Connect to each existing peer in the room (I am the initiator)
          const existingPeers: RoomPeerMetadata[] = response?.peers || [];
          existingPeers.forEach((peer) => {
            if (peer.socketId === socket.id) return;
            remotePeersDataRef.current.set(peer.socketId, {
              socketId: peer.socketId,
              userId: peer.userId,
              name: peer.name,
              avatarUrl: peer.avatarUrl,
              role: peer.role,
              stream: null,
              isMuted: peer.isMuted,
              isVideoEnabled: peer.isVideoEnabled,
              isSpeaking: peer.isSpeaking,
              isHandRaised: peer.isHandRaised,
            });
            createPeer(peer.socketId, peer, true);
          });

          setRemotePeers(Array.from(remotePeersDataRef.current.values()));

          if (response?.poll) {
            setCurrentPoll(response.poll);
          }
          if (Array.isArray(response?.resources)) {
            setSharedResources(response.resources);
          }
        },
      );
    } catch (err: any) {
      console.error("Room WebRTC Join failed:", err);
      setError(err?.message || "Could not connect to room stream.");
      setConnectionStatus("failed");
    }
  }, [roomId, initialMedia, userName, userAvatar, userRole, setupLocalMedia, createPeer]);

  // 3. Leave Room Mesh
  const leave = useCallback(() => {
    const socket = getSocket();
    if (socket && roomId) {
      socket.emit("room:webrtc:leave", { roomId });
    }

    // Stop and close all peer connections
    peerConnectionsRef.current.forEach((pc) => {
      try {
        pc.close();
      } catch (_) {}
    });
    peerConnectionsRef.current.clear();
    remotePeersDataRef.current.clear();
    pendingCandidatesRef.current.clear();
    setRemotePeers([]);

    // Stop local media tracks
    if (localStreamRef.current?.getTracks) {
      localStreamRef.current.getTracks().forEach((track: any) => {
        try {
          track.stop();
        } catch (_) {}
      });
    }
    localStreamRef.current = null;
    setLocalStream(null);

    // Stop Native VoIP AudioSession
    if (NativeAudioSession) {
      try {
        NativeAudioSession.stopAudioSession();
      } catch (_) {}
    }

    // Clean up Web Audio VAD & timers
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      try {
        audioContextRef.current.close().catch(() => {});
      } catch (_) {}
    }
    audioContextRef.current = null;
    analyserRef.current = null;

    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
    if (speakingDebounceTimerRef.current) {
      clearTimeout(speakingDebounceTimerRef.current);
      speakingDebounceTimerRef.current = null;
    }
    isSpeakingReportedRef.current = false;
    setIsLocalSpeaking(false);

    isJoinedRef.current = false;
    setConnectionStatus("disconnected");
  }, [roomId]);

  // 4. Socket Events Listener (Signals, Peer Join/Leave, Reactions, State)
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !roomId) return;

    // Handle incoming peer joined (I am the answerer for them)
    const handlePeerJoined = (payload: { peer: RoomPeerMetadata; participantCount: number }) => {
      const { peer } = payload || {};
      if (!peer || peer.socketId === socket.id) return;

      remotePeersDataRef.current.set(peer.socketId, {
        socketId: peer.socketId,
        userId: peer.userId,
        name: peer.name,
        avatarUrl: peer.avatarUrl,
        role: peer.role,
        stream: null,
        isMuted: peer.isMuted,
        isVideoEnabled: peer.isVideoEnabled,
        isSpeaking: peer.isSpeaking,
        isHandRaised: peer.isHandRaised,
      });
      setRemotePeers(Array.from(remotePeersDataRef.current.values()));

      // Initialize peer connection (wait for incoming offer from them)
      createPeer(peer.socketId, peer, false);
      triggerHaptic();
    };

    // Handle peer left
    const handlePeerLeft = (payload: { socketId: string; userId: string; participantCount: number }) => {
      const { socketId } = payload || {};
      if (!socketId) return;

      const pc = peerConnectionsRef.current.get(socketId);
      if (pc) {
        try {
          pc.close();
        } catch (_) {}
        peerConnectionsRef.current.delete(socketId);
      }
      remotePeersDataRef.current.delete(socketId);
      pendingCandidatesRef.current.delete(socketId);
      setRemotePeers(Array.from(remotePeersDataRef.current.values()));
    };

    // Handle incoming WebRTC signals (Offer, Answer, Candidate)
    const handleSignal = async (payload: {
      fromSocketId: string;
      fromUserId: string;
      signal: any;
      type: "offer" | "answer" | "candidate";
      roomId: string;
    }) => {
      const { fromSocketId, signal, type } = payload || {};
      if (!fromSocketId || !signal) return;

      let pc = peerConnectionsRef.current.get(fromSocketId);
      if (!pc && type === "offer") {
        const dummyMeta: RoomPeerMetadata = {
          socketId: fromSocketId,
          userId: payload.fromUserId,
          name: "Peer",
          role: "member",
          media: "video",
          isMuted: false,
          isVideoEnabled: true,
          isSpeaking: false,
          isHandRaised: false,
          joinedAt: Date.now(),
        };
        pc = createPeer(fromSocketId, dummyMeta, false);
      }

      if (!pc) return;

      try {
        if (type === "offer") {
          const desc = RTCSessionDescription ? new RTCSessionDescription(signal) : signal;
          if (pc.signalingState !== "stable") {
            try {
              await pc.setLocalDescription({ type: "rollback" } as any);
            } catch (_) {}
          }
          await pc.setRemoteDescription(desc);

          // Drain queued candidates safely (never allow candidate error to break SDP answer)
          const queued = pendingCandidatesRef.current.get(fromSocketId) || [];
          for (const cand of queued) {
            try {
              await pc.addIceCandidate(cand);
            } catch (_) {}
          }
          pendingCandidatesRef.current.delete(fromSocketId);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          socket.emit("room:webrtc:signal", {
            roomId,
            toSocketId: fromSocketId,
            type: "answer",
            signal: pc.localDescription,
          });
        } else if (type === "answer") {
          const desc = RTCSessionDescription ? new RTCSessionDescription(signal) : signal;
          await pc.setRemoteDescription(desc);

          // Drain queued candidates safely
          const queued = pendingCandidatesRef.current.get(fromSocketId) || [];
          for (const cand of queued) {
            try {
              await pc.addIceCandidate(cand);
            } catch (_) {}
          }
          pendingCandidatesRef.current.delete(fromSocketId);
        } else if (type === "candidate") {
          const cand = RTCIceCandidate ? new RTCIceCandidate(signal) : signal;
          if (pc.remoteDescription && pc.remoteDescription.type) {
            try {
              await pc.addIceCandidate(cand);
            } catch (_) {}
          } else {
            const list = pendingCandidatesRef.current.get(fromSocketId) || [];
            list.push(cand);
            pendingCandidatesRef.current.set(fromSocketId, list);
          }
        }
      } catch (sigErr) {
        console.warn(`Signal handling error (${type}) from ${fromSocketId}:`, sigErr);
      }
    };

    // Handle peer state updates (mic mute, camera off, speaking, etc.)
    const handleState = (payload: {
      socketId: string;
      userId: string;
      isMuted?: boolean;
      isVideoEnabled?: boolean;
      isSpeaking?: boolean;
      isHandRaised?: boolean;
      audioLevel?: number;
    }) => {
      const { socketId } = payload || {};
      const peer = remotePeersDataRef.current.get(socketId);
      if (peer) {
        if (typeof payload.isMuted === "boolean") peer.isMuted = payload.isMuted;
        if (typeof payload.isVideoEnabled === "boolean") peer.isVideoEnabled = payload.isVideoEnabled;
        if (typeof payload.isSpeaking === "boolean") peer.isSpeaking = payload.isSpeaking;
        if (typeof payload.isHandRaised === "boolean") peer.isHandRaised = payload.isHandRaised;
        if (typeof payload.audioLevel === "number") peer.audioLevel = payload.audioLevel;

        if (payload.isSpeaking) {
          activeSpeakerIdRef.current = peer.userId;
          setActiveSpeakerId(peer.userId);
        } else {
          setTimeout(() => {
            if (activeSpeakerIdRef.current === peer.userId) {
              activeSpeakerIdRef.current = null;
              setActiveSpeakerId((cur) => (cur === peer.userId ? null : cur));
            }
          }, 1200);
        }

        remotePeersDataRef.current.set(socketId, { ...peer });
        setRemotePeers(Array.from(remotePeersDataRef.current.values()));
      }
    };

    // Handle incoming floating emoji reaction
    const handleReaction = (payload: { emoji: string; senderId: string; senderName: string; timestamp: number }) => {
      const reactionItem: FloatingReaction = {
        id: `${payload.senderId}-${Date.now()}-${Math.random()}`,
        emoji: payload.emoji,
        senderName: payload.senderName,
        senderId: payload.senderId,
        xOffset: Math.random() * 0.7 + 0.15, // float between 15% and 85% width
        timestamp: payload.timestamp || Date.now(),
      };
      setReactions((prev) => [...prev.slice(-20), reactionItem]);
      triggerHaptic();

      // Auto prune after 3.2s
      setTimeout(() => {
        setReactions((prev) => prev.filter((r) => r.id !== reactionItem.id));
      }, 3200);
    };

    // Handle hand raise changes
    const handleHandChanged = (payload: { socketId: string; userId: string; isHandRaised: boolean; name: string }) => {
      const peer = remotePeersDataRef.current.get(payload.socketId);
      if (peer) {
        peer.isHandRaised = payload.isHandRaised;
        remotePeersDataRef.current.set(payload.socketId, { ...peer });
        setRemotePeers(Array.from(remotePeersDataRef.current.values()));
      }
      triggerHaptic();
    };

    // Handle co-study synchronized media events
    const handleMediaSync = (payload: any) => {
      setMediaSync({
        isPlaying: payload.type === "PLAY",
        currentTime: typeof payload.currentTime === "number" ? payload.currentTime : 0,
        mediaUrl: payload.mediaUrl || null,
        mediaTitle: payload.mediaTitle || null,
        lastUpdatedBy: payload.senderId || null,
      });
    };

    // Handle host moderation force mute
    const handleForceMute = () => {
      if (localStreamRef.current?.getAudioTracks) {
        localStreamRef.current.getAudioTracks().forEach((t: any) => {
          t.enabled = false;
        });
        setIsMuted(true);
        triggerHaptic();
      }
    };

    // Handle host ended session
    const handleRoomEnded = () => {
      leave();
    };

    socket.on("room:webrtc:peer-joined", handlePeerJoined);
    socket.on("room:webrtc:peer-left", handlePeerLeft);
    socket.on("room:webrtc:signal", handleSignal);
    socket.on("room:webrtc:state", handleState);
    socket.on("room:webrtc:reaction", handleReaction);
    socket.on("room:webrtc:hand-changed", handleHandChanged);
    socket.on("room:webrtc:media-sync", handleMediaSync);
    socket.on("room:webrtc:force-mute", handleForceMute);
    socket.on("room:webrtc:room-ended", handleRoomEnded);

    // Latency Ping / Pong
    const handlePong = (payload: { clientTimestamp: number; serverTimestamp: number }) => {
      const rtt = Math.max(12, Date.now() - (payload?.clientTimestamp || Date.now()));
      setLatencyMs(rtt);
      if (rtt < 120) setNetworkQuality("excellent");
      else if (rtt < 280) setNetworkQuality("good");
      else setNetworkQuality("poor");
    };

    // Collaborative Live Whiteboard
    const handleWhiteboardDraw = (stroke: any) => {
      setWhiteboardStrokes((prev) => [...prev, stroke]);
    };
    const handleWhiteboardClear = () => {
      setWhiteboardStrokes([]);
    };

    // Live Polls
    const handlePollUpdate = (poll: RoomLivePoll) => {
      setCurrentPoll(poll);
      triggerHaptic();
    };

    // Shared Resources
    const handleResourceNew = (resource: RoomSharedResource) => {
      setSharedResources((prev) => [resource, ...prev.filter((r) => r.id !== resource.id)]);
      triggerHaptic();
    };

    // Broadcast Alert
    const handleBroadcast = (alert: LiveBroadcastAlert) => {
      setActiveBroadcast(alert);
      triggerHaptic();
      setTimeout(() => {
        setActiveBroadcast((curr) => (curr?.id === alert.id ? null : curr));
      }, alert.durationMs || 8000);
    };

    // Private Whispers
    const handleWhisper = (whisper: RoomWhisperMessage) => {
      setWhispers((prev) => [...prev.slice(-30), whisper]);
      triggerHaptic();
    };

    // Breakouts
    const handleBreakoutStarted = (info: BreakoutGroupInfo) => {
      setBreakoutInfo(info);
      triggerHaptic();
    };
    const handleBreakoutEnded = () => {
      setBreakoutInfo(null);
      triggerHaptic();
    };

    socket.on("room:webrtc:pong", handlePong);
    socket.on("room:webrtc:whiteboard:draw", handleWhiteboardDraw);
    socket.on("room:webrtc:whiteboard:clear", handleWhiteboardClear);
    socket.on("room:webrtc:poll:update", handlePollUpdate);
    socket.on("room:webrtc:resource:new", handleResourceNew);
    socket.on("room:webrtc:broadcast", handleBroadcast);
    socket.on("room:webrtc:whisper", handleWhisper);
    socket.on("room:webrtc:breakout:started", handleBreakoutStarted);
    socket.on("room:webrtc:breakout:ended", handleBreakoutEnded);

    return () => {
      socket.off("room:webrtc:peer-joined", handlePeerJoined);
      socket.off("room:webrtc:peer-left", handlePeerLeft);
      socket.off("room:webrtc:signal", handleSignal);
      socket.off("room:webrtc:state", handleState);
      socket.off("room:webrtc:reaction", handleReaction);
      socket.off("room:webrtc:hand-changed", handleHandChanged);
      socket.off("room:webrtc:media-sync", handleMediaSync);
      socket.off("room:webrtc:force-mute", handleForceMute);
      socket.off("room:webrtc:room-ended", handleRoomEnded);
      socket.off("room:webrtc:pong", handlePong);
      socket.off("room:webrtc:whiteboard:draw", handleWhiteboardDraw);
      socket.off("room:webrtc:whiteboard:clear", handleWhiteboardClear);
      socket.off("room:webrtc:poll:update", handlePollUpdate);
      socket.off("room:webrtc:resource:new", handleResourceNew);
      socket.off("room:webrtc:broadcast", handleBroadcast);
      socket.off("room:webrtc:whisper", handleWhisper);
      socket.off("room:webrtc:breakout:started", handleBreakoutStarted);
      socket.off("room:webrtc:breakout:ended", handleBreakoutEnded);
    };
  }, [roomId, createPeer, leave]);

  // Ping Latency Loop
  useEffect(() => {
    if (!roomId || connectionStatus !== "connected") return;
    const interval = setInterval(() => {
      const socket = getSocket();
      socket?.emit("room:webrtc:ping", { timestamp: Date.now() });
    }, 4500);
    return () => clearInterval(interval);
  }, [roomId, connectionStatus]);

  // Attendance & Study Streak Tracker
  useEffect(() => {
    if (connectionStatus !== "connected") return;
    const interval = setInterval(() => {
      setStudyMinutes((prev) => {
        const next = prev + 1;
        if (next === 10 || next === 20 || next === 30 || next === 45) {
          setXpEarned((x) => x + 15);
          triggerHaptic();
        }
        return next;
      });
    }, 60000);
    return () => clearInterval(interval);
  }, [connectionStatus]);

  // Setup Web Audio VAD Analyser when localStream changes
  useEffect(() => {
    if (typeof window !== "undefined" && localStream) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        try {
          if (audioContextRef.current && audioContextRef.current.state !== "closed") {
            audioContextRef.current.close().catch(() => {});
          }
          const ctx = new AudioCtx();
          if (ctx.state === "suspended") {
            ctx.resume().catch(() => {});
          }
          const source = ctx.createMediaStreamSource(localStream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 512;
          analyser.smoothingTimeConstant = 0.4;
          source.connect(analyser);

          audioContextRef.current = ctx;
          analyserRef.current = analyser;
        } catch (err) {
          console.warn("[useRoomWebRTC] Web Audio Analyser setup warning:", err);
        }
      }
    }

    return () => {
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => {});
      }
      analyserRef.current = null;
    };
  }, [localStream]);

  // VAD volume checker loop
  useEffect(() => {
    const socket = getSocket();

    vadIntervalRef.current = setInterval(() => {
      if (isMuted || !localStreamRef.current) {
        if (isSpeakingReportedRef.current) {
          isSpeakingReportedRef.current = false;
          setIsLocalSpeaking(false);
          if (activeSpeakerIdRef.current === "local") {
            activeSpeakerIdRef.current = null;
            setActiveSpeakerId((cur) => (cur === "local" ? null : cur));
          }
          socket?.emit("room:webrtc:state", { roomId, isSpeaking: false, audioLevel: 0 });
        }
        return;
      }

      if (audioContextRef.current && audioContextRef.current.state === "suspended") {
        audioContextRef.current.resume().catch(() => {});
      }

      let volume = 0;

      // 1. Web Audio Analyser (Web)
      if (analyserRef.current) {
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        volume = sum / dataArray.length; // 0..255
      }

      // 2. WebRTC peer connection stats fallback (Native & Web)
      if (volume === 0 && peerConnectionsRef.current.size > 0) {
        const firstPc = peerConnectionsRef.current.values().next().value;
        if (firstPc && typeof firstPc.getStats === "function") {
          firstPc.getStats().then((stats: any) => {
            if (!stats) return;
            stats.forEach((report: any) => {
              if (
                (report.type === "media-source" && report.kind === "audio") ||
                (report.type === "outbound-rtp" && report.kind === "audio")
              ) {
                if (typeof report.audioLevel === "number") {
                  volume = report.audioLevel * 100;
                }
              }
            });
          }).catch(() => {});
        }
      }

      const isSpeakingNow = volume > 10; // Speech threshold

      if (isSpeakingNow) {
        if (speakingDebounceTimerRef.current) {
          clearTimeout(speakingDebounceTimerRef.current);
          speakingDebounceTimerRef.current = null;
        }
        if (!isSpeakingReportedRef.current) {
          isSpeakingReportedRef.current = true;
          setIsLocalSpeaking(true);
          activeSpeakerIdRef.current = "local";
          setActiveSpeakerId("local");
          socket?.emit("room:webrtc:state", {
            roomId,
            isSpeaking: true,
            audioLevel: Math.min(1, volume / 100),
          });
        }
      } else {
        if (isSpeakingReportedRef.current && !speakingDebounceTimerRef.current) {
          speakingDebounceTimerRef.current = setTimeout(() => {
            isSpeakingReportedRef.current = false;
            setIsLocalSpeaking(false);
            if (activeSpeakerIdRef.current === "local") {
              activeSpeakerIdRef.current = null;
              setActiveSpeakerId((cur) => (cur === "local" ? null : cur));
            }
            socket?.emit("room:webrtc:state", { roomId, isSpeaking: false, audioLevel: 0 });
            speakingDebounceTimerRef.current = null;
          }, 450);
        }
      }
    }, 120);

    return () => {
      if (vadIntervalRef.current) clearInterval(vadIntervalRef.current);
      if (speakingDebounceTimerRef.current) clearTimeout(speakingDebounceTimerRef.current);
    };
  }, [roomId, isMuted]);

  // 5. Controls
  const toggleMicrophone = useCallback(() => {
    const stream = localStreamRef.current;
    if (stream?.getAudioTracks) {
      const nextMuted = !isMutedRef.current;
      isMutedRef.current = nextMuted;
      stream.getAudioTracks().forEach((track: any) => {
        track.enabled = !nextMuted;
      });
      setIsMuted(nextMuted);

      const socket = getSocket();
      socket?.emit("room:webrtc:state", { roomId, isMuted: nextMuted, isSpeaking: false });
      if (nextMuted) {
        setIsLocalSpeaking(false);
        isSpeakingReportedRef.current = false;
        if (activeSpeakerIdRef.current === "local") {
          activeSpeakerIdRef.current = null;
          setActiveSpeakerId((cur) => (cur === "local" ? null : cur));
        }
      }
      triggerHaptic();
    }
  }, [roomId]);

  const toggleSpeaker = useCallback(() => {
    setIsSpeakerOn((prev) => {
      const next = !prev;
      if (NativeAudioSession) {
        NativeAudioSession.selectAudioOutput(next ? "speaker" : "earpiece").catch(() => {});
      }
      triggerHaptic();
      return next;
    });
  }, []);

  const toggleCamera = useCallback(async () => {
    const stream = localStreamRef.current;
    if (stream?.getVideoTracks) {
      const nextVideo = !isVideoOn;
      stream.getVideoTracks().forEach((track: any) => {
        track.enabled = nextVideo;
      });
      setIsVideoOn(nextVideo);

      const socket = getSocket();
      socket?.emit("room:webrtc:state", { roomId, isVideoEnabled: nextVideo });
      triggerHaptic();
    }
  }, [roomId, isVideoOn]);

  const toggleCameraFacing = useCallback(async () => {
    const stream = localStreamRef.current;
    if (stream?.getVideoTracks) {
      const nextFront = !isFrontCamera;
      setIsFrontCamera(nextFront);

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack?._switchCamera) {
        videoTrack._switchCamera();
      } else {
        try {
          const newStream = await mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: nextFront ? "user" : "environment" },
          });
          const newTrack = newStream.getVideoTracks()[0];
          if (newTrack) {
            peerConnectionsRef.current.forEach((pc) => {
              const senders = pc.getSenders ? pc.getSenders() : [];
              const videoSender = senders.find((s: any) => s.track?.kind === "video");
              if (videoSender?.replaceTrack) {
                videoSender.replaceTrack(newTrack);
              }
            });
            videoTrack.stop();
            stream.removeTrack(videoTrack);
            stream.addTrack(newTrack);
          }
        } catch (_) {}
      }
      triggerHaptic();
    }
  }, [isFrontCamera]);

  const toggleRaiseHand = useCallback(() => {
    const nextHand = !isHandRaised;
    setIsHandRaised(nextHand);
    const socket = getSocket();
    socket?.emit("room:webrtc:raise-hand", { roomId, isHandRaised: nextHand });
    triggerHaptic();
  }, [roomId, isHandRaised]);

  const sendReaction = useCallback(
    (emoji: string) => {
      const socket = getSocket();
      socket?.emit("room:webrtc:reaction", { roomId, emoji, senderName: userName });

      // Local optimistic reaction display
      const reactionItem: FloatingReaction = {
        id: `local-${Date.now()}-${Math.random()}`,
        emoji,
        senderName: userName,
        senderId: "me",
        xOffset: Math.random() * 0.7 + 0.15,
        timestamp: Date.now(),
      };
      setReactions((prev) => [...prev.slice(-20), reactionItem]);
      triggerHaptic();

      setTimeout(() => {
        setReactions((prev) => prev.filter((r) => r.id !== reactionItem.id));
      }, 3200);
    },
    [roomId, userName],
  );

  const sendMediaSync = useCallback(
    (type: "PLAY" | "PAUSE" | "SEEK" | "LOAD_MEDIA", currentTime?: number, mediaUrl?: string, mediaTitle?: string) => {
      const socket = getSocket();
      socket?.emit("room:webrtc:media-sync", {
        roomId,
        type,
        currentTime,
        mediaUrl,
        mediaTitle,
      });
      setMediaSync((prev) => ({
        ...prev,
        isPlaying: type === "PLAY",
        currentTime: currentTime !== undefined ? currentTime : prev.currentTime,
        mediaUrl: mediaUrl || prev.mediaUrl,
        mediaTitle: mediaTitle || prev.mediaTitle,
        lastUpdatedBy: "me",
      }));
    },
    [roomId],
  );

  const moderatePeer = useCallback(
    (action: "mute" | "kick" | "spotlight" | "end_room", targetUserId?: string, targetSocketId?: string) => {
      const socket = getSocket();
      socket?.emit("room:webrtc:moderation", {
        roomId,
        action,
        targetUserId,
        targetSocketId,
      });
      triggerHaptic();
    },
    [roomId],
  );

  const createPoll = useCallback((question: string, options: string[]) => {
    const socket = getSocket();
    socket?.emit("room:webrtc:poll:create", { roomId, question, options, creatorName: userName });
    triggerHaptic();
  }, [roomId, userName]);

  const votePoll = useCallback((optionId: number) => {
    const socket = getSocket();
    socket?.emit("room:webrtc:poll:vote", { roomId, optionId });
    triggerHaptic();
  }, [roomId]);

  const closePoll = useCallback(() => {
    const socket = getSocket();
    socket?.emit("room:webrtc:poll:close", { roomId });
    triggerHaptic();
  }, [roomId]);

  const shareResource = useCallback((title: string, url: string, type: "link" | "doc" | "pdf" | "code" = "link") => {
    const socket = getSocket();
    socket?.emit("room:webrtc:resource:share", {
      roomId,
      title,
      url,
      type,
      sharedByName: userName,
      sharedByAvatar: userAvatar,
    });
    triggerHaptic();
  }, [roomId, userName, userAvatar]);

  const broadcastStroke = useCallback((stroke: any) => {
    setWhiteboardStrokes((prev) => [...prev, stroke]);
    const socket = getSocket();
    socket?.emit("room:webrtc:whiteboard:draw", { roomId, stroke });
  }, [roomId]);

  const clearWhiteboard = useCallback(() => {
    setWhiteboardStrokes([]);
    const socket = getSocket();
    socket?.emit("room:webrtc:whiteboard:clear", { roomId });
    triggerHaptic();
  }, [roomId]);

  const sendBroadcast = useCallback((message: string, durationMs = 8000) => {
    const socket = getSocket();
    socket?.emit("room:webrtc:broadcast", { roomId, message, durationMs, senderName: userName });
    triggerHaptic();
  }, [roomId, userName]);

  const sendWhisper = useCallback((toSocketId: string, message: string) => {
    const socket = getSocket();
    socket?.emit("room:webrtc:whisper", {
      roomId,
      toSocketId,
      message,
      senderName: userName,
      senderAvatar: userAvatar,
    });
    setWhispers((prev) => [
      ...prev,
      {
        id: `sent-${Date.now()}`,
        senderSocketId: "self",
        senderUserId: "self",
        senderName: "You",
        message,
        timestamp: Date.now(),
      },
    ]);
    triggerHaptic();
  }, [roomId, userName, userAvatar]);

  const startBreakout = useCallback((durationMinutes = 10, groupSize = 2) => {
    const socket = getSocket();
    socket?.emit("room:webrtc:breakout:start", { roomId, durationMinutes, groupSize });
    triggerHaptic();
  }, [roomId]);

  const endBreakout = useCallback(() => {
    const socket = getSocket();
    socket?.emit("room:webrtc:breakout:end", { roomId });
    triggerHaptic();
  }, [roomId]);

  const toggleLowDataMode = useCallback(() => {
    setIsLowDataMode((prev) => {
      const next = !prev;
      remotePeersDataRef.current.forEach((peer) => {
        if (peer.stream?.getVideoTracks) {
          peer.stream.getVideoTracks().forEach((track: any) => {
            track.enabled = !next;
          });
        }
      });
      triggerHaptic();
      return next;
    });
  }, []);

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      await setupLocalMedia("video");
      setIsScreenSharing(false);
    } else {
      try {
        if (typeof (navigator?.mediaDevices as any)?.getDisplayMedia === "function") {
          const screenStream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: true });
          const screenTrack = screenStream.getVideoTracks()[0];
          if (screenTrack) {
            peerConnectionsRef.current.forEach((pc) => {
              const senders = pc.getSenders ? pc.getSenders() : [];
              const videoSender = senders.find((s: any) => s.track?.kind === "video");
              if (videoSender?.replaceTrack) {
                videoSender.replaceTrack(screenTrack);
              }
            });
            screenTrack.onended = () => {
              void setupLocalMedia("video");
              setIsScreenSharing(false);
            };
            setLocalStream(screenStream);
            setIsScreenSharing(true);
            triggerHaptic();
          }
        }
      } catch (e) {
        console.warn("Screen share failed:", e);
      }
    }
  }, [isScreenSharing, setupLocalMedia]);

  const bookmarkMoment = useCallback((note: string) => {
    const item: BookmarkedMoment = {
      id: `bm-${Date.now()}`,
      timestampSeconds: studyMinutes * 60,
      note: note.trim(),
      createdAt: Date.now(),
    };
    setBookmarkedMoments((prev) => [item, ...prev]);
    triggerHaptic();
  }, [studyMinutes]);

  const inviteToSpeak = useCallback((targetSocketId: string) => {
    const socket = getSocket();
    socket?.emit("room:webrtc:whisper", {
      roomId,
      toSocketId: targetSocketId,
      message: "🎤 The host invited you to unmute and speak!",
      senderName: userName,
      senderAvatar: userAvatar,
    });
    triggerHaptic();
  }, [roomId, userName, userAvatar]);

  // Auto connect if configured
  useEffect(() => {
    if (autoConnect) {
      void join();
    }
    return () => {
      leave();
    };
  }, [autoConnect, join, leave]);

  return {
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
    participantCount: remotePeers.length + 1,
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
    join,
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
  };
}
