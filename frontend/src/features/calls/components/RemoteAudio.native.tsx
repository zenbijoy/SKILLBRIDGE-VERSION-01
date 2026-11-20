import React, { useEffect } from "react";
import { AudioSession } from "@livekit/react-native";
import { RemoteAudioProps } from "./RemoteAudio";
import { useCallStore } from "../store/callStore";

/**
 * Native VoIP AudioSession manager.
 * Configures iOS AVAudioSession and Android AudioManager for crisp two-way call audio,
 * handles speaker/earpiece routing, and terminates the session upon call end (safe with minimization).
 */
export const RemoteAudio: React.FC<RemoteAudioProps> = ({ isSpeakerOn }) => {
  useEffect(() => {
    (async () => {
      try {
        await AudioSession.startAudioSession();
      } catch (err) {
        console.warn("[RemoteAudio] Native AudioSession initialization:", err);
      }
    })();

    return () => {
      const currentCall = useCallStore.getState().activeCall;
      if (!currentCall || !currentCall.isMinimized || currentCall.status === "ended" || currentCall.status === "failed") {
        try {
          AudioSession.stopAudioSession();
        } catch {}
      }
    };
  }, []);

  useEffect(() => {
    if (isSpeakerOn !== undefined) {
      AudioSession.selectAudioOutput(isSpeakerOn ? "speaker" : "earpiece").catch(() => {});
    }
  }, [isSpeakerOn]);

  return null;
};
