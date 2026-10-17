import React, { useEffect, useMemo } from "react";
import { StyleSheet, Text, View, Image } from "react-native";
import {
  AudioSession,
  LiveKitRoom,
  VideoTrack,
  useTracks,
  useParticipants,
  useRoomContext,
} from "@livekit/react-native";
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
  useEffect(() => {
    AudioSession.startAudioSession();
    return () => {
      AudioSession.stopAudioSession();
    };
  }, []);

  if (!url || !token) return null;

  return (
    <View style={StyleSheet.absoluteFill}>
      <LiveKitRoom
        serverUrl={url}
        token={token}
        connect={true}
        audio={!isMuted}
        video={type === "video" && isVideoEnabled}
        options={{ adaptiveStream: true, dynacast: true }}
      >
        <NativeCallInterior
          type={type}
          isMuted={isMuted}
          isVideoEnabled={isVideoEnabled}
          peerName={peerName}
          peerAvatar={peerAvatar}
          onConnected={onConnected}
        />
      </LiveKitRoom>
    </View>
  );
};

function NativeCallInterior({
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
  const participants = useParticipants();

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  // Sync mic mute state
  useEffect(() => {
    if (room?.localParticipant) {
      room.localParticipant.setMicrophoneEnabled(!isMuted).catch(() => {});
    }
  }, [isMuted, room]);

  // Sync camera state
  useEffect(() => {
    if (room?.localParticipant && type === "video") {
      room.localParticipant.setCameraEnabled(isVideoEnabled).catch(() => {});
    }
  }, [isVideoEnabled, type, room]);

  // Notify connected
  useEffect(() => {
    const handleConnected = () => {
      onConnected?.();
    };

    if (room?.state === "connected") {
      onConnected?.();
    }

    room?.on(RoomEvent.Connected, handleConnected);
    room?.on(RoomEvent.ParticipantConnected, handleConnected);

    return () => {
      room?.off(RoomEvent.Connected, handleConnected);
      room?.off(RoomEvent.ParticipantConnected, handleConnected);
    };
  }, [room, onConnected]);

  // Find remote video track
  const remoteVideoTrack = useMemo(() => {
    return tracks.find(
      (t) =>
        t.participant?.identity !== room?.localParticipant?.identity &&
        t.source === Track.Source.Camera &&
        !t.publication?.isMuted,
    );
  }, [tracks, room]);

  // Find local video track for PIP
  const localVideoTrack = useMemo(() => {
    return tracks.find(
      (t) =>
        t.participant?.identity === room?.localParticipant?.identity &&
        t.source === Track.Source.Camera &&
        !t.publication?.isMuted,
    );
  }, [tracks, room]);

  const hasRemoteVideo = type === "video" && Boolean(remoteVideoTrack);

  return (
    <View style={s.container}>
      {hasRemoteVideo ? (
        <View style={StyleSheet.absoluteFill}>
          <VideoTrack trackRef={remoteVideoTrack as any} style={StyleSheet.absoluteFill} />
        </View>
      ) : (
        <View style={s.audioCenter}>
          <View style={s.avatarGlow}>
            {peerAvatar ? (
              <Image source={{ uri: peerAvatar }} style={s.avatarImg} />
            ) : (
              <Text style={s.avatarInitial}>{(peerName[0] || "?").toUpperCase()}</Text>
            )}
          </View>
          <Text style={s.peerNameText}>{peerName}</Text>
          <Text style={s.statusText}>{participants.length > 1 ? "Connected" : "Calling…"}</Text>
        </View>
      )}

      {/* PIP Local Preview */}
      {type === "video" && isVideoEnabled && localVideoTrack && (
        <View style={s.pipBox}>
          <VideoTrack trackRef={localVideoTrack as any} style={StyleSheet.absoluteFill} />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#080C16",
  },
  audioCenter: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarGlow: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(56, 189, 248, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(56, 189, 248, 0.4)",
    marginBottom: 16,
  },
  avatarImg: {
    width: 116,
    height: 116,
    borderRadius: 58,
  },
  avatarInitial: {
    fontSize: 44,
    fontWeight: "700",
    color: "#38BDF8",
  },
  peerNameText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  statusText: {
    fontSize: 13,
    color: "#94A3B8",
  },
  pipBox: {
    position: "absolute",
    top: 70,
    right: 16,
    width: 100,
    height: 140,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "#111827",
    zIndex: 20,
  },
});
