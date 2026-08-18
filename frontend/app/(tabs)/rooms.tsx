import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "@/lib/api";
import type { Room, RoomMode } from "@/types";
import { AppHeader } from "@/components/navigation/AppHeader";
import { Button, Card, Empty, ErrorState, Field, H2, Muted, Pill, Row, Screen, Skeleton } from "@/components/ui";
import { RoomCard } from "@/components/RoomCard";
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
    mutationFn: () => api<Room>("/rooms", {
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
    <Screen>
      <AppHeader
        title={t("rooms.title")}
        searchPlaceholder="Search rooms, topics, skills..."
        actionIcon={showCreator ? "close" : "plus"}
        actionLabel={showCreator ? "Close room creator" : "Create room"}
        onAction={() => setShowCreator((value) => !value)}
      />
      <Muted>{t("rooms.subtitle")}</Muted>

      <Row>
        {(["all", "live", "scheduled"] as const).map((item) => (
          <Pressable key={item} onPress={() => setFilter(item)}>
            <Pill tone={filter === item ? "primary" : "default"}>{item === "all" ? "For you" : item === "live" ? "● Live" : "Upcoming"}</Pill>
          </Pressable>
        ))}
      </Row>

      {showCreator ? (
        <Card tone="primary">
          <H2>Create a focused learning room</H2>
          <Muted>Keep the title specific so the right learners and teachers can find it.</Muted>
          <Field placeholder="Room title" value={title} onChangeText={setTitle} />
          <Field placeholder="Topic / skill" value={topic} onChangeText={setTopic} />
          <Field placeholder="Short description (optional)" value={description} onChangeText={setDescription} multiline numberOfLines={3} />
          <Muted>Visibility</Muted>
          <Row>
            {(["public", "private", "invite_only"] as const).map((item) => (
              <Pressable key={item} onPress={() => setVisibility(item)}><Pill tone={visibility === item ? "primary" : "default"}>{item.replace("_", " ")}</Pill></Pressable>
            ))}
          </Row>
          <Muted>Mode</Muted>
          <Row>
            {(["online", "offline", "hybrid"] as const).map((item) => (
              <Pressable key={item} onPress={() => setMode(item)}><Pill tone={mode === item ? "primary" : "default"}>{item}</Pill></Pressable>
            ))}
          </Row>
          <View style={s.actions}>
            <Button title="Cancel" variant="ghost" onPress={() => setShowCreator(false)} />
            <Button title={create.isPending ? "Creating…" : t("rooms.create")} disabled={title.trim().length < 3 || topic.trim().length < 2 || create.isPending} onPress={() => create.mutate()} />
          </View>
        </Card>
      ) : null}

      {rooms.isLoading ? <><Skeleton height={125} /><Skeleton height={125} /></> : null}
      {rooms.isError ? <ErrorState detail={(rooms.error as Error).message} onRetry={() => rooms.refetch()} /> : null}
      {rooms.isSuccess && filtered.length === 0 ? <Empty title={t("rooms.empty")} detail={t("rooms.emptyDetail")} actionTitle={t("rooms.create")} onAction={() => setShowCreator(true)} /> : null}
      {filtered.map((room) => <RoomCard key={room.id} room={room} />)}
    </Screen>
  );
}

const s = StyleSheet.create({
  actions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 8, flexWrap: "wrap" },
});
