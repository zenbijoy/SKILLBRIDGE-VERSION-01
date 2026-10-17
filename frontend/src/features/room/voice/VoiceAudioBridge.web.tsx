import React from "react";
import { LiveKitRoom, RoomAudioRenderer } from "@livekit/components-react";

export interface VoiceAudioBridgeProps {
  url: string;
  token: string;
  isMuted: boolean;
}

export const VoiceAudioBridge: React.FC<VoiceAudioBridgeProps> = ({ url, token, isMuted }) => {
  if (!url || !token) return null;

  return (
    <LiveKitRoom
      serverUrl={url}
      token={token}
      connect={true}
      audio={!isMuted}
      video={false}
      style={{ display: "none" }}
    >
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
};
