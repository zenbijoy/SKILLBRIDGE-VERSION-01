import React, { useEffect, useRef } from "react";
import { RemoteAudioProps } from "./RemoteAudio";

/**
 * Web RemoteAudio element.
 * Attaches the incoming WebRTC MediaStream audio track to an HTML5 <audio> element
 * with autoPlay and playsInline so remote voice is audible during both audio and video calls.
 */
export const RemoteAudio: React.FC<RemoteAudioProps> = ({ stream }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (audioRef.current && stream) {
      audioRef.current.srcObject = stream;
      audioRef.current.play().catch((err) => {
        console.warn("[RemoteAudio] Autoplay pending user interaction:", err);
      });
    }
  }, [stream]);

  if (!stream) return null;

  return (
    <audio
      ref={audioRef}
      autoPlay
      playsInline
      style={{ display: "none" }}
    />
  );
};
