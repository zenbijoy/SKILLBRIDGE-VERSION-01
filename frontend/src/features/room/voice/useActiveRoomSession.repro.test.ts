/**
 * Phase 0 Reproduction Test for Bug V2:
 * Demonstrates that useActiveRoomSession sets isVoiceActive = true prematurely,
 * swallows token fetch errors, leaves the store in an inconsistent "active with no token" state,
 * and lacks an error or disconnected state machine.
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

describe("Bug V2 Reproduction: useActiveRoomSession premature activation & error swallowing", () => {
  beforeEach(() => {
    useActiveRoomSession.getState().leaveVoiceSession();
    jest.clearAllMocks();
  });

  it("reproduces bug V2: isVoiceActive is true even when token fetch fails (503 LiveKit unavailable)", async () => {
    // Mock API failure (e.g. LiveKit service disabled or network error)
    (api as jest.Mock).mockRejectedValueOnce(new Error("503 LiveKit voice service is not configured"));

    // Attempt to join
    await useActiveRoomSession.getState().joinVoiceSession("room_123", "Math Study");

    const state = useActiveRoomSession.getState();

    // Bug verification:
    // 1. isVoiceActive was set to true
    expect(state.isVoiceActive).toBe(true);

    // 2. livekitToken is null because fetch failed and was swallowed
    expect(state.livekitToken).toBeNull();

    // 3. activeRoomId is set even though audio connection could not be established
    expect(state.activeRoomId).toBe("room_123");

    // 4. No error property exists on the legacy store
    expect((state as any).error).toBeUndefined();
  });
});
