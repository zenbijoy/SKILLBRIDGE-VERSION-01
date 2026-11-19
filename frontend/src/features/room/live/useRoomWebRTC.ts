import { useEffect, useRef, useState, useCallback } from "react";
import { getSocket } from "@/lib/socket";
import { fetchIceServers, IceServerItem } from "@/features/calls/services/iceServers";
import { createPeerConnection } from "@/features/calls/services/peerConnection";
import { mediaDevices, RTCIceCandidate, RTCSessionDescription, isWebRTCSupported } from "@/features/calls/services/webrtc";
import { triggerHaptic } from "@/components/ui";

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

  const localStreamRef = useRef<any | null>(null);
  const peerConnectionsRef = useRef<Map<string, any>>(new Map()); // socketId -> RTCPeerConnection
  const remotePeersDataRef = useRef<Map<string, RoomRemotePeer>>(new Map()); // socketId -> Peer Data
  const iceServersRef = useRef<IceServerItem[]>(customIceServers || []);
  const pendingCandidatesRef = useRef<Map<string, any[]>>(new Map()); // socketId -> RTCIceCandidate[]
  const isJoinedRef = useRef(false);

  // 1. Initialize Local Audio / Video Tracks
  const setupLocalMedia = useCallback(
    async (mediaType: "audio" | "video"): Promise<any> => {
      if (!isWebRTCSupported() || !mediaDevices?.getUserMedia) {
        throw new Error("WebRTC media capture is not supported on this platform.");
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
        localStreamRef.current = stream;
        setLocalStream(stream);
        setIsVideoOn(mediaType === "video");
        return stream;
      } catch (err: any) {
        console.warn("Requested constraints failed, attempting audio-only fallback:", err?.message || err);
        const fallbackStream = await mediaDevices.getUserMedia({ audio: true, video: false });
        localStreamRef.current = fallbackStream;
        setLocalStream(fallbackStream);
        setIsVideoOn(false);
        return fallbackStream;
      }
    },
    [isFrontCamera],
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
          const remoteStream = event.streams?.[0] || new (window as any).MediaStream([event.track]);
          const current = remotePeersDataRef.current.get(targetSocketId) || {
            socketId: targetSocketId,
            userId: peerInfo.userId,
            name: peerInfo.name,
            avatarUrl: peerInfo.avatarUrl,
            role: peerInfo.role,
            stream: remoteStream,
            isMuted: peerInfo.isMuted,
            isVideoEnabled: peerInfo.isVideoEnabled,
            isSpeaking: peerInfo.isSpeaking,
            isHandRaised: peerInfo.isHandRaised,
          };
          current.stream = remoteStream;
          remotePeersDataRef.current.set(targetSocketId, current);
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
            current.stream = event.stream;
            remotePeersDataRef.current.set(targetSocketId, current);
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
          await pc.setRemoteDescription(desc);

          // Drain queued candidates
          const queued = pendingCandidatesRef.current.get(fromSocketId) || [];
          for (const cand of queued) {
            await pc.addIceCandidate(cand);
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

          // Drain queued candidates
          const queued = pendingCandidatesRef.current.get(fromSocketId) || [];
          for (const cand of queued) {
            await pc.addIceCandidate(cand);
          }
          pendingCandidatesRef.current.delete(fromSocketId);
        } else if (type === "candidate") {
          const cand = RTCIceCandidate ? new RTCIceCandidate(signal) : signal;
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(cand);
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
          setActiveSpeakerId(peer.userId);
        }

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
    };
  }, [roomId, createPeer, leave]);

  // 5. Controls
  const toggleMicrophone = useCallback(() => {
    const stream = localStreamRef.current;
    if (stream?.getAudioTracks) {
      const nextMuted = !isMuted;
      stream.getAudioTracks().forEach((track: any) => {
        track.enabled = !nextMuted;
      });
      setIsMuted(nextMuted);

      const socket = getSocket();
      socket?.emit("room:webrtc:state", { roomId, isMuted: nextMuted });
      triggerHaptic();
    }
  }, [roomId, isMuted]);

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
        // Fallback: re-acquire with updated facing mode
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
    isVideoOn,
    isFrontCamera,
    isHandRaised,
    activeSpeakerId,
    reactions,
    mediaSync,
    participantCount: remotePeers.length + 1,
    join,
    leave,
    toggleMicrophone,
    toggleCamera,
    toggleCameraFacing,
    toggleRaiseHand,
    sendReaction,
    sendMediaSync,
    moderatePeer,
  };
}
