import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import { api } from "@/lib/api";
import type { Room } from "@/types";
import {
  Button,
  Card,
  Field,
  H1,
  Muted,
  Pill,
  Row,
  Screen,
} from "@/components/ui";
import { RoomCard } from "@/components/RoomCard";
export default function Rooms() {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [show, setShow] = useState(false);
  const q = useQuery({
    queryKey: ["rooms"],
    queryFn: () => api<{ rooms: Room[] }>("/rooms"),
  });
  const create = useMutation({
    mutationFn: () =>
      api<Room>("/rooms", {
        method: "POST",
        body: JSON.stringify({
          title,
          topic,
          description: `Peer learning room for ${topic}`,
          visibility: "public",
          mode: "hybrid",
          capacity: 30,
          tags: [topic],
        }),
      }),
    onSuccess: () => {
      setTitle("");
      setTopic("");
      setShow(false);
      qc.invalidateQueries({ queryKey: ["rooms"] });
    },
    onError: (e) => Alert.alert("Could not create room", e.message),
  });
  return (
    <Screen>
      <H1>Learning rooms</H1>
      <Muted>
        Game-lobby-style study rooms with teaching requests, sessions,
        resources, chat and live class.
      </Muted>
      <Row>
        <Pill tone="accent">Public</Pill>
        <Pill>Private</Pill>
        <Pill>Invite only</Pill>
      </Row>
      <Button
        title={show ? "Close creator" : "Create a room"}
        onPress={() => setShow((v) => !v)}
      />
      {show ? (
        <Card>
          <Field
            placeholder="Room title"
            value={title}
            onChangeText={setTitle}
          />
          <Field
            placeholder="Topic / skill"
            value={topic}
            onChangeText={setTopic}
          />
          <Button
            title={create.isPending ? "Creating…" : "Create room"}
            disabled={!title || !topic || create.isPending}
            onPress={() => create.mutate()}
          />
        </Card>
      ) : null}
      {q.data?.rooms?.map((r) => (
        <RoomCard key={r.id} room={r} />
      ))}
    </Screen>
  );
}
