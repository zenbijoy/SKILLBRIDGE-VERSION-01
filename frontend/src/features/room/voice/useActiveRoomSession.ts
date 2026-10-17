import { create } from "zustand";
import { getSocket } from "@/lib/socket";
import { api } from "@/lib/api";

export type VoiceParticipant = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  isSpeaking: boolean;
  isMuted: boolean;
  role?: string;
};

export type VoiceSessionStatus =
  | "idle"
  | "requesting"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "ended"
  | "failed";

export interface ActiveRoomSessionState {
  activeRoomId: string | null;
  activeRoomTitle: string | null;
  status: VoiceSessionStatus;
  isVoiceActive: boolean;
  isMuted: boolean;
  isSpeakerOn: boolean;
  livekitToken: string | null;
  livekitUrl: string | null;
  participants: VoiceParticipant[];
  error: string | null;
  
  // Actions
  joinVoiceSession: (roomId: string, roomTitle: string) => Promise<void>;
  leaveVoiceSession: () => void;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  setParticipants: (participants: VoiceParticipant[]) => void;
  onConnected: () => void;
  onDisconnected: (reason?: string) => void;
}

export const useActiveRoomSession = create<ActiveRoomSessionState>((set, get) => ({
  activeRoomId: null,
  activeRoomTitle: null,
  status: "idle",
  isVoiceActive: false,
  isMuted: false,
  isSpeakerOn: true,
  livekitToken: null,
  livekitUrl: null,
  participants: [],
  error: null,

  joinVoiceSession: async (roomId: string, roomTitle: string) => {
    set({
      activeRoomId: roomId,
      activeRoomTitle: roomTitle,
      status: "requesting",
      isVoiceActive: false,
      error: null,
      isMuted: false,
      isSpeakerOn: true,
    });

    const socket = getSocket();
    if (socket) {
      socket.emit("room:voice:join", { roomId });
    }

    try {
      const res = await api<{ token: string; url: string }>(`/rooms/${roomId}/voice/token`, {
        method: "POST",
      });
      if (res?.token && res?.url) {
        set({
          livekitToken: res.token,
          livekitUrl: res.url,
          status: "connecting",
        });
      } else {
        throw new Error("Invalid voice token response from server");
      }
    } catch (err: any) {
      set({
        status: "failed",
        isVoiceActive: false,
        livekitToken: null,
        livekitUrl: null,
        error: err?.message || "Failed to join voice room",
      });
    }
  },

  onConnected: () => {
    set({
      status: "connected",
      isVoiceActive: true,
      error: null,
    });
  },

  onDisconnected: (_reason?: string) => {
    set({
      status: "ended",
      isVoiceActive: false,
      livekitToken: null,
      livekitUrl: null,
    });
  },

  leaveVoiceSession: () => {
    const { activeRoomId } = get();
    const socket = getSocket();
    if (socket && activeRoomId) {
      socket.emit("room:voice:leave", { roomId: activeRoomId });
    }

    set({
      activeRoomId: null,
      activeRoomTitle: null,
      status: "idle",
      isVoiceActive: false,
      livekitToken: null,
      livekitUrl: null,
      participants: [],
      error: null,
    });
  },

  toggleMute: () => {
    const state = get();
    const nextMuted = !state.isMuted;
    set({ isMuted: nextMuted });

    const socket = getSocket();
    if (socket && state.activeRoomId) {
      socket.emit("room:voice:state", {
        roomId: state.activeRoomId,
        isMuted: nextMuted,
        isSpeaking: false,
      });
    }
  },

  toggleSpeaker: () => set((state) => ({ isSpeakerOn: !state.isSpeakerOn })),
  setParticipants: (participants) => set({ participants }),
}));

