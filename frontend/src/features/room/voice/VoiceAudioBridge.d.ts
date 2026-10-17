import React from "react";

export interface VoiceAudioBridgeProps {
  url: string;
  token: string;
  isMuted: boolean;
}

export declare const VoiceAudioBridge: React.FC<VoiceAudioBridgeProps>;
