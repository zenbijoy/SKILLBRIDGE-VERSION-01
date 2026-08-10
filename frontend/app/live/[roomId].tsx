import { useEffect, useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { Alert, StyleSheet, Text, View } from "react-native";
import {
  AudioSession,
  LiveKitRoom,
  VideoTrack,
  useRoomContext,
  useTracks,
} from "@livekit/react-native";
import { Track } from "livekit-client";
import { api } from "@/lib/api";
import { Button, H1, Muted, Row, Screen } from "@/components/ui";
import { colors } from "@/theme";
function Stage() {
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare]);
  return (
    <View style={s.stage}>
      {tracks.map((track, i) => (
        <View
          style={s.tile}
          key={`${track.participant.identity}-${track.source}-${i}`}
        >
          <VideoTrack trackRef={track} style={StyleSheet.absoluteFill} />
          <Text style={s.name}>
            {track.participant.identity}
            {track.source === Track.Source.ScreenShare ? " · screen" : ""}
          </Text>
        </View>
      ))}
    </View>
  );
}
function Controls({ canPublish }: { canPublish: boolean }) {
  const room = useRoomContext();
  const [cam, setCam] = useState(true);
  const [mic, setMic] = useState(true);
  const [share, setShare] = useState(false);
  async function toggle(kind: "cam" | "mic" | "share") {
    if (!canPublish)
      return Alert.alert(
        "Viewer mode",
        "Only the accepted teacher/room owner can broadcast.",
      );
    try {
      if (kind === "cam") {
        await room.localParticipant.setCameraEnabled(!cam);
        setCam(!cam);
      } else if (kind === "mic") {
        await room.localParticipant.setMicrophoneEnabled(!mic);
        setMic(!mic);
      } else {
        await room.localParticipant.setScreenShareEnabled(!share);
        setShare(!share);
      }
    } catch (e) {
      Alert.alert(
        "Media control",
        e instanceof Error
          ? e.message
          : "This platform needs additional screen-share setup.",
      );
    }
  }
  return (
    <View style={s.controls}>
      <Row>
        <Button
          title={mic ? "Mute" : "Unmute"}
          variant="secondary"
          onPress={() => toggle("mic")}
        />
        <Button
          title={cam ? "Camera off" : "Camera on"}
          variant="secondary"
          onPress={() => toggle("cam")}
        />
        {canPublish ? (
          <Button
            title={share ? "Stop share" : "Share screen"}
            variant="secondary"
            onPress={() => toggle("share")}
          />
        ) : null}
        <Button title="Leave" variant="danger" onPress={() => router.back()} />
      </Row>
    </View>
  );
}
export default function LiveClass() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const [creds, setCreds] = useState<{
    url: string;
    token: string;
    canPublish: boolean;
  } | null>(null);
  useEffect(() => {
    AudioSession.startAudioSession();
    api<{ url: string; token: string; canPublish: boolean }>(
      `/live/token/${roomId}`,
      { method: "POST" },
    )
      .then(setCreds)
      .catch((e) => Alert.alert("Live classroom", e.message));
    return () => {
      AudioSession.stopAudioSession();
    };
  }, [roomId]);
  if (!creds)
    return (
      <Screen>
        <H1>Preparing live classroom</H1>
        <Muted>
          Secure short-lived LiveKit access is issued by the backend after room
          membership and broadcast-role checks.
        </Muted>
      </Screen>
    );
  return (
    <View style={s.root}>
      <LiveKitRoom
        serverUrl={creds.url}
        token={creds.token}
        connect
        audio={creds.canPublish}
        video={creds.canPublish}
        options={{ adaptiveStream: true, dynacast: true }}
      >
        <Stage />
        <Controls canPublish={creds.canPublish} />
      </LiveKitRoom>
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  stage: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 8,
    gap: 8,
  },
  tile: {
    width: "48%",
    minHeight: 220,
    backgroundColor: colors.surface,
    borderRadius: 16,
    overflow: "hidden",
  },
  name: {
    position: "absolute",
    left: 8,
    bottom: 8,
    color: colors.white,
    fontWeight: "800",
  },
  controls: { padding: 16, backgroundColor: colors.surface },
});
