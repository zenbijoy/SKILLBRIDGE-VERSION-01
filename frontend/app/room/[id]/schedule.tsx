import { useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { Alert } from "react-native";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Field, H1, Muted, Pill, Row, Screen } from "@/components/ui";
export default function ScheduleRoom() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [starts, setStarts] = useState(
    new Date(Date.now() + 86400000).toISOString(),
  );
  const [mode, setMode] = useState<"online" | "offline" | "hybrid">("online");
  const [location, setLocation] = useState("");
  const m = useMutation({
    mutationFn: () =>
      api("/sessions", {
        method: "POST",
        body: JSON.stringify({
          room_id: id,
          starts_at: starts,
          mode,
          campus_location: mode === "online" ? undefined : location,
        }),
      }),
    onSuccess: () => {
      Alert.alert("Session scheduled");
      router.back();
    },
    onError: (e) => Alert.alert("Scheduling failed", e.message),
  });
  return (
    <Screen>
      <H1>Schedule peer-learning session</H1>
      <Muted>
        Teacher/owner schedules; room members receive invitations and push
        notifications.
      </Muted>
      <Field
        value={starts}
        onChangeText={setStarts}
        placeholder="ISO date/time, e.g. 2026-08-12T14:00:00+06:00"
      />
      <Row>
        {(["online", "offline", "hybrid"] as const).map((x) => (
          <Button
            key={x}
            title={x}
            variant={mode === x ? "primary" : "secondary"}
            onPress={() => setMode(x)}
          />
        ))}
      </Row>
      {mode !== "online" ? (
        <Field
          value={location}
          onChangeText={setLocation}
          placeholder="Campus location"
        />
      ) : null}
      <Button
        title={m.isPending ? "Scheduling…" : "Confirm schedule"}
        onPress={() => m.mutate()}
      />
    </Screen>
  );
}
