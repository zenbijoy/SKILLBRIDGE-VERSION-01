export type RealtimeProvider = "webrtc" | "livekit" | "youtube";

export type SessionMode = "call" | "study-room" | "ct-prep" | "broadcast";

/**
 * SkillBridge Hybrid Routing Decision Engine
 * 1-2 participants -> Raw WebRTC P2P (0 server cost)
 * 3+ interactive participants -> LiveKit SFU
 * Large club broadcast -> YouTube Live
 */
export function selectRealtimeProvider(
  participantCount: number,
  mode: SessionMode = "call",
  p2pEnabled = true,
): RealtimeProvider {
  if (mode === "broadcast") {
    return "youtube";
  }

  if (p2pEnabled && participantCount <= 2 && mode === "call") {
    return "webrtc";
  }

  return "livekit";
}
