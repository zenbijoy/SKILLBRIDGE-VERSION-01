import { useEffect, useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { Alert, StyleSheet, Text, View } from "react-native";
import {
  AudioSession,
  LiveKitRoom,
  VideoTrack,
  useRoomContext,
  useTracks,
  useParticipant,
} from "@livekit/react-native";
import { Track, RoomEvent, DataPacket_Kind, ConnectionQuality } from "livekit-client";
import { api } from "@/lib/api";
import { Button, H1, Muted, Row, Screen } from "@/components/ui";
import { colors } from "@/theme";
import AsyncStorage from "@react-native-async-storage/async-storage";

function ParticipantTile({ track, isSpotlight, raisedHands }: { track: any; isSpotlight?: boolean; raisedHands: Set<string> }) {
  const { participant } = track;
  const { connectionQuality } = useParticipant(participant);
  
  const qualityText = 
    connectionQuality === ConnectionQuality.Excellent || connectionQuality === ConnectionQuality.Good ? "Good" :
    connectionQuality === ConnectionQuality.Poor ? "Poor" :
    connectionQuality === ConnectionQuality.Lost ? "Lost" : "Weak";
    
  const qualityColor = qualityText === "Good" ? "#4caf50" : qualityText === "Poor" || qualityText === "Lost" ? "#f44336" : "#ff9800";
  
  const hasHandRaised = raisedHands.has(participant.identity);

  return (
    <View style={isSpotlight ? s.spotlightTile : s.smallTile}>
      {track.source === Track.Source.Camera || track.source === Track.Source.ScreenShare ? (
        <VideoTrack trackRef={track} style={StyleSheet.absoluteFill} />
      ) : null}
      <View style={s.tileOverlay}>
        <Text style={isSpotlight ? s.name : s.nameSmall}>
          {participant.identity}
          {track.source === Track.Source.ScreenShare ? " (Screen)" : ""}
          {hasHandRaised ? " ✋" : ""}
        </Text>
        <Text style={[s.qualityText, { color: qualityColor }]}>
          {qualityText}
        </Text>
      </View>
    </View>
  );
}

function Stage({ lowDataMode }: { lowDataMode: boolean }) {
  const room = useRoomContext();
  const allTracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare]);
  const tracks = lowDataMode 
    ? allTracks.filter((t) => t.source === Track.Source.ScreenShare)
    : allTracks;
    
  const [raisedHands, setRaisedHands] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!room) return;
    const handleDataReceived = (payload: Uint8Array, participant: any) => {
      const str = String.fromCharCode.apply(null, Array.from(payload));
      if (str === "RAISE_HAND" && participant) {
        setRaisedHands((prev) => new Set(prev).add(participant.identity));
        setTimeout(() => {
          setRaisedHands((prev) => {
            const next = new Set(prev);
            next.delete(participant.identity);
            return next;
          });
        }, 5000);
      }
    };
    room.on(RoomEvent.DataReceived, handleDataReceived);
    return () => {
      room.off(RoomEvent.DataReceived, handleDataReceived);
    };
  }, [room]);

  if (tracks.length === 0) {
    return (
      <View style={s.emptyStage}>
        <Muted>Waiting for others to join...</Muted>
      </View>
    );
  }

  // Teacher spotlight: Prioritize screen share, then first camera
  const spotlightTrack =
    tracks.find((t) => t.source === Track.Source.ScreenShare) || tracks[0];
  const otherTracks = tracks.filter((t) => t !== spotlightTrack);

  return (
    <View style={s.stage}>
      <ParticipantTile track={spotlightTrack} isSpotlight raisedHands={raisedHands} />
      {otherTracks.length > 0 && (
        <View style={s.otherTracksContainer}>
          {otherTracks.map((track, i) => (
            <ParticipantTile 
              key={`${track.participant.identity}-${track.source}-${i}`}
              track={track}
              raisedHands={raisedHands}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function Controls({ canPublish, lowDataMode, onToggleLowData }: { canPublish: boolean; lowDataMode: boolean; onToggleLowData: () => void }) {
  const room = useRoomContext();
  const [cam, setCam] = useState(true);
  const [mic, setMic] = useState(true);
  const [share, setShare] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  
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
  
  async function raiseHand() {
    try {
      const payload = new Uint8Array(Array.from("RAISE_HAND").map((c) => c.charCodeAt(0)));
      await room.localParticipant.publishData(payload, { reliable: true });
      setHandRaised(true);
      setTimeout(() => setHandRaised(false), 5000);
    } catch (e) {
      console.warn("Failed to raise hand", e);
    }
  }

  return (
    <View style={s.controls}>
      <Row style={{ flexWrap: "wrap", justifyContent: "center" }}>
        <Button
          title={mic ? "Mute" : "Unmute"}
          variant="secondary"
          onPress={() => toggle("mic")}
        />
        <Button
          title={cam ? "Cam off" : "Cam on"}
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
        <Button 
          title={handRaised ? "Hand Raised ✋" : "Raise Hand ✋"} 
          variant="secondary" 
          onPress={raiseHand} 
        />
        <Button 
          title={lowDataMode ? "Audio Only" : "Video + Audio"} 
          variant="secondary" 
          onPress={onToggleLowData} 
        />
        <Button title="Leave" variant="danger" onPress={() => router.back()} />
      </Row>
    </View>
  );
}

export default function LiveRoomScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const [creds, setCreds] = useState<{
    url: string;
    token: string;
    canPublish: boolean;
  } | null>(null);
  
  const [lowDataMode, setLowDataMode] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem("@low_data_mode").then((v) => {
      if (v === "true") setLowDataMode(true);
    });
    
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
  
  const handleToggleLowData = () => {
    const next = !lowDataMode;
    setLowDataMode(next);
    AsyncStorage.setItem("@low_data_mode", next ? "true" : "false");
  };

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
        video={creds.canPublish && !lowDataMode}
        options={{ adaptiveStream: true, dynacast: true }}
      >
        <Stage lowDataMode={lowDataMode} />
        <Controls 
          canPublish={creds.canPublish} 
          lowDataMode={lowDataMode} 
          onToggleLowData={handleToggleLowData} 
        />
      </LiveKitRoom>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  stage: {
    flex: 1,
    padding: 8,
    gap: 8,
  },
  emptyStage: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  spotlightTile: {
    flex: 2,
    backgroundColor: colors.surface,
    borderRadius: 16,
    overflow: "hidden",
  },
  otherTracksContainer: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  smallTile: {
    flex: 1,
    minWidth: "30%",
    backgroundColor: colors.surface,
    borderRadius: 12,
    overflow: "hidden",
  },
  tile: {
    width: "48%",
    minHeight: 220,
    backgroundColor: colors.surface,
    borderRadius: 16,
    overflow: "hidden",
  },
  tileOverlay: {
    position: "absolute",
    bottom: 8,
    left: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  name: {
    color: "#fff",
    fontSize: 14,
  },
  nameSmall: {
    color: "#fff",
    fontSize: 10,
  },
  qualityText: {
    fontSize: 10,
    fontWeight: "bold",
  },
  controls: {
    padding: 16,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
