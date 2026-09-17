import { create } from "zustand";

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
  participants: VoiceParticipant[];
  
  // Actions
  joinVoiceSession: (roomId: string, roomTitle: string) => void;
  leaveVoiceSession: () => void;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  setParticipants: (participants: VoiceParticipant[]) => void;
}

export const useActiveRoomSession = create<ActiveRoomSessionState>((set) => ({
  activeRoomId: null,
  activeRoomTitle: null,
  isVoiceActive: false,
  isMuted: false,
  isSpeakerOn: true,
  participants: [],

  joinVoiceSession: (roomId: string, roomTitle: string) =>
    set({
      activeRoomId: roomId,
      activeRoomTitle: roomTitle,
      isVoiceActive: true,
      isMuted: false,
      isSpeakerOn: true,
    }),

  leaveVoiceSession: () =>
    set({
      activeRoomId: null,
      activeRoomTitle: null,
      isVoiceActive: false,
      participants: [],
    }),

  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
  toggleSpeaker: () => set((state) => ({ isSpeakerOn: !state.isSpeakerOn })),
  setParticipants: (participants) => set({ participants }),
}));
