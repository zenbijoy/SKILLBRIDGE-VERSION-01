import React, { useEffect, useMemo } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  useTracks,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
} from "@livekit/components-react";
import { Track, RoomEvent } from "livekit-client";
import { LiveKitCallBridgeProps } from "./LiveKitCallBridge";

export const LiveKitCallBridge: React.FC<LiveKitCallBridgeProps> = ({
  url,
  token,
  type,
  isMuted,
  isVideoEnabled,
  peerName,
  peerAvatar,
  onConnected,
  onDisconnected,
}) => {
  if (!url || !token) return null;

  return (
    <LiveKitRoom
      serverUrl={url}
      token={token}
      connect={true}
      audio={!isMuted}
      video={type === "video" && isVideoEnabled}
      options={{ adaptiveStream: true, dynacast: true }}
      style={{ width: "100%", height: "100%", position: "absolute", top: 0, left: 0 }}
      onDisconnected={onDisconnected}
    >
      <CallInterior
        type={type}
        isMuted={isMuted}
        isVideoEnabled={isVideoEnabled}
        peerName={peerName}
        peerAvatar={peerAvatar}
        onConnected={onConnected}
      />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
};

function CallInterior({
  type,
  isMuted,
  isVideoEnabled,
  peerName,
  peerAvatar,
  onConnected,
}: {
  type: "audio" | "video";
  isMuted: boolean;
  isVideoEnabled: boolean;
  peerName: string;
  peerAvatar?: string | null;
  onConnected?: () => void;
}) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const participants = useParticipants();

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: false },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  // Sync mic mute state
  useEffect(() => {
    if (localParticipant) {
      localParticipant.setMicrophoneEnabled(!isMuted).catch(() => {});
    }
  }, [isMuted, localParticipant]);

  // Sync camera state
  useEffect(() => {
    if (localParticipant && type === "video") {
      localParticipant.setCameraEnabled(isVideoEnabled).catch(() => {});
    }
  }, [isVideoEnabled, type, localParticipant]);

  // Notify connected when remote peer joins or room connects
  useEffect(() => {
    const handleConnected = () => {
      onConnected?.();
    };

    if (room.state === "connected") {
      onConnected?.();
    }

    room.on(RoomEvent.Connected, handleConnected);
    room.on(RoomEvent.ParticipantConnected, handleConnected);

    return () => {
      room.off(RoomEvent.Connected, handleConnected);
      room.off(RoomEvent.ParticipantConnected, handleConnected);
    };
  }, [room, onConnected]);

  // Find remote camera track
  const remoteVideoTrack = useMemo(() => {
    return tracks.find(
      (t) =>
        t.participant?.identity !== localParticipant?.identity &&
        t.source === Track.Source.Camera &&
        !t.publication?.isMuted,
    );
  }, [tracks, localParticipant]);

  // Find local camera track for picture-in-picture
  const localVideoTrack = useMemo(() => {
    return tracks.find(
      (t) =>
        t.participant?.identity === localParticipant?.identity &&
        t.source === Track.Source.Camera &&
        !t.publication?.isMuted,
    );
  }, [tracks, localParticipant]);

  const hasRemoteVideo = type === "video" && Boolean(remoteVideoTrack);

  return (
    <div style={bridgeStyles.container}>
      {hasRemoteVideo ? (
        // Fullscreen Remote Video
        <div style={bridgeStyles.fullscreenVideo}>
          <VideoTrack trackRef={remoteVideoTrack as any} style={bridgeStyles.videoElement} />
        </div>
      ) : (
        // Audio / Cam-off Centered Avatar
        <div style={bridgeStyles.audioCenter}>
          <div style={bridgeStyles.avatarGlow}>
            {peerAvatar ? (
              <img src={peerAvatar} alt={peerName} style={bridgeStyles.avatarImg} />
            ) : (
              <div style={bridgeStyles.avatarPlaceholder}>
                {(peerName[0] || "?").toUpperCase()}
              </div>
            )}
          </div>
          <span style={bridgeStyles.nameText}>{peerName}</span>
          <span style={bridgeStyles.statusText}>
            {participants.length > 1 ? "Connected" : "Calling…"}
          </span>
        </div>
      )}

      {/* Picture-in-Picture Local Video Preview (when video call) */}
      {type === "video" && isVideoEnabled && localVideoTrack && (
        <div style={bridgeStyles.pipContainer}>
          <VideoTrack trackRef={localVideoTrack as any} style={bridgeStyles.pipVideo} />
          <span style={bridgeStyles.pipLabel}>You</span>
        </div>
      )}
    </div>
  );
}

const bridgeStyles: Record<string, React.CSSProperties> = {
  container: {
    width: "100%",
    height: "100%",
    position: "relative",
    backgroundColor: "#080C16",
    overflow: "hidden",
  },
  fullscreenVideo: {
    width: "100%",
    height: "100%",
    position: "absolute",
    top: 0,
    left: 0,
  },
  videoElement: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  audioCenter: {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarGlow: {
    width: "120px",
    height: "120px",
    borderRadius: "60px",
    backgroundColor: "rgba(56, 189, 248, 0.15)",
    boxShadow: "0 0 32px rgba(56, 189, 248, 0.3)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "16px",
    border: "2px solid rgba(56, 189, 248, 0.4)",
  },
  avatarImg: {
    width: "116px",
    height: "116px",
    borderRadius: "58px",
    objectFit: "cover",
  },
  avatarPlaceholder: {
    fontSize: "44px",
    fontWeight: 700,
    color: "#38BDF8",
  },
  nameText: {
    fontSize: "20px",
    fontWeight: 700,
    color: "#FFFFFF",
    marginBottom: "4px",
  },
  statusText: {
    fontSize: "13px",
    color: "#94A3B8",
  },
  pipContainer: {
    position: "absolute",
    top: "70px",
    right: "16px",
    width: "110px",
    height: "150px",
    borderRadius: "12px",
    overflow: "hidden",
    boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
    border: "1px solid rgba(255,255,255,0.2)",
    backgroundColor: "#111827",
    zIndex: 20,
  },
  pipVideo: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    transform: "scaleX(-1)", // Mirror selfie camera
  },
  pipLabel: {
    position: "absolute",
    bottom: "4px",
    left: "6px",
    fontSize: "10px",
    fontWeight: 600,
    color: "#FFFFFF",
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: "1px 4px",
    borderRadius: "4px",
  },
};
