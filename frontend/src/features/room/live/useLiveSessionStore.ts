import { create } from "zustand";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";

export type LiveSessionStatus =
  | "idle"
  | "requesting"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "ended"
  | "failed";

export type LiveSessionMedia = "audio" | "video";
export type LiveSessionKind = "open" | "study";

export interface LiveSessionState {
  status: LiveSessionStatus;
  roomId: string | null;
  roomTitle: string | null;
  sessionId: string | null;
  kind: LiveSessionKind | null;
  media: LiveSessionMedia;
  livekitUrl: string | null;
  token: string | null;
  roomName: string | null;
  participantName: string | null;
  isHost: boolean;
  role: string | null;
  error: string | null;

  // Local media controls
  isMuted: boolean;
  isCameraOn: boolean;
  isSpeakerOn: boolean;
  isFrontCamera: boolean;

  // UI state
  isSheetOpen: boolean;

  // Alerts & prompts
  nextStudySessionPrompt: {
    nextStudySessionId: string;
    message: string;
  } | null;
  studyWarningText: string | null;

  // Actions
  joinSession: (params: {
    roomId: string;
    roomTitle: string;
    media?: LiveSessionMedia;
    preferredSessionId?: string;
  }) => Promise<void>;
  onConnected: () => void;
  onReconnecting: () => void;
  onDisconnected: (reason?: string) => void;
  onError: (errMsg: string) => void;
  leaveSession: () => Promise<void>;
  endSession: () => Promise<void>;
  toggleMute: () => void;
  toggleCamera: () => void;
  toggleSpeaker: () => void;
  toggleCameraFacing: () => void;
  setSheetOpen: (open: boolean) => void;
  clearStudyPrompt: () => void;
  reset: () => void;
}

export const useLiveSessionStore = create<LiveSessionState>((set, get) => ({
  status: "idle",
  roomId: null,
  roomTitle: null,
  sessionId: null,
  kind: null,
  media: "audio",
  livekitUrl: null,
  token: null,
  roomName: null,
  participantName: null,
  isHost: false,
  role: null,
  error: null,

  isMuted: false,
  isCameraOn: false,
  isSpeakerOn: true,
  isFrontCamera: true,

  isSheetOpen: false,
  nextStudySessionPrompt: null,
  studyWarningText: null,

  joinSession: async ({ roomId, roomTitle, media = "audio", preferredSessionId }) => {
    // Transition to requesting
    set({
      status: "requesting",
      roomId,
      roomTitle,
      media,
      error: null,
      isSheetOpen: true,
      nextStudySessionPrompt: null,
      studyWarningText: null,
    });

    try {
      let res: {
        token: string;
        url: string;
        sessionId: string;
        roomName?: string;
        participantName?: string;
        isHost?: boolean;
        role?: string;
        kind?: LiveSessionKind;
        media?: LiveSessionMedia;
      };

      if (preferredSessionId) {
        // Request token for explicit open or study session
        res = await api(`/rooms/${roomId}/live/${preferredSessionId}/token`, {
          method: "POST",
        });
      } else {
        // Start or join open session
        const openRes = await api<{
          session: { id: string; media: LiveSessionMedia; hostId: string };
          token: string;
          url: string;
          isHost?: boolean;
          role?: string;
        }>(`/rooms/${roomId}/live/open`, {
          method: "POST",
          body: JSON.stringify({ media }),
        });

        res = {
          token: openRes.token,
          url: openRes.url,
          sessionId: openRes.session.id,
          isHost: openRes.isHost,
          role: openRes.role,
          kind: "open",
          media: openRes.session.media || media,
          roomName: `skillbridge-open-${openRes.session.id}`,
        };
      }

      if (!res.token || !res.url) {
        throw new Error("LiveKit server is not configured or token could not be minted.");
      }

      // Transition to connecting
      set({
        status: "connecting",
        sessionId: res.sessionId,
        token: res.token,
        livekitUrl: res.url,
        roomName: res.roomName || `skillbridge-open-${res.sessionId}`,
        participantName: res.participantName || null,
        isHost: Boolean(res.isHost),
        role: res.role || "member",
        kind: res.kind || "open",
        media: res.media || media,
        isMuted: false,
        isCameraOn: (res.media || media) === "video",
      });

      // Attach socket room presence & real-time events
      const socket = getSocket();
      if (socket) {
        socket.emit("room:presence:subscribe", { roomId });
      }
    } catch (err: any) {
      const errMsg = err?.message || err?.error || "Unable to start or join session. Please check your connection.";
      set({
        status: "failed",
        error: errMsg,
      });
    }
  },

  onConnected: () => {
    set({
      status: "connected",
      error: null,
    });
  },

  onReconnecting: () => {
    set({
      status: "reconnecting",
    });
  },

  onDisconnected: (reason) => {
    const current = get();
    if (current.status !== "idle") {
      set({
        status: "idle",
        token: null,
        livekitUrl: null,
        error: reason ? `Disconnected: ${reason}` : null,
      });
    }
  },

  onError: (errMsg) => {
    set({
      status: "failed",
      error: errMsg,
    });
  },

  leaveSession: async () => {
    const { roomId, sessionId } = get();

    // Call backend explicit leave endpoint
    if (roomId && sessionId) {
      try {
        await api(`/rooms/${roomId}/live/${sessionId}/leave`, {
          method: "POST",
        });
      } catch {
        // Non-fatal
      }
    }

    const socket = getSocket();
    if (socket && roomId) {
      socket.emit("room:voice:leave", { roomId });
    }

    set({
      status: "idle",
      roomId: null,
      roomTitle: null,
      sessionId: null,
      kind: null,
      livekitUrl: null,
      token: null,
      roomName: null,
      participantName: null,
      isHost: false,
      role: null,
      error: null,
      isSheetOpen: false,
      nextStudySessionPrompt: null,
      studyWarningText: null,
    });
  },

  endSession: async () => {
    const { roomId, sessionId } = get();

    if (roomId && sessionId) {
      try {
        await api(`/rooms/${roomId}/live/${sessionId}/end`, {
          method: "POST",
        });
      } catch {
        // Non-fatal
      }
    }

    set({
      status: "idle",
      roomId: null,
      roomTitle: null,
      sessionId: null,
      kind: null,
      livekitUrl: null,
      token: null,
      roomName: null,
      isHost: false,
      isSheetOpen: false,
      nextStudySessionPrompt: null,
      studyWarningText: null,
    });
  },

  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),

  toggleCamera: () => set((state) => ({ isCameraOn: !state.isCameraOn })),

  toggleSpeaker: () => set((state) => ({ isSpeakerOn: !state.isSpeakerOn })),

  toggleCameraFacing: () => set((state) => ({ isFrontCamera: !state.isFrontCamera })),

  setSheetOpen: (open: boolean) => set({ isSheetOpen: open }),

  clearStudyPrompt: () => set({ nextStudySessionPrompt: null }),

  reset: () =>
    set({
      status: "idle",
      roomId: null,
      roomTitle: null,
      sessionId: null,
      kind: null,
      media: "audio",
      livekitUrl: null,
      token: null,
      roomName: null,
      participantName: null,
      isHost: false,
      role: null,
      error: null,
      isSheetOpen: false,
      nextStudySessionPrompt: null,
      studyWarningText: null,
    }),
}));

// Setup global socket event hooks
let socketHooked = false;
export function initLiveSessionSocketListeners(): void {
  if (socketHooked) return;
  const socket = getSocket();
  if (!socket) return;
  socketHooked = true;

  socket.on("room:live:ended", (payload: any) => {
    const state = useLiveSessionStore.getState();
    if (!state.sessionId || state.status === "idle") return;

    if (payload?.roomId === state.roomId || payload?.sessionId === state.sessionId) {
      if (payload?.reason === "study_session_started" && payload?.nextStudySessionId) {
        useLiveSessionStore.setState({
          status: "idle",
          token: null,
          livekitUrl: null,
          nextStudySessionPrompt: {
            nextStudySessionId: payload.nextStudySessionId,
            message: "This session ended because a study session started. Tap to join the study session.",
          },
        });
      } else {
        useLiveSessionStore.setState({
          status: "idle",
          token: null,
          livekitUrl: null,
          error: payload?.reason === "empty_timeout"
            ? "Session ended after 60 seconds because no participants remained."
            : "Session ended by host.",
        });
      }
    }
  });

  socket.on("room:live:host_changed", (payload: any) => {
    const state = useLiveSessionStore.getState();
    if (state.sessionId && state.roomId === payload?.roomId) {
      const socketUserId = (socket as any).data?.userId || (socket as any).userId;
      if (payload?.newHostId && socketUserId && payload.newHostId === socketUserId) {
        useLiveSessionStore.setState({ isHost: true });
      }
    }
  });

  socket.on("room:live:study_warning", (payload: any) => {
    const state = useLiveSessionStore.getState();
    if (state.sessionId && state.roomId === payload?.roomId) {
      const mins = payload?.minutesRemaining || 5;
      useLiveSessionStore.setState({
        studyWarningText: `Study session "${payload?.title || "Upcoming"}" starts in ${mins} minute${mins === 1 ? "" : "s"}.`,
      });
    }
  });
}
