export type CallStatus =
  | "idle"
  | "initiating"
  | "ringing"
  | "accepted"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "declined"
  | "busy"
  | "missed"
  | "failed"
  | "ended";

export type CallType = "audio" | "video";

export type RealtimeProvider = "webrtc" | "livekit" | "youtube";

export type NetworkQuality = "excellent" | "good" | "fair" | "poor" | "critical";

export type CandidateType = "host" | "srflx" | "prflx" | "relay" | "unknown";

export interface QualityMetrics {
  quality: NetworkQuality;
  rttMs: number;
  packetLossPercent: number;
  jitterMs: number;
  bitrateKbps: number;
  localCandidateType: CandidateType;
  remoteCandidateType: CandidateType;
  relayUsed: boolean;
  isUsingTurn: boolean; // Convenience alias for relayUsed
}

export interface CallParticipantInfo {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

export interface ProviderConfig {
  url?: string;
  roomName?: string;
  token?: string;
}

export interface ActiveCallState {
  callId: string;
  role: "caller" | "callee";
  peer: CallParticipantInfo;
  type: CallType;
  provider: RealtimeProvider;
  providerConfig?: ProviderConfig;
  status: CallStatus;
  startedAt?: number;
  connectedAt?: number;
  durationSeconds: number;
  isMuted: boolean;
  isVideoEnabled: boolean;
  isSpeakerOn: boolean;
  isFrontCamera: boolean;
  dataSaverEnabled: boolean;
  metrics?: QualityMetrics;
}
