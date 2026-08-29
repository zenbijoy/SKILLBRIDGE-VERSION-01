import { useEffect, useState, useCallback } from "react";
import { useLocalSearchParams, router } from "expo-router";
import {
  Alert,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import {
  AudioSession,
  LiveKitRoom,
  VideoTrack,
  useRoomContext,
  useTracks,
  useParticipant,
  useParticipants,
} from "@livekit/react-native";
import { Track, RoomEvent, ConnectionQuality } from "livekit-client";
import { api } from "@/lib/api";
import { Button, H1, H2, Muted, Row, Screen } from "@/components/ui";
import { darkColors as colors } from "@/theme";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface LiveCreds {
  url: string;
  token: string;
  canPublish: boolean;
  sessionId?: string;
  roomName?: string;
  participantName?: string;
}

function getParticipantDisplayName(participant: any): string {
  if (participant.name && participant.name.trim() !== "") {
    return participant.name;
  }
  try {
    const meta = JSON.parse(participant.metadata || "{}");
    if (meta.fullName) return meta.fullName;
    if (meta.username) return `@${meta.username}`;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_e) {}
  return participant.identity || "Participant";
}

function ParticipantTile({
  track,
  isSpotlight,
  raisedHands,
}: {
  track: any;
  isSpotlight?: boolean;
  raisedHands: Set<string>;
}) {
  const { participant } = track;
  const { connectionQuality } = useParticipant(participant);
  const displayName = getParticipantDisplayName(participant);
  const isMicEnabled = participant?.isMicrophoneEnabled ?? !participant?.isMuted;

  const qualityText =
    connectionQuality === ConnectionQuality.Excellent ||
    connectionQuality === ConnectionQuality.Good
      ? "Good"
      : connectionQuality === ConnectionQuality.Poor
      ? "Poor"
      : connectionQuality === ConnectionQuality.Lost
      ? "Lost"
      : "Weak";

  const qualityColor =
    qualityText === "Good"
      ? "#4caf50"
      : qualityText === "Poor" || qualityText === "Lost"
      ? "#f44336"
      : "#ff9800";

  const hasHandRaised = raisedHands.has(participant.identity);
  const isVideoPublished =
    (track.source === Track.Source.Camera || track.source === Track.Source.ScreenShare) &&
    !track.isMuted;

  return (
    <View style={isSpotlight ? s.spotlightTile : s.smallTile}>
      {isVideoPublished ? (
        <VideoTrack trackRef={track} style={StyleSheet.absoluteFill} />
      ) : (
        <View style={s.avatarPlaceholder}>
          <View style={s.avatarCircle}>
            <Text style={s.avatarLetter}>
              {displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={s.avatarName}>{displayName}</Text>
        </View>
      )}

      {/* Badges Overlay */}
      <View style={s.tileOverlay}>
        <View style={s.participantInfo}>
          <Text style={isSpotlight ? s.name : s.nameSmall} numberOfLines={1}>
            {displayName}
            {track.source === Track.Source.ScreenShare ? " (Screen)" : ""}
          </Text>
          {!isMicEnabled ? (
            <Text style={s.mutedBadge}>🔇</Text>
          ) : null}
          {hasHandRaised ? (
            <Text style={s.handBadge}>✋ Raised</Text>
          ) : null}
        </View>

        <View style={s.qualityBadge}>
          <View style={[s.qualityDot, { backgroundColor: qualityColor }]} />
          <Text style={[s.qualityText, { color: qualityColor }]}>
            {qualityText}
          </Text>
        </View>
      </View>
    </View>
  );
}

function Stage({ lowDataMode }: { lowDataMode: boolean }) {
  const room = useRoomContext();
  const allTracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare]);
  const participants = useParticipants();
  const tracks = lowDataMode
    ? allTracks.filter((t) => t.source === Track.Source.ScreenShare)
    : allTracks;

  const [raisedHands, setRaisedHands] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!room) return;
    const handleDataReceived = (payload: Uint8Array, participant: any) => {
      try {
        const text = new TextDecoder().decode(payload);
        if (text.includes("RAISE_HAND") && participant) {
          setRaisedHands((prev) => new Set(prev).add(participant.identity));
          setTimeout(() => {
            setRaisedHands((prev) => {
              const next = new Set(prev);
              next.delete(participant.identity);
              return next;
            });
          }, 6000);
        }
      } catch (e) {
        console.warn("Failed to process data message", e);
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
        <View style={s.emptyIconContainer}>
          <Text style={{ fontSize: 32 }}>🎓</Text>
        </View>
        <H2 style={{ color: colors.text, marginBottom: 4 }}>Classroom Active</H2>
        <Muted>
          {participants.length > 1
            ? `${participants.length} peers connected. Waiting for camera broadcast…`
            : "Connected. Waiting for peers to join…"}
        </Muted>
      </View>
    );
  }

  // Teacher / Host spotlight: Prioritize screen share, then first camera
  const spotlightTrack =
    tracks.find((t) => t.source === Track.Source.ScreenShare) || tracks[0];
  const otherTracks = tracks.filter((t) => t !== spotlightTrack);

  return (
    <View style={s.stage}>
      <ParticipantTile track={spotlightTrack} isSpotlight raisedHands={raisedHands} />
      {otherTracks.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.otherTracksScroll}
          contentContainerStyle={s.otherTracksContainer}
        >
          {otherTracks.map((track, i) => (
            <ParticipantTile
              key={`${track.participant?.identity || i}-${track.source}-${i}`}
              track={track}
              raisedHands={raisedHands}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function Controls({
  canPublish,
  lowDataMode,
  onToggleLowData,
}: {
  canPublish: boolean;
  lowDataMode: boolean;
  onToggleLowData: () => void;
}) {
  const room = useRoomContext();
  const [cam, setCam] = useState(canPublish);
  const [mic, setMic] = useState(canPublish);
  const [share, setShare] = useState(false);
  const [handRaised, setHandRaised] = useState(false);

  async function toggle(kind: "cam" | "mic" | "share" | "flip") {
    if (!canPublish && kind !== "flip") {
      return Alert.alert(
        "Viewer Mode",
        "Only the classroom teacher or room host can broadcast audio and video.",
      );
    }
    try {
      if (kind === "cam") {
        await room.localParticipant.setCameraEnabled(!cam);
        setCam(!cam);
      } else if (kind === "mic") {
        await room.localParticipant.setMicrophoneEnabled(!mic);
        setMic(!mic);
      } else if (kind === "share") {
        await room.localParticipant.setScreenShareEnabled(!share);
        setShare(!share);
      } else if (kind === "flip") {
        const camTrack = room.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack;
        if (camTrack && typeof (camTrack as any).switchCamera === "function") {
          await (camTrack as any).switchCamera();
        } else if (typeof (room.localParticipant as any).switchCamera === "function") {
          await (room.localParticipant as any).switchCamera();
        } else {
          Alert.alert("Camera", "Camera flipping is not supported on this device.");
        }
      }
    } catch (e) {
      Alert.alert(
        "Media Control",
        e instanceof Error ? e.message : "Media device action could not be completed.",
      );
    }
  }

  async function raiseHand() {
    try {
      const payload = new TextEncoder().encode(JSON.stringify({ type: "RAISE_HAND", timestamp: Date.now() }));
      await room.localParticipant.publishData(payload, { reliable: true });
      setHandRaised(true);
      setTimeout(() => setHandRaised(false), 6000);
    } catch (e) {
      console.warn("Failed to send hand raise", e);
    }
  }

  async function leaveClassroom() {
    try {
      if (room) {
        await room.disconnect();
      }
    } catch (e) {
      console.warn("Disconnect error", e);
    }
    router.back();
  }

  return (
    <View style={s.controls}>
      <Row style={{ flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
        {canPublish ? (
          <>
            <Button
              title={mic ? "Mute 🎤" : "Unmute 🔇"}
              variant={mic ? "secondary" : "primary"}
              compact
              onPress={() => toggle("mic")}
            />
            <Button
              title={cam ? "Cam Off 📷" : "Cam On 📷"}
              variant={cam ? "secondary" : "primary"}
              compact
              onPress={() => toggle("cam")}
            />
            {cam ? (
              <Button
                title="Flip 🔄"
                variant="secondary"
                compact
                onPress={() => toggle("flip")}
              />
            ) : null}
            <Button
              title={share ? "Stop Share 🖥️" : "Share Screen 🖥️"}
              variant="secondary"
              compact
              onPress={() => toggle("share")}
            />
          </>
        ) : null}

        <Button
          title={handRaised ? "Hand Raised ✋" : "Raise Hand ✋"}
          variant={handRaised ? "primary" : "secondary"}
          compact
          onPress={raiseHand}
        />
        <Button
          title={lowDataMode ? "Audio Only 📶" : "HD Video 📶"}
          variant="secondary"
          compact
          onPress={onToggleLowData}
        />
        <Button
          title="Leave Room"
          variant="danger"
          compact
          onPress={leaveClassroom}
        />
      </Row>
    </View>
  );
}

export default function LiveRoomScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const [creds, setCreds] = useState<LiveCreds | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lowDataMode, setLowDataMode] = useState(false);

  const fetchToken = useCallback(() => {
    if (!roomId) return;
    setLoading(true);
    setError(null);
    api<LiveCreds>(`/live/token/${roomId}`, { method: "POST" })
      .then((data) => {
        setCreds(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message || "Failed to join live classroom.");
        setLoading(false);
      });
  }, [roomId]);

  useEffect(() => {
    AsyncStorage.getItem("@low_data_mode").then((v) => {
      if (v === "true") setLowDataMode(true);
    });

    AudioSession.startAudioSession();
    fetchToken();

    return () => {
      AudioSession.stopAudioSession();
    };
  }, [fetchToken]);

  const handleToggleLowData = () => {
    const next = !lowDataMode;
    setLowDataMode(next);
    AsyncStorage.setItem("@low_data_mode", next ? "true" : "false");
  };

  if (loading) {
    return (
      <Screen contentStyle={s.centerScreen}>
        <ActivityIndicator size="large" color={colors.primary} />
        <H2 style={{ marginTop: 16, color: colors.text }}>Entering Live Classroom</H2>
        <Muted>Securing WebRTC stream connection…</Muted>
      </Screen>
    );
  }

  if (error || !creds) {
    return (
      <Screen contentStyle={s.centerScreen}>
        <View style={s.errorBox}>
          <Text style={{ fontSize: 36, marginBottom: 8, textAlign: "center" }}>⚠️</Text>
          <H1 style={{ textAlign: "center", marginBottom: 8 }}>Live Classroom Notice</H1>
          <Muted style={{ textAlign: "center", marginBottom: 20 }}>
            {error || "Could not retrieve live classroom access token."}
          </Muted>
          <Row style={{ justifyContent: "center", gap: 12 }}>
            <Button
              title="Go Back"
              variant="secondary"
              onPress={() => router.back()}
            />
            <Button
              title="Retry Connection"
              variant="primary"
              onPress={fetchToken}
            />
          </Row>
        </View>
      </Screen>
    );
  }

  return (
    <View style={s.root}>
      <LiveKitRoom
        serverUrl={creds.url}
        token={creds.token}
        connect={true}
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
  centerScreen: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  errorBox: {
    backgroundColor: colors.surface,
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    width: "100%",
    maxWidth: 400,
  },
  stage: {
    flex: 1,
    padding: 8,
    gap: 8,
  },
  emptyStage: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  emptyIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  spotlightTile: {
    flex: 2,
    backgroundColor: colors.surface,
    borderRadius: 16,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  otherTracksScroll: {
    flexGrow: 0,
    maxHeight: 120,
  },
  otherTracksContainer: {
    flexDirection: "row",
    gap: 8,
  },
  smallTile: {
    width: 140,
    height: 110,
    backgroundColor: colors.surface,
    borderRadius: 12,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
    padding: 12,
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#1E3A8A",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
  },
  avatarLetter: {
    fontSize: 22,
    fontWeight: "700",
    color: "#93C5FD",
  },
  avatarName: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: "500",
  },
  tileOverlay: {
    position: "absolute",
    bottom: 6,
    left: 6,
    right: 6,
    backgroundColor: "rgba(0,0,0,0.65)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  participantInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
  name: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  nameSmall: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
    maxWidth: 80,
  },
  mutedBadge: {
    fontSize: 10,
  },
  handBadge: {
    fontSize: 10,
    color: "#F59E0B",
    fontWeight: "700",
  },
  qualityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  qualityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  qualityText: {
    fontSize: 9,
    fontWeight: "bold",
  },
  controls: {
    padding: 12,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});

