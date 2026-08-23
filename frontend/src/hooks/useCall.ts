import { useState, useCallback, useRef, useEffect } from "react";
import { api } from "@/lib/api";

export type CallStatus =
  | "idle"
  | "initiating"
  | "ringing"
  | "connected"
  | "reconnecting"
  | "ended"
  | "declined"
  | "busy"
  | "failed";

export interface CallDetails {
  callId: string;
  roomName: string;
  token: string;
  url: string;
  callerId: string;
  calleeId: string;
  calleeName?: string;
  calleeAvatar?: string;
  callType: "audio" | "video";
}

export function useCall() {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [callDetails, setCallDetails] = useState<CallDetails | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (status === "connected") {
      setDurationSeconds(0);
      timerRef.current = setInterval(() => {
        setDurationSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status]);

  const initiateCall = useCallback(async (calleeId: string, callType: "audio" | "video" = "video") => {
    setStatus("initiating");
    try {
      const res = await api<{
        callId: string;
        roomName: string;
        token: string;
        url: string;
        calleeName?: string;
        calleeAvatar?: string;
      }>("/live/calls/initiate", {
        method: "POST",
        body: JSON.stringify({ calleeId, callType }),
      });

      setCallDetails({
        callId: res.callId,
        roomName: res.roomName,
        token: res.token,
        url: res.url,
        callerId: "me",
        calleeId,
        calleeName: res.calleeName,
        calleeAvatar: res.calleeAvatar,
        callType,
      });

      setStatus("ringing");
      return res;
    } catch (err: any) {
      console.error("Failed to initiate call:", err);
      setStatus("failed");
      throw err;
    }
  }, []);

  const endCall = useCallback(async () => {
    if (callDetails?.callId) {
      try {
        await api(`/live/calls/${callDetails.callId}/end`, {
          method: "POST",
          body: JSON.stringify({ durationSeconds }),
        });
      } catch (err) {
        console.warn("Could not notify call end to server:", err);
      }
    }
    setStatus("ended");
    setCallDetails(null);
  }, [callDetails, durationSeconds]);

  const toggleMute = useCallback(() => setIsMuted((prev) => !prev), []);
  const toggleVideo = useCallback(() => setIsVideoEnabled((prev) => !prev), []);
  const toggleSpeaker = useCallback(() => setIsSpeakerOn((prev) => !prev), []);

  return {
    status,
    setStatus,
    callDetails,
    durationSeconds,
    isMuted,
    isVideoEnabled,
    isSpeakerOn,
    initiateCall,
    endCall,
    toggleMute,
    toggleVideo,
    toggleSpeaker,
  };
}
