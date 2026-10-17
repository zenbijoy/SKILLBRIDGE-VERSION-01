import React, { useEffect } from "react";
import { View } from "react-native";
import { AudioSession, LiveKitRoom } from "@livekit/react-native";
import { useLiveSessionStore, initLiveSessionSocketListeners } from "./useLiveSessionStore";
import { ActiveLiveSessionBanner } from "./ActiveLiveSessionBanner";
import { LiveSessionModal } from "./LiveSessionModal";

export const LiveSessionHost: React.FC = () => {
  const {
    status,
    livekitUrl,
    token,
    media,
    isMuted,
    isCameraOn,
    onConnected,
    onDisconnected,
    onError,
  } = useLiveSessionStore();

  // Initialize socket relays once on mount
  useEffect(() => {
    initLiveSessionSocketListeners();
  }, []);

  // Configure native audio session routing
  useEffect(() => {
    if (status === "connected" || status === "connecting") {
      AudioSession.startAudioSession().catch(() => {});
    }
    return () => {
      if (status === "idle") {
        AudioSession.stopAudioSession().catch(() => {});
      }
    };
  }, [status]);

  const hasLiveKitConnection = Boolean(token && livekitUrl);

  if (hasLiveKitConnection) {
    return (
      <View style={{ position: "relative" }}>
        <LiveKitRoom
          serverUrl={livekitUrl!}
          token={token!}
          connect={true}
          audio={!isMuted}
          video={media === "video" && isCameraOn}
          onConnected={() => onConnected()}
          onDisconnected={() => onDisconnected()}
          onError={(err) => onError(err?.message || "LiveKit connection failed")}
          options={{ adaptiveStream: true, dynacast: true }}
        >
          <ActiveLiveSessionBanner />
          <LiveSessionModal />
        </LiveKitRoom>
      </View>
    );
  }

  return (
    <View style={{ position: "relative" }}>
      <ActiveLiveSessionBanner />
      <LiveSessionModal />
    </View>
  );
};
