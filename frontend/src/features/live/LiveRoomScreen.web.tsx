import { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { LiveKitRoom, VideoConference, RoomAudioRenderer } from "@livekit/components-react";
import "@livekit/components-styles";
import { api } from "@/lib/api";

export default function LiveRoomScreenWeb() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const [creds, setCreds] = useState<{ url: string; token: string; canPublish: boolean } | null>(null);

  useEffect(() => {
    api<{ url: string; token: string; canPublish: boolean }>(`/live/token/${roomId}`, { method: "POST" })
      .then(setCreds)
      .catch((e) => alert(e.message));
  }, [roomId]);

  if (!creds) {
    return (
      <div style={{ display: "flex", flex: 1, justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <p>Preparing live classroom...</p>
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <LiveKitRoom
        video={creds.canPublish}
        audio={creds.canPublish}
        token={creds.token}
        serverUrl={creds.url}
        data-lk-theme="default"
        style={{ height: "100vh" }}
      >
        <VideoConference />
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  );
}
