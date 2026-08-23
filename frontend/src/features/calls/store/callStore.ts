import { create } from "zustand";
import {
  ActiveCallState,
  CallStatus,
  CallType,
  QualityMetrics,
  CallParticipantInfo,
  RealtimeProvider,
  ProviderConfig,
} from "../types";

export interface IncomingCallInvite {
  callId: string;
  callerId: string;
  callerName: string;
  callerAvatar?: string | null;
  type: CallType;
  provider?: RealtimeProvider;
  providerConfig?: ProviderConfig;
}

interface CallStoreState {
  activeCall: ActiveCallState | null;
  incomingCall: IncomingCallInvite | null;

  // Actions
  setIncomingCall: (invite: IncomingCallInvite | null) => void;
  startCall: (params: {
    callId: string;
    role: "caller" | "callee";
    peer: CallParticipantInfo;
    type: CallType;
    provider?: RealtimeProvider;
    providerConfig?: ProviderConfig;
  }) => void;
  setCallStatus: (status: CallStatus) => void;
  setDurationSeconds: (seconds: number) => void;
  toggleMute: () => void;
  toggleVideo: () => void;
  toggleSpeaker: () => void;
  toggleCameraFacing: () => void;
  setDataSaver: (enabled: boolean) => void;
  setMetrics: (metrics: QualityMetrics) => void;
  resetCall: () => void;
}

export const useCallStore = create<CallStoreState>((set) => ({
  activeCall: null,
  incomingCall: null,

  setIncomingCall: (incomingCall) => set({ incomingCall }),

  startCall: ({ callId, role, peer, type, provider = "webrtc", providerConfig }) =>
    set({
      activeCall: {
        callId,
        role,
        peer,
        type,
        provider,
        providerConfig,
        status: "initiating",
        startedAt: Date.now(),
        durationSeconds: 0,
        isMuted: false,
        isVideoEnabled: type === "video",
        isSpeakerOn: type === "video",
        isFrontCamera: true,
        dataSaverEnabled: false,
      },
    }),

  setCallStatus: (status) =>
    set((state) => (state.activeCall ? { activeCall: { ...state.activeCall, status } } : {})),

  setDurationSeconds: (durationSeconds) =>
    set((state) => (state.activeCall ? { activeCall: { ...state.activeCall, durationSeconds } } : {})),

  toggleMute: () =>
    set((state) =>
      state.activeCall
        ? { activeCall: { ...state.activeCall, isMuted: !state.activeCall.isMuted } }
        : {},
    ),

  toggleVideo: () =>
    set((state) =>
      state.activeCall
        ? { activeCall: { ...state.activeCall, isVideoEnabled: !state.activeCall.isVideoEnabled } }
        : {},
    ),

  toggleSpeaker: () =>
    set((state) =>
      state.activeCall
        ? { activeCall: { ...state.activeCall, isSpeakerOn: !state.activeCall.isSpeakerOn } }
        : {},
    ),

  toggleCameraFacing: () =>
    set((state) =>
      state.activeCall
        ? { activeCall: { ...state.activeCall, isFrontCamera: !state.activeCall.isFrontCamera } }
        : {},
    ),

  setDataSaver: (dataSaverEnabled) =>
    set((state) => (state.activeCall ? { activeCall: { ...state.activeCall, dataSaverEnabled } } : {})),

  setMetrics: (metrics) =>
    set((state) => (state.activeCall ? { activeCall: { ...state.activeCall, metrics } } : {})),

  resetCall: () => set({ activeCall: null, incomingCall: null }),
}));
