import React, { useEffect } from "react";
import { AudioSession } from "@livekit/react-native";
import { RemoteAudioProps } from "./RemoteAudio";

/**
 * Native VoIP AudioSession manager.
 * Configures iOS AVAudioSession and Android AudioManager for crisp two-way call audio,
 * handles speaker/earpiece routing, and terminates the session upon unmount.
 */
export const RemoteAudio: React.FC<RemoteAudioProps> = ({ isSpeakerOn }) => {
  useEffect(() => {
    let isActive = true;

    (async () => {
      try {
        await AudioSession.startAudioSession();
        if (isActive && isSpeakerOn !== undefined) {
          await AudioSession.selectAudioOutput(isSpeakerOn ? "speaker" : "earpiece");
        }
      } catch (err) {
        console.warn("[RemoteAudio] Native AudioSession initialization:", err);
      }
    })();

    return () => {
      isActive = false;
      try {
        AudioSession.stopAudioSession();
      } catch {}
    };
  }, []);

  useEffect(() => {
    if (isSpeakerOn !== undefined) {
      AudioSession.selectAudioOutput(isSpeakerOn ? "speaker" : "earpiece").catch(() => {});
    }
  }, [isSpeakerOn]);

  return null;
};
