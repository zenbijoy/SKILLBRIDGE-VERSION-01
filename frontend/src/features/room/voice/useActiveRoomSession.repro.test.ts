/**
 * Phase 4 Verification for Bug V2:
 * Verifies that useActiveRoomSession does NOT set isVoiceActive = true prematurely,
 * captures token fetch errors, provides status/error state, and only activates upon onConnected.
 */
import { useActiveRoomSession } from "./useActiveRoomSession";
import { api } from "@/lib/api";

jest.mock("@/lib/api", () => ({
  api: jest.fn(),
}));

jest.mock("@/lib/socket", () => ({
  getSocket: jest.fn(() => ({
    emit: jest.fn(),
  })),
}));

describe("Bug V2 Fix Verification: useActiveRoomSession error handling & lifecycle", () => {
  beforeEach(() => {
    useActiveRoomSession.getState().leaveVoiceSession();
    jest.clearAllMocks();
  });

  it("verifies bug V2 is fixed: isVoiceActive is false and error is captured when token fetch fails", async () => {
    // Mock API failure (e.g. LiveKit service disabled or network error)
    (api as jest.Mock).mockRejectedValueOnce(new Error("503 LiveKit voice service is not configured"));

    // Attempt to join
    await useActiveRoomSession.getState().joinVoiceSession("room_123", "Math Study");

    const state = useActiveRoomSession.getState();

    // Verification:
    // 1. isVoiceActive must NOT be true when token fetch fails
    expect(state.isVoiceActive).toBe(false);

    // 2. livekitToken is null
    expect(state.livekitToken).toBeNull();

    // 3. status is failed
    expect(state.status).toBe("failed");

    // 4. error property exists and has message
    expect(state.error).toContain("503 LiveKit voice service is not configured");
  });

  it("verifies successful connection lifecycle: requesting -> connecting -> onConnected", async () => {
    (api as jest.Mock).mockResolvedValueOnce({
      token: "mock-lk-token",
      url: "wss://livekit.example.com",
    });

    await useActiveRoomSession.getState().joinVoiceSession("room_123", "Math Study");
    let state = useActiveRoomSession.getState();

    // After token received, status is connecting, NOT yet isVoiceActive
    expect(state.status).toBe("connecting");
    expect(state.livekitToken).toBe("mock-lk-token");
    expect(state.isVoiceActive).toBe(false);

    // LiveKit connects
    useActiveRoomSession.getState().onConnected();
    state = useActiveRoomSession.getState();
    expect(state.status).toBe("connected");
    expect(state.isVoiceActive).toBe(true);

    // Leaving resets state
    useActiveRoomSession.getState().leaveVoiceSession();
    state = useActiveRoomSession.getState();
    expect(state.status).toBe("idle");
    expect(state.isVoiceActive).toBe(false);
  });
});

