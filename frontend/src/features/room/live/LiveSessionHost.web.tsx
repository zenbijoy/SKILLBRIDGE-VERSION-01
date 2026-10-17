import React, { useEffect } from "react";
import { View } from "react-native";
import { LiveKitRoom, RoomAudioRenderer } from "@livekit/components-react";
import { useLiveSessionStore, initLiveSessionSocketListeners } from "./useLiveSessionStore";
import { ActiveLiveSessionBanner } from "./ActiveLiveSessionBanner";
import { LiveSessionModal } from "./LiveSessionModal";

export const LiveSessionHost: React.FC = () => {
  const {
    livekitUrl,
    token,
    media,
    isMuted,
    isCameraOn,
    onConnected,
    onDisconnected,
    onError,
  } = useLiveSessionStore();

  useEffect(() => {
    initLiveSessionSocketListeners();
  }, []);

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
          <RoomAudioRenderer />
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
