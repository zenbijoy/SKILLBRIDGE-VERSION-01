import { useEffect, useRef, useState, useCallback } from "react";
import { getSocket, onSocket } from "@/lib/socket";
import { fetchIceServers } from "../services/iceServers";
import { createPeerConnection } from "../services/peerConnection";
import { mediaDevices, RTCIceCandidate, RTCSessionDescription } from "../services/webrtc";
import { useCallStore } from "../store/callStore";
import { endCallApi } from "../services/callApi";
import { QualityMetrics, NetworkQuality, CandidateType } from "../types";
import { callSounds } from "../services/callSounds";

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
  const connectStartTimeRef = useRef<number>(0);
  const offerCreatedRef = useRef<boolean>(false);
  const offerInFlightRef = useRef<boolean>(false);

  // Authoritative current call ID ref to avoid stale closures during asynchronous events
  const currentCallIdRef = useRef<string | undefined>(callId || activeCall?.callId);
  useEffect(() => {
    const id = activeCall?.callId || callId;
    if (id) currentCallIdRef.current = id;
  }, [activeCall?.callId, callId]);

  // Trickle ICE Candidate Queue (Prevents dropped candidates before remoteDescription is set)
  const pendingCandidatesRef = useRef<any[]>([]);

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

  // Drain and apply queued ICE candidates
  const flushPendingCandidates = useCallback(async (pc: any) => {
    if (!pc || !pc.remoteDescription) return;
    const candidates = [...pendingCandidatesRef.current];
    pendingCandidatesRef.current = [];
    for (const cand of candidates) {
      try {
        const iceCandidate = RTCIceCandidate && !(cand instanceof RTCIceCandidate) ? new RTCIceCandidate(cand) : cand;
        await pc.addIceCandidate(iceCandidate);
      } catch (err) {
        console.warn("Could not add queued ICE candidate:", err);
      }
    }
  }, []);

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
      callSounds.playCallEnd();
      return;
    }

    isReconnectingRef.current = true;
    reconnectAttemptsRef.current += 1;
    setCallStatus("reconnecting");

    const targetCallId = activeCall?.callId || callId;
    const socket = getSocket();
    if (targetCallId && socket) {
      socket.emit("call:reconnect", { callId: targetCallId });
    }

    const pc = pcRef.current;
    if (pc && typeof pc.restartIce === "function") {
      try {
        pc.restartIce();
      } catch {
        // Non-fatal
      }
    }

    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = setTimeout(() => {
      isReconnectingRef.current = false;
    }, RECONNECT_COOLDOWN_MS);
  }, [activeCall?.callId, callId, setCallStatus]);

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
        } else if (event.track) {
          setRemoteStream((prev: any) => {
            if (prev) {
              try { prev.addTrack(event.track); } catch {}
              return prev;
            }
            try {
              const streamConstructor = (mediaDevices as any)?.MediaStream || (globalThis as any)?.MediaStream;
              if (typeof streamConstructor === "function") {
                const newStream = new streamConstructor();
                newStream.addTrack(event.track);
                return newStream;
              }
            } catch {}
            return null;
          });
        }
      };

      // ICE Candidate generation with authoritative call ID resolution
      pc.onicecandidate = (event: any) => {
        const socket = getSocket();
        const targetCallId =
          currentCallIdRef.current ||
          useCallStore.getState().activeCall?.callId ||
          activeCall?.callId ||
          callId;

        if (event.candidate && socket && targetCallId) {
          socket.emit("call:ice-candidate", {
            callId: targetCallId,
            candidate: event.candidate,
          });
        }
      };

      // Connection State Change Listeners (Both standard and ICE connection states)
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === "connected") {
          callSounds.stopAll();
          setCallStatus("connected");
          connectStartTimeRef.current = Date.now();
          reconnectAttemptsRef.current = 0;
          isReconnectingRef.current = false;
        } else if (state === "disconnected" || state === "failed") {
          triggerIceRestart();
        } else if (state === "closed") {
          setCallStatus("ended");
        }
      };

      pc.oniceconnectionstatechange = () => {
        const iceState = pc.iceConnectionState;
        if (iceState === "connected" || iceState === "completed") {
          callSounds.stopAll();
          setCallStatus("connected");
          if (!connectStartTimeRef.current) connectStartTimeRef.current = Date.now();
          reconnectAttemptsRef.current = 0;
          isReconnectingRef.current = false;
        } else if (iceState === "failed") {
          triggerIceRestart();
        }
      };

      return pc;
    },
    [activeCall?.callId, callId, setCallStatus, triggerIceRestart],
  );

  // 5. Complete Resource Cleanup & Hangup
  const endCall = useCallback(
    async (reason = "hangup") => {
      await callSounds.stopAll();

      if (reason === "declined" || reason === "busy") {
        callSounds.playBusy();
      } else {
        callSounds.playCallEnd();
      }

      if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      if (statsTimerRef.current) clearInterval(statsTimerRef.current);

      const targetCallId = activeCall?.callId || callId;
      const duration = activeCall?.durationSeconds || 0;
      const setupTime = Math.max(0, Date.now() - connectStartTimeRef.current);
      const isRelay = activeCall?.metrics?.relayUsed || false;
      const reconnects = reconnectAttemptsRef.current;

      const socket = getSocket();
      if (targetCallId && socket) {
        socket.emit("call:end", { callId: targetCallId, durationSeconds: duration });
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

      pendingCandidatesRef.current = [];
      offerCreatedRef.current = false;
      offerInFlightRef.current = false;
      setCallStatus("ended");
      resetCall();
    },
    [activeCall?.callId, activeCall?.durationSeconds, activeCall?.metrics, callId, setCallStatus, resetCall],
  );

  // 6. Sound Effects for Outgoing Calling
  useEffect(() => {
    if (activeCall?.role === "caller" && (activeCall.status === "ringing" || activeCall.status === "initiating")) {
      callSounds.playRingback();
    } else if (activeCall?.status === "connected") {
      callSounds.stopAll();
    }
  }, [activeCall?.role, activeCall?.status]);

  // 7. Duration Timer & Stats Polling
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

  // Helper to create and send WebRTC SDP Offer (Idempotent & InvalidStateError safe)
  const sendOffer = useCallback(async (targetCallId: string) => {
    if (offerCreatedRef.current || offerInFlightRef.current) return;

    try {
      offerInFlightRef.current = true;
      setCallStatus("connecting");
      let stream = localStreamRef.current;
      if (!stream) {
        stream = await initLocalMedia(activeCall?.type || "video");
      }

      let pc = pcRef.current;
      if (!pc) {
        pc = await setupPeerConnection(stream);
      }

      if (pc.signalingState !== "stable") {
        offerInFlightRef.current = false;
        return;
      }

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: (activeCall?.type || "video") === "video",
      });
      await pc.setLocalDescription(offer);
      offerCreatedRef.current = true;

      const socket = getSocket();
      socket?.emit("call:offer", { callId: targetCallId, sdp: offer });
    } catch (err: any) {
      console.error("Failed to create WebRTC SDP Offer:", err);
      setCallStatus("failed");
    } finally {
      offerInFlightRef.current = false;
    }
  }, [activeCall?.type, initLocalMedia, setupPeerConnection, setCallStatus]);

  // 8. Robust Socket Signaling Listeners
  useEffect(() => {
    const unsubOffer = onSocket("call:offer", async (payload: { callId: string; sdp: any }) => {
      const currentCallId = currentCallIdRef.current || activeCall?.callId || callId;
      if (currentCallId && currentCallId !== payload.callId) return;

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

        const desc =
          RTCSessionDescription && !(payload.sdp instanceof RTCSessionDescription)
            ? new RTCSessionDescription(payload.sdp)
            : payload.sdp;
        await pc.setRemoteDescription(desc);
        await flushPendingCandidates(pc);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        const socket = getSocket();
        socket?.emit("call:answer", { callId: payload.callId, sdp: answer });
      } catch (err: any) {
        console.error("Failed to process WebRTC SDP Offer:", err);
        setCallStatus("failed");
      }
    });

    const unsubAnswer = onSocket("call:answer", async (payload: { callId: string; sdp: any }) => {
      const currentCallId = currentCallIdRef.current || activeCall?.callId || callId;
      if (currentCallId && currentCallId !== payload.callId) return;

      try {
        const pc = pcRef.current;
        if (pc && pc.signalingState === "have-local-offer") {
          const desc =
            RTCSessionDescription && !(payload.sdp instanceof RTCSessionDescription)
              ? new RTCSessionDescription(payload.sdp)
              : payload.sdp;
          await pc.setRemoteDescription(desc);
          await flushPendingCandidates(pc);
          setCallStatus("connecting");
        }
      } catch (err: any) {
        console.error("Failed to process WebRTC SDP Answer:", err);
      }
    });

    const unsubIce = onSocket("call:ice-candidate", async (payload: { callId: string; candidate: any }) => {
      const currentCallId = currentCallIdRef.current || activeCall?.callId || callId;
      if (currentCallId && currentCallId !== payload.callId) return;

      try {
        const pc = pcRef.current;
        if (pc && pc.remoteDescription && pc.remoteDescription.type) {
          const iceCandidate =
            RTCIceCandidate && !(payload.candidate instanceof RTCIceCandidate)
              ? new RTCIceCandidate(payload.candidate)
              : payload.candidate;
          await pc.addIceCandidate(iceCandidate);
        } else {
          // Queue candidate until remoteDescription is set
          pendingCandidatesRef.current.push(payload.candidate);
        }
      } catch (err) {
        console.warn("Could not add incoming ICE candidate:", err);
      }
    });

    // When callee signals readiness or acceptance, caller sends the offer (for WebRTC P2P)
    const unsubReady = onSocket("call:ready", async (payload: { callId: string }) => {
      const currentCallId = currentCallIdRef.current || activeCall?.callId || callId;
      if (currentCallId && currentCallId !== payload.callId) return;
      if (activeCall?.provider === "livekit") return;
      const role = activeCall?.role || useCallStore.getState().activeCall?.role;
      if (role === "caller") {
        await sendOffer(payload.callId);
      }
    });

    const unsubAccept = onSocket("call:accept", async (payload: { callId: string }) => {
      const currentCallId = currentCallIdRef.current || activeCall?.callId || callId;
      if (currentCallId && currentCallId !== payload.callId) return;
      setCallStatus("accepted");
      if (activeCall?.provider === "livekit") return;
      const role = activeCall?.role || useCallStore.getState().activeCall?.role;
      if (role === "caller") {
        await sendOffer(payload.callId);
      }
    });

    const unsubReject = onSocket("call:reject", () => endCall("declined"));
    const unsubEnd = onSocket("call:end", () => endCall("remote_ended"));
    const unsubReconnect = onSocket("call:reconnect", () => triggerIceRestart());

    return () => {
      unsubOffer();
      unsubAnswer();
      unsubIce();
      unsubReady();
      unsubAccept();
      unsubReject();
      unsubEnd();
      unsubReconnect();
    };
  }, [
    activeCall?.callId,
    activeCall?.role,
    activeCall?.type,
    activeCall?.provider,
    callId,
    initLocalMedia,
    setupPeerConnection,
    flushPendingCandidates,
    sendOffer,
    endCall,
    triggerIceRestart,
    setCallStatus,
  ]);

  // 9. Track Controls
  const toggleMuteTrack = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track: any) => {
        track.enabled = !track.enabled;
      });
    }
    toggleMute();
  }, [toggleMute]);

  const toggleVideoTrack = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((track: any) => {
        track.enabled = !track.enabled;
      });
    }
    toggleVideo();
  }, [toggleVideo]);

  const toggleCameraFacingTrack = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((track: any) => {
        if (typeof track._switchCamera === "function") {
          try { track._switchCamera(); } catch {}
        }
      });
    }
    toggleCameraFacing();
  }, [toggleCameraFacing]);

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
    toggleCameraFacing: toggleCameraFacingTrack,
  };
}
