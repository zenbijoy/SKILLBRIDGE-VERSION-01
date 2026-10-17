import { useLiveSessionStore } from "./useLiveSessionStore";
import { api } from "@/lib/api";

jest.mock("@/lib/api", () => ({
  api: jest.fn(),
}));

jest.mock("@/lib/socket", () => ({
  getSocket: jest.fn(() => ({
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  })),
}));

describe("useLiveSessionStore State Machine & Engine", () => {
  beforeEach(() => {
    useLiveSessionStore.getState().reset();
    jest.clearAllMocks();
  });

  it("initializes with idle status and clean defaults", () => {
    const state = useLiveSessionStore.getState();
    expect(state.status).toBe("idle");
    expect(state.roomId).toBeNull();
    expect(state.token).toBeNull();
    expect(state.livekitUrl).toBeNull();
    expect(state.isMuted).toBe(false);
    expect(state.isCameraOn).toBe(false);
    expect(state.isSpeakerOn).toBe(true);
    expect(state.isSheetOpen).toBe(false);
  });

  it("handles joinSession requesting -> connecting -> connected lifecycle for open session", async () => {
    (api as jest.Mock).mockResolvedValueOnce({
      session: { id: "open-sess-1", media: "audio", hostId: "user-123" },
      token: "mock-jwt-token",
      url: "wss://livekit.example.com",
      isHost: true,
      role: "owner",
    });

    const joinPromise = useLiveSessionStore.getState().joinSession({
      roomId: "room-abc",
      roomTitle: "Math Room",
      media: "audio",
    });

    // While awaiting token, status is requesting
    expect(useLiveSessionStore.getState().status).toBe("requesting");
    expect(useLiveSessionStore.getState().isSheetOpen).toBe(true);

    await joinPromise;

    // After API returns credentials, status is connecting (waiting for LiveKit onConnected)
    let state = useLiveSessionStore.getState();
    expect(state.status).toBe("connecting");
    expect(state.sessionId).toBe("open-sess-1");
    expect(state.token).toBe("mock-jwt-token");
    expect(state.livekitUrl).toBe("wss://livekit.example.com");
    expect(state.isHost).toBe(true);

    // LiveKit SDK calls onConnected
    useLiveSessionStore.getState().onConnected();
    state = useLiveSessionStore.getState();
    expect(state.status).toBe("connected");
    expect(state.error).toBeNull();
  });

  it("captures failure and transitions to failed without showing connected", async () => {
    (api as jest.Mock).mockRejectedValueOnce(new Error("Study session in progress: study session live"));

    await useLiveSessionStore.getState().joinSession({
      roomId: "room-abc",
      roomTitle: "Math Room",
      media: "video",
    });

    const state = useLiveSessionStore.getState();
    expect(state.status).toBe("failed");
    expect(state.error).toContain("Study session in progress");
    expect(state.token).toBeNull();
  });

  it("handles local media toggles correctly", () => {
    const store = useLiveSessionStore.getState();
    expect(store.isMuted).toBe(false);

    store.toggleMute();
    expect(useLiveSessionStore.getState().isMuted).toBe(true);

    store.toggleCamera();
    expect(useLiveSessionStore.getState().isCameraOn).toBe(true);

    store.toggleSpeaker();
    expect(useLiveSessionStore.getState().isSpeakerOn).toBe(false);

    store.toggleCameraFacing();
    expect(useLiveSessionStore.getState().isFrontCamera).toBe(false);
  });

  it("handles leaveSession by calling API, disconnecting, and returning to idle", async () => {
    (api as jest.Mock).mockResolvedValueOnce({ success: true });

    useLiveSessionStore.setState({
      status: "connected",
      roomId: "room-123",
      sessionId: "sess-456",
      token: "valid-token",
      livekitUrl: "wss://livekit.example.com",
      isSheetOpen: true,
    });

    await useLiveSessionStore.getState().leaveSession();

    const state = useLiveSessionStore.getState();
    expect(state.status).toBe("idle");
    expect(state.roomId).toBeNull();
    expect(state.sessionId).toBeNull();
    expect(state.token).toBeNull();
    expect(state.isSheetOpen).toBe(false);
  });

  it("minimizing sheet does NOT end or disconnect session", () => {
    useLiveSessionStore.setState({
      status: "connected",
      roomId: "room-123",
      sessionId: "sess-456",
      token: "valid-token",
      isSheetOpen: true,
    });

    useLiveSessionStore.getState().setSheetOpen(false);

    const state = useLiveSessionStore.getState();
    expect(state.isSheetOpen).toBe(false);
    expect(state.status).toBe("connected");
    expect(state.token).toBe("valid-token");
  });
});
