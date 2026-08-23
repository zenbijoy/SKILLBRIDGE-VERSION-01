import { useEffect, useRef, useState, useCallback } from "react";
import { getSocket } from "@/lib/socket";
import { fetchIceServers } from "../services/iceServers";
import { createPeerConnection } from "../services/peerConnection";
import { mediaDevices } from "../services/webrtc";
import { useCallStore } from "../store/callStore";
import { endCallApi } from "../services/callApi";
import { QualityMetrics, NetworkQuality, CandidateType } from "../types";

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_COOLDOWN_MS = 2000;

export function useWebRTCCall(callId?: string) {
  const {
    activeCall,
    setCallStatus,
    setDurationSeconds,
    toggleMute,
    toggleVideo,
    toggleSpeaker,
    toggleCameraFacing,
    setMetrics,
    resetCall,
  } = useCallStore();

  const [localStream, setLocalStream] = useState<any | null>(null);
  const [remoteStream, setRemoteStream] = useState<any | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pcRef = useRef<any | null>(null);
  const localStreamRef = useRef<any | null>(null);
  const timerRef = useRef<any>(null);
  const statsTimerRef = useRef<any>(null);
  const ringTimeoutRef = useRef<any>(null);
  const reconnectTimerRef = useRef<any>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const isReconnectingRef = useRef<boolean>(false);
  const connectStartTimeRef = useRef<number>(Date.now());

  const socket = getSocket();

  // 1. Initialize Local Media Stream
  const initLocalMedia = useCallback(
    async (type: "audio" | "video" = "video") => {
      if (!mediaDevices) {
        throw new Error("Media devices are not supported on this platform.");
      }

      try {
        const constraints = {
          audio: true,
          video:
            type === "video"
              ? {
                  facingMode: "user",
                  width: { ideal: 640 },
                  height: { ideal: 480 },
                  frameRate: { ideal: 24 },
                }
              : false,
        };

        const stream = await mediaDevices.getUserMedia(constraints);
        localStreamRef.current = stream;
        setLocalStream(stream);
        return stream;
      } catch (err: any) {
        console.warn("Could not capture requested video constraints, attempting audio-only fallback:", err);
        const fallbackStream = await mediaDevices.getUserMedia({ audio: true, video: false });
        localStreamRef.current = fallbackStream;
        setLocalStream(fallbackStream);
        return fallbackStream;
      }
    },
    [],
  );

  // 2. Strict Real TURN & Candidate-Pair Stats Detection
  const updateStats = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || typeof pc.getStats !== "function") return;

    try {
      const stats = await pc.getStats();
      let rttMs = 50;
      let packetsLost = 0;
      let packetsReceived = 0;
      let jitterMs = 10;
      let bitrateKbps = 300;
      let localCandidateType: CandidateType = "unknown";
      let remoteCandidateType: CandidateType = "unknown";
      let relayUsed = false;

      const candidatesMap = new Map<string, any>();
      let selectedPair: any = null;

      stats.forEach((report: any) => {
        if (report.type === "local-candidate" || report.type === "remote-candidate") {
          candidatesMap.set(report.id, report);
        }
        if (
          report.type === "candidate-pair" &&
          (report.selected || report.state === "succeeded" || report.nominated)
        ) {
          selectedPair = report;
          if (report.currentRoundTripTime !== undefined) {
            rttMs = Math.round(report.currentRoundTripTime * 1000);
          }
        }
        if (report.type === "remote-inbound-rtp") {
          packetsLost = report.packetsLost || 0;
          if (report.jitter !== undefined) {
            jitterMs = Math.round(report.jitter * 1000);
          }
        }
        if (report.type === "inbound-rtp") {
          packetsReceived = report.packetsReceived || 1;
        }
      });

      // Resolve candidate types from the active selected pair ONLY
      if (selectedPair) {
        const localCand = candidatesMap.get(selectedPair.localCandidateId);
        const remoteCand = candidatesMap.get(selectedPair.remoteCandidateId);

        if (localCand?.candidateType) {
          localCandidateType = localCand.candidateType as CandidateType;
        }
        if (remoteCand?.candidateType) {
          remoteCandidateType = remoteCand.candidateType as CandidateType;
        }

        relayUsed = localCandidateType === "relay" || remoteCandidateType === "relay";
      }

      const packetLossPercent =
        packetsReceived > 0 ? Math.min(100, Math.round((packetsLost / (packetsReceived + packetsLost)) * 100)) : 0;

      let quality: NetworkQuality = "excellent";
      if (rttMs > 350 || packetLossPercent > 15) quality = "critical";
      else if (rttMs > 250 || packetLossPercent > 8) quality = "poor";
      else if (rttMs > 150 || packetLossPercent > 3) quality = "fair";
      else if (rttMs > 80) quality = "good";

      const metrics: QualityMetrics = {
        quality,
        rttMs,
        packetLossPercent,
        jitterMs,
        bitrateKbps,
        localCandidateType,
        remoteCandidateType,
        relayUsed,
        isUsingTurn: relayUsed,
      };

      setMetrics(metrics);
    } catch {
      // getStats failure is non-fatal
    }
  }, [setMetrics]);

  // 3. Bounded ICE Restart & Reconnect Mechanism
  const triggerIceRestart = useCallback(() => {
    if (isReconnectingRef.current) return;
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setCallStatus("failed");
      setErrorMessage("Call disconnected due to network instability.");
      return;
    }

    isReconnectingRef.current = true;
    reconnectAttemptsRef.current += 1;
    setCallStatus("reconnecting");

    const targetCallId = activeCall?.callId || callId;
    if (targetCallId) {
      socket?.emit("call:reconnect", { callId: targetCallId });
    }

    const pc = pcRef.current;
    if (pc && typeof pc.restartIce === "function") {
      try {
        pc.restartIce();
      } catch {
        // Non-fatal
      }
    }

    // Cooldown guard before next attempt
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = setTimeout(() => {
      isReconnectingRef.current = false;
    }, RECONNECT_COOLDOWN_MS);
  }, [activeCall?.callId, callId, socket, setCallStatus]);

  // 4. Setup RTCPeerConnection Lifecycle
  const setupPeerConnection = useCallback(
    async (stream: any) => {
      const iceServers = await fetchIceServers();
      const pc = createPeerConnection(iceServers);
      pcRef.current = pc;

      // Add local media tracks
      if (stream) {
        stream.getTracks().forEach((track: any) => {
          try {
            pc.addTrack(track, stream);
          } catch {
            // Track already attached
          }
        });
      }

      // Remote stream handler
      pc.ontrack = (event: any) => {
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
        }
      };

      // ICE Candidate generation
      pc.onicecandidate = (event: any) => {
        if (event.candidate && socket && activeCall?.callId) {
          socket.emit("call:ice-candidate", {
            callId: activeCall.callId,
            candidate: event.candidate,
          });
        }
      };

      // Connection State Change Listeners
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === "connected") {
          setCallStatus("connected");
          reconnectAttemptsRef.current = 0;
          isReconnectingRef.current = false;
        } else if (state === "disconnected" || state === "failed") {
          triggerIceRestart();
        } else if (state === "closed") {
          setCallStatus("ended");
        }
      };

      return pc;
    },
    [socket, activeCall?.callId, setCallStatus, triggerIceRestart],
  );

  // 5. Complete Resource Cleanup & Hangup
  const endCall = useCallback(
    async (reason = "hangup") => {
      if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      if (statsTimerRef.current) clearInterval(statsTimerRef.current);

      const targetCallId = activeCall?.callId || callId;
      const duration = activeCall?.durationSeconds || 0;
      const setupTime = Math.max(0, Date.now() - connectStartTimeRef.current);
      const isRelay = activeCall?.metrics?.relayUsed || false;
      const reconnects = reconnectAttemptsRef.current;

      if (targetCallId) {
        socket?.emit("call:end", { callId: targetCallId, durationSeconds: duration });
        try {
          await endCallApi(targetCallId, duration, reason, {
            relayUsed: isRelay,
            setupTimeMs: setupTime,
            reconnectCount: reconnects,
          });
        } catch {
          // Backend sync failure non-fatal
        }
      }

      // Stop all local tracks safely
      if (localStreamRef.current) {
        try {
          localStreamRef.current.getTracks().forEach((t: any) => {
            try {
              t.stop();
            } catch {}
          });
        } catch {}
        localStreamRef.current = null;
      }
      setLocalStream(null);
      setRemoteStream(null);

      // Close and nullify RTCPeerConnection
      if (pcRef.current) {
        try {
          pcRef.current.ontrack = null;
          pcRef.current.onicecandidate = null;
          pcRef.current.onconnectionstatechange = null;
          pcRef.current.oniceconnectionstatechange = null;
          pcRef.current.close();
        } catch {}
        pcRef.current = null;
      }

      setCallStatus("ended");
      resetCall();
    },
    [activeCall?.callId, activeCall?.durationSeconds, activeCall?.metrics, callId, socket, setCallStatus, resetCall],
  );

  // 6. Duration Timer & Stats Polling
  useEffect(() => {
    if (activeCall?.status === "connected") {
      timerRef.current = setInterval(() => {
        setDurationSeconds((activeCall.durationSeconds || 0) + 1);
      }, 1000);

      statsTimerRef.current = setInterval(() => {
        updateStats();
      }, 3000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (statsTimerRef.current) clearInterval(statsTimerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (statsTimerRef.current) clearInterval(statsTimerRef.current);
    };
  }, [activeCall?.status, activeCall?.durationSeconds, setDurationSeconds, updateStats]);

  // 7. Socket Signaling Listeners
  useEffect(() => {
    if (!socket) return;

    const handleOffer = async (payload: { callId: string; sdp: any }) => {
      if (activeCall && activeCall.callId !== payload.callId) return;

      try {
        setCallStatus("connecting");
        let stream = localStreamRef.current;
        if (!stream) {
          stream = await initLocalMedia(activeCall?.type || "video");
        }

        let pc = pcRef.current;
        if (!pc) {
          pc = await setupPeerConnection(stream);
        }

        await pc.setRemoteDescription(payload.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit("call:answer", { callId: payload.callId, sdp: answer });
      } catch (err: any) {
        console.error("Failed to process WebRTC SDP Offer:", err);
        setCallStatus("failed");
      }
    };

    const handleAnswer = async (payload: { callId: string; sdp: any }) => {
      if (activeCall && activeCall.callId !== payload.callId) return;
      try {
        const pc = pcRef.current;
        if (pc) {
          await pc.setRemoteDescription(payload.sdp);
          setCallStatus("connecting");
        }
      } catch (err: any) {
        console.error("Failed to process WebRTC SDP Answer:", err);
      }
    };

    const handleIceCandidate = async (payload: { callId: string; candidate: any }) => {
      if (activeCall && activeCall.callId !== payload.callId) return;
      try {
        const pc = pcRef.current;
        if (pc && payload.candidate) {
          await pc.addIceCandidate(payload.candidate);
        }
      } catch {
        // Non-fatal candidate race
      }
    };

    const handleAccept = async (payload: { callId: string }) => {
      if (activeCall && activeCall.callId !== payload.callId) return;
      setCallStatus("accepted");

      try {
        const pc = pcRef.current;
        if (pc) {
          const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
          await pc.setLocalDescription(offer);
          socket.emit("call:offer", { callId: payload.callId, sdp: offer });
        }
      } catch (err: any) {
        console.error("Failed to create WebRTC SDP Offer on accept:", err);
        setCallStatus("failed");
      }
    };

    const handleReject = () => endCall("declined");
    const handleEnd = () => endCall("remote_ended");
    const handleReconnect = () => triggerIceRestart();

    socket.on("call:offer", handleOffer);
    socket.on("call:answer", handleAnswer);
    socket.on("call:ice-candidate", handleIceCandidate);
    socket.on("call:accept", handleAccept);
    socket.on("call:reject", handleReject);
    socket.on("call:end", handleEnd);
    socket.on("call:reconnect", handleReconnect);

    return () => {
      socket.off("call:offer", handleOffer);
      socket.off("call:answer", handleAnswer);
      socket.off("call:ice-candidate", handleIceCandidate);
      socket.off("call:accept", handleAccept);
      socket.off("call:reject", handleReject);
      socket.off("call:end", handleEnd);
      socket.off("call:reconnect", handleReconnect);
    };
  }, [socket, activeCall, initLocalMedia, setupPeerConnection, endCall, triggerIceRestart, setCallStatus]);

  // 8. Track Controls
  const toggleMuteTrack = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track: any) => {
        track.enabled = !track.enabled;
      });
      toggleMute();
    }
  }, [toggleMute]);

  const toggleVideoTrack = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((track: any) => {
        track.enabled = !track.enabled;
      });
      toggleVideo();
    }
  }, [toggleVideo]);

  return {
    activeCall,
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
  };
}
