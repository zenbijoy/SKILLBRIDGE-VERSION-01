import React, { useEffect, useRef, useState } from "react";
import { RemoteAudioProps } from "./RemoteAudio";

/**
 * Web RemoteAudio element.
 * Fix C-5: Browsers block autoplay until a user gesture occurs.
 * Strategy:
 *   1. Try to play normally (works if user has interacted with the page).
 *   2. If blocked (NotAllowedError), set muted=true and play silently.
 *   3. Show an "Unmute" overlay so the user can tap once to restore audio.
 *   4. On any interaction anywhere on the page, attempt to unmute automatically.
 */
export const RemoteAudio: React.FC<RemoteAudioProps> = ({ stream, isSpeakerOn }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isAutoplayBlocked, setIsAutoplayBlocked] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !stream) return;

    audio.srcObject = stream;

    // Attempt full-volume playback first (requires prior user gesture on page).
    const tryPlay = async () => {
      try {
        audio.muted = false;
        await audio.play();
        setIsAutoplayBlocked(false);
      } catch (err: any) {
        if (err?.name === "NotAllowedError") {
          // Fallback: play muted so the stream stays alive; surface an unmute prompt.
          try {
            audio.muted = true;
            await audio.play();
            setIsAutoplayBlocked(true);
          } catch {
            // Stream simply can't play — nothing we can do without a user gesture.
          }
        } else {
          console.warn("[RemoteAudio] Unexpected play error:", err);
        }
      }
    };

    void tryPlay();

    // When the user interacts anywhere on the page, try to unmute automatically.
    const handleUserGesture = () => {
      if (audio.muted && !audio.paused) {
        audio.muted = false;
        setIsAutoplayBlocked(false);
      }
    };
    document.addEventListener("click", handleUserGesture, { once: true });
    document.addEventListener("keydown", handleUserGesture, { once: true });

    return () => {
      document.removeEventListener("click", handleUserGesture);
      document.removeEventListener("keydown", handleUserGesture);
    };
  }, [stream]);

  // Respect isSpeakerOn toggle (web cannot switch output device without AudioContext hacks,
  // but we honour the flag for future extension).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    // No-op on web — speaker switching requires setSinkId() with explicit device IDs.
  }, [isSpeakerOn]);

  if (!stream) return null;

  return (
    <>
      <audio
        ref={audioRef}
        autoPlay
        style={{ display: "none" }}
      />
      {isAutoplayBlocked && (
        <div
          onClick={() => {
            const audio = audioRef.current;
            if (audio) {
              audio.muted = false;
              audio.play().catch(() => {});
              setIsAutoplayBlocked(false);
            }
          }}
          style={{
            position: "fixed",
            bottom: 100,
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "rgba(56, 189, 248, 0.95)",
            color: "#fff",
            padding: "10px 20px",
            borderRadius: 24,
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
            zIndex: 99999,
            boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
            userSelect: "none",
          }}
        >
          🔊 Tap to hear the other person
        </div>
      )}
    </>
  );
};
