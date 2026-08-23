import { selectRealtimeProvider } from "./providerRouter";

describe("Realtime Provider Routing & Rollback Decision Matrix", () => {
  it("routes 1-to-1 audio/video calls to WebRTC P2P", () => {
    const provider = selectRealtimeProvider(2, "call", true);
    expect(provider).toBe("webrtc");
  });

  it("routes 3+ participants in group study / CT prep to LiveKit", () => {
    const provider = selectRealtimeProvider(3, "study-room", true);
    expect(provider).toBe("livekit");
  });

  it("routes large club broadcasts to YouTube Live", () => {
    const provider = selectRealtimeProvider(500, "broadcast", true);
    expect(provider).toBe("youtube");
  });

  it("safely rolls back 1:1 calls to LiveKit when P2P is disabled via feature flag", () => {
    const provider = selectRealtimeProvider(2, "call", false);
    expect(provider).toBe("livekit");
  });
});
