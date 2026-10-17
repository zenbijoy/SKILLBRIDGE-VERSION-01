import React, { useEffect } from "react";
import { View } from "react-native";
import { AudioSession, LiveKitRoom } from "@livekit/react-native";

export interface VoiceAudioBridgeProps {
  url: string;
  token: string;
  isMuted: boolean;
}

export const VoiceAudioBridge: React.FC<VoiceAudioBridgeProps> = ({ url, token, isMuted }) => {
  useEffect(() => {
    AudioSession.startAudioSession();
    return () => {
      AudioSession.stopAudioSession();
    };
  }, []);

  if (!url || !token) return null;

  return (
    <View style={{ width: 0, height: 0, overflow: "hidden" }}>
      <LiveKitRoom
        serverUrl={url}
        token={token}
        connect={true}
        audio={!isMuted}
        video={false}
      />
    </View>
  );
};
