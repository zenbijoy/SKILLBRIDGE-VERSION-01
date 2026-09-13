import { useEffect, useState, useCallback } from "react";
import { useLocalSearchParams, router } from "expo-router";
import {
  Alert,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  ScrollView,
  TextInput,
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

import { decodeLivePacket, encodeLivePacket } from "./liveDataPacket";

function Stage({ lowDataMode }: { lowDataMode: boolean }) {
  const room = useRoomContext();
  const participants = useParticipants();
  const allTracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  const tracks = lowDataMode
    ? allTracks.filter((t) => t.source === Track.Source.ScreenShare)
    : allTracks;

  const [raisedHands, setRaisedHands] = useState<Set<string>>(new Set());
  const [transientChats, setTransientChats] = useState<{ id: string; senderName: string; text: string }[]>([]);
  const [floatingReactions, setFloatingReactions] = useState<{ id: string; emoji: string; senderName: string }[]>([]);

  useEffect(() => {
    if (!room) return;
    const handleDataReceived = (payload: Uint8Array, participant: any) => {
      try {
        const packet = decodeLivePacket(payload);
        if (packet) {
          if (packet.type === "hand_raise") {
            const ident = packet.senderId || participant?.identity;
            if (ident) {
              setRaisedHands((prev) => new Set(prev).add(ident));
              setTimeout(() => {
                setRaisedHands((prev) => {
                  const next = new Set(prev);
                  next.delete(ident);
                  return next;
                });
              }, 6000);
            }
          } else if (packet.type === "chat") {
            const msg = { id: Math.random().toString(), senderName: packet.senderName, text: packet.text };
            setTransientChats((prev) => [...prev.slice(-3), msg]);
            setTimeout(() => {
              setTransientChats((prev) => prev.filter((m) => m.id !== msg.id));
            }, 6000);
          } else if (packet.type === "reaction") {
            const rx = { id: Math.random().toString(), emoji: packet.emoji, senderName: packet.senderName };
            setFloatingReactions((prev) => [...prev.slice(-4), rx]);
            setTimeout(() => {
              setFloatingReactions((prev) => prev.filter((r) => r.id !== rx.id));
            }, 3000);
          }
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

      {/* Transient Chat Overlay */}
      {transientChats.length > 0 && (
        <View style={s.transientChatContainer} pointerEvents="none">
          {transientChats.map((msg) => (
            <View key={msg.id} style={s.transientChatBubble}>
              <Text style={s.transientSender}>{msg.senderName}</Text>
              <Text style={s.transientText}>{msg.text}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Floating Reactions Overlay */}
      {floatingReactions.length > 0 && (
        <View style={s.reactionsOverlay} pointerEvents="none">
          {floatingReactions.map((rx) => (
            <View key={rx.id} style={s.reactionBadge}>
              <Text style={{ fontSize: 24 }}>{rx.emoji}</Text>
            </View>
          ))}
        </View>
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
  const [quickChatText, setQuickChatText] = useState("");
  const [showChatInput, setShowChatInput] = useState(false);

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
      const packet = encodeLivePacket({
        version: 1,
        type: "hand_raise",
        timestamp: Date.now(),
        senderId: room.localParticipant.identity,
        senderName: room.localParticipant.name || "Student",
      });
      await room.localParticipant.publishData(packet as any, { reliable: true });
      setHandRaised(true);
      setTimeout(() => setHandRaised(false), 6000);
    } catch (e) {
      console.warn("Failed to send hand raise", e);
    }
  }

  async function sendReaction(emoji: string) {
    try {
      const packet = encodeLivePacket({
        version: 1,
        type: "reaction",
        emoji,
        timestamp: Date.now(),
        senderId: room.localParticipant.identity,
        senderName: room.localParticipant.name || "Peer",
      });
      await room.localParticipant.publishData(packet as any, { reliable: false });
    } catch (e) {
      console.warn("Failed to send reaction", e);
    }
  }

  async function sendTransientChat() {
    if (!quickChatText.trim()) return;
    try {
      const packet = encodeLivePacket({
        version: 1,
        type: "chat",
        text: quickChatText.trim(),
        timestamp: Date.now(),
        senderId: room.localParticipant.identity,
        senderName: room.localParticipant.name || "Student",
      });
      await room.localParticipant.publishData(packet as any, { reliable: true });
      setQuickChatText("");
      setShowChatInput(false);
    } catch (e) {
      console.warn("Failed to send live chat", e);
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
      {/* Quick Reaction Bar */}
      <Row style={{ justifyContent: "center", gap: 12, marginBottom: 8 }}>
        {["👏", "❤️", "💡", "🔥"].map((emoji) => (
          <Button
            key={emoji}
            title={emoji}
            variant="secondary"
            compact
            onPress={() => sendReaction(emoji)}
          />
        ))}
        <Button
          title={showChatInput ? "Close Chat" : "💬 Live Chat"}
          variant="secondary"
          compact
          onPress={() => setShowChatInput(!showChatInput)}
        />
      </Row>

      {/* Transient Quick Chat Input */}
      {showChatInput && (
        <Row style={{ gap: 8, marginBottom: 8, paddingHorizontal: 12 }}>
          <View style={{ flex: 1 }}>
            <TextInput
              style={{
                backgroundColor: colors.surface,
                color: colors.text,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                fontSize: 13,
              }}
              placeholder="Transient live message (disappears in 6s)..."
              placeholderTextColor={colors.muted}
              value={quickChatText}
              onChangeText={setQuickChatText}
              onSubmitEditing={sendTransientChat}
            />
          </View>
          <Button title="Send" variant="primary" compact onPress={sendTransientChat} />
        </Row>
      )}

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
  transientChatContainer: {
    position: "absolute",
    bottom: 16,
    left: 16,
    maxWidth: "70%",
    gap: 6,
  },
  transientChatBubble: {
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  transientSender: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "700",
  },
  transientText: {
    color: "#FFFFFF",
    fontSize: 12,
  },
  reactionsOverlay: {
    position: "absolute",
    top: 20,
    right: 20,
    gap: 8,
  },
  reactionBadge: {
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 6,
    borderRadius: 20,
  },
});

