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

interface ActiveRoomSessionState {
  activeRoomId: string | null;
  activeRoomTitle: string | null;
  isVoiceActive: boolean;
  isMuted: boolean;
  isSpeakerOn: boolean;
  livekitToken: string | null;
  livekitUrl: string | null;
  participants: VoiceParticipant[];
  
  // Actions
  joinVoiceSession: (roomId: string, roomTitle: string) => Promise<void>;
  leaveVoiceSession: () => void;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  setParticipants: (participants: VoiceParticipant[]) => void;
}

export const useActiveRoomSession = create<ActiveRoomSessionState>((set, get) => ({
  activeRoomId: null,
  activeRoomTitle: null,
  isVoiceActive: false,
  isMuted: false,
  isSpeakerOn: true,
  livekitToken: null,
  livekitUrl: null,
  participants: [],

  joinVoiceSession: async (roomId: string, roomTitle: string) => {
    const socket = getSocket();
    if (socket) {
      socket.emit("room:voice:join", { roomId });
    }

    set({
      activeRoomId: roomId,
      activeRoomTitle: roomTitle,
      isVoiceActive: true,
      isMuted: false,
      isSpeakerOn: true,
    });

    try {
      const res = await api<{ token: string; url: string }>(`/rooms/${roomId}/voice/token`, {
        method: "POST",
      });
      if (res?.token) {
        set({ livekitToken: res.token, livekitUrl: res.url });
      }
    } catch {
      // Best effort LiveKit token fetch; fallback to socket-coordinated presence
    }
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
      isVoiceActive: false,
      livekitToken: null,
      livekitUrl: null,
      participants: [],
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
