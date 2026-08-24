import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import Animated, { ZoomIn } from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import type { Room, RoomMode } from "@/types";
import { AppHeader } from "@/components/navigation/AppHeader";
import { Button, Card, Empty, ErrorState, Field, H2, Muted, Pill, Row, Screen, Skeleton, triggerHaptic } from "@/components/ui";
import { RoomCard } from "@/components/RoomCard";
import { spotIllustrations } from "@/assets/illustrations";
import { useI18n } from "@/i18n";
import { useTheme } from "@/theme";

type RoomFilter = "all" | "live" | "scheduled";
type Visibility = Room["visibility"];

export default function Rooms() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<RoomFilter>("all");
  const [showCreator, setShowCreator] = useState(false);
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [mode, setMode] = useState<RoomMode>("online");

  const rooms = useQuery({
    queryKey: ["rooms"],
    queryFn: () => api<{ rooms: Room[] }>("/rooms"),
  });

  const create = useMutation({
    mutationFn: () =>
      api<Room>("/rooms", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          topic: topic.trim(),
          description: description.trim() || `Peer learning room for ${topic.trim()}`,
          visibility,
          mode,
          capacity: 30,
          tags: topic.trim() ? [topic.trim()] : [],
        }),
      }),
    onSuccess: () => {
      triggerHaptic();
      setTitle("");
      setTopic("");
      setDescription("");
      setVisibility("public");
      setMode("online");
      setShowCreator(false);
      qc.invalidateQueries({ queryKey: ["rooms"] });
    },
    onError: (error) => Alert.alert("Could not create room", error.message),
  });

  const filtered = useMemo(() => {
    const all = rooms.data?.rooms ?? [];
    if (filter === "all") return all;
    return all.filter((room) => room.status === filter);
  }, [rooms.data?.rooms, filter]);

  return (
    <Screen
      onRefresh={async () => {
        await rooms.refetch();
      }}
      refreshing={rooms.isRefetching}
    >
      <AppHeader
        title={t("rooms.title")}
        searchPlaceholder="Search rooms, topics, skills..."
        actionIcon={showCreator ? "close" : "plus"}
        actionLabel={showCreator ? "Close room creator" : "Create room"}
        onAction={() => {
          triggerHaptic();
          setShowCreator((value) => !value);
        }}
      />
      <Muted>{t("rooms.subtitle")}</Muted>

      {/* Filter Chips */}
      <Row>
        {(["all", "live", "scheduled"] as const).map((item) => (
          <Pill
            key={item}
            tone={filter === item ? "primary" : "default"}
            onPress={() => setFilter(item)}
          >
            {item === "all" ? "All Rooms" : item === "live" ? "● Live Now" : "Upcoming Sessions"}
          </Pill>
        ))}
      </Row>

      {/* Create Room Drawer */}
      {showCreator ? (
        <Card tone="glow">
          <Row style={{ justifyContent: "space-between" }}>
            <H2>Create a Focused Room</H2>
            <Pressable onPress={() => setShowCreator(false)}>
              <MaterialCommunityIcons name="close" size={22} color={colors.muted} />
            </Pressable>
          </Row>
          <Muted>Choose a clear topic and format so peers and tutors can join easily.</Muted>
          <Field placeholder="Room title (e.g. Data Structures & Algorithms)" value={title} onChangeText={setTitle} />
          <Field placeholder="Topic or skill tag (e.g. Python, Graph Theory)" value={topic} onChangeText={setTopic} />
          <Field
            placeholder="Short description / what we will cover (optional)"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
          />
          <Muted style={{ fontWeight: "700" }}>Access Visibility</Muted>
          <Row>
            {(["public", "private", "invite_only"] as const).map((item) => (
              <Pill
                key={item}
                tone={visibility === item ? "primary" : "default"}
                onPress={() => setVisibility(item)}
              >
                {item.replace("_", " ")}
              </Pill>
            ))}
          </Row>
          <Muted style={{ fontWeight: "700" }}>Class Format</Muted>
          <Row>
            {(["online", "offline", "hybrid"] as const).map((item) => (
              <Pill
                key={item}
                tone={mode === item ? "accent" : "default"}
                onPress={() => setMode(item)}
              >
                {item === "online" ? "🌐 Online LiveKit" : item === "offline" ? "📍 On Campus" : "⚡ Hybrid"}
              </Pill>
            ))}
          </Row>
          <View style={s.actions}>
            <Button title="Cancel" variant="ghost" onPress={() => setShowCreator(false)} />
            <Button
              title={create.isPending ? "Creating…" : t("rooms.create")}
              disabled={title.trim().length < 3 || topic.trim().length < 2 || create.isPending}
              loading={create.isPending}
              onPress={() => create.mutate()}
            />
          </View>
        </Card>
      ) : null}

      {rooms.isLoading ? (
        <>
          <Skeleton height={130} />
          <Skeleton height={130} />
          <Skeleton height={130} />
        </>
      ) : null}
      {rooms.isError ? (
        <ErrorState detail={(rooms.error as Error).message} onRetry={() => rooms.refetch()} />
      ) : null}
      {rooms.isSuccess && filtered.length === 0 ? (
        <Empty
          illustration={spotIllustrations.createRoom}
          title={t("rooms.empty")}
          detail={t("rooms.emptyDetail")}
          actionTitle={t("rooms.create")}
          onAction={() => setShowCreator(true)}
        />
      ) : null}
      {filtered.map((room, idx) => (
        <Animated.View key={room.id} entering={ZoomIn.delay(idx * 50).springify()}>
          <RoomCard room={room} />
        </Animated.View>
      ))}
    </Screen>
  );
}

const s = StyleSheet.create({
  actions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 10, marginTop: 6 },
});
