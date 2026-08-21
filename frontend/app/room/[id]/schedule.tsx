import { useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { Button, Card, Field, H1, H2, Muted, Pill, Row, Screen, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";

export default function ScheduleRoom() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const qc = useQueryClient();

  const [starts, setStarts] = useState(() => {
    const d = new Date(Date.now() + 86400000);
    d.setHours(14, 0, 0, 0);
    return d.toISOString();
  });
  const [mode, setMode] = useState<"online" | "offline" | "hybrid">("online");
  const [location, setLocation] = useState("");

  const m = useMutation({
    mutationFn: () => {
      if ((mode === "offline" || mode === "hybrid") && !location.trim()) {
        throw new Error("Campus location is required for in-person or hybrid sessions.");
      }
      return api("/sessions", {
        method: "POST",
        body: JSON.stringify({
          room_id: id,
          starts_at: starts,
          mode,
          campus_location: mode === "online" ? undefined : location.trim() || undefined,
        }),
      });
    },
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["room", id] });
      qc.invalidateQueries({ queryKey: ["schedule"] });
      Alert.alert("Session scheduled! 🚀", "Room members have received notification invitations.");
      router.back();
    },
    onError: (e: any) => Alert.alert("Scheduling failed", e.message),
  });

  const setPresetDate = (hoursAhead: number) => {
    triggerHaptic();
    const d = new Date(Date.now() + hoursAhead * 3600000);
    d.setMinutes(0, 0, 0);
    setStarts(d.toISOString());
  };

  return (
    <Screen>
      <H1>Schedule Peer Session ⏱️</H1>
      <Muted>
        Create a class time or project deadline. Room members will receive automated push notifications and calendar sync.
      </Muted>

      <Card tone="glow">
        <H2>1. Pick Date & Time</H2>
        <Muted>Quick presets or custom ISO timestamp:</Muted>
        <Row style={{ marginTop: 4 }}>
          <Pill tone="primary" onPress={() => setPresetDate(4)}>In 4 hours</Pill>
          <Pill tone="primary" onPress={() => setPresetDate(24)}>Tomorrow</Pill>
          <Pill tone="primary" onPress={() => setPresetDate(48)}>In 2 Days</Pill>
          <Pill tone="primary" onPress={() => setPresetDate(168)}>Next Week</Pill>
        </Row>

        <Field
          value={starts}
          onChangeText={setStarts}
          placeholder="ISO date/time, e.g. 2026-08-25T15:00:00.000Z"
        />
        <Muted style={{ fontSize: 11 }}>
          Selected: {new Date(starts).toLocaleString()}
        </Muted>
      </Card>

      <Card>
        <H2>2. Session Classroom Format</H2>
        <View style={s.modeSelector}>
          {[
            { key: "online", label: "🌐 Online LiveKit Video", desc: "Interactive video with screen share & audio" },
            { key: "offline", label: "📍 Campus Physical Meetup", desc: "Library, faculty room, lab or campus cafe" },
            { key: "hybrid", label: "⚡ Hybrid (LiveKit + Campus)", desc: "Simultaneous in-person & online stream" },
          ].map((item) => {
            const active = mode === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => {
                  triggerHaptic();
                  setMode(item.key as any);
                }}
                style={[
                  s.modeCard,
                  {
                    backgroundColor: colors.surface2,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: colors.text, fontWeight: "800", fontSize: 14 }}>{item.label}</Text>
                  <Muted style={{ fontSize: 11 }}>{item.desc}</Muted>
                </View>
                {active ? <MaterialCommunityIcons name="check-circle" size={20} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
        </View>

        {mode !== "online" ? (
          <View style={{ marginTop: 8 }}>
            <Field
              value={location}
              onChangeText={setLocation}
              placeholder="Campus location (e.g. Central Library Floor 3, Room 304)"
            />
          </View>
        ) : null}
      </Card>

      <Button
        title={m.isPending ? "Scheduling Session…" : "Confirm & Notify Members 🚀"}
        disabled={m.isPending || !starts}
        loading={m.isPending}
        onPress={() => m.mutate()}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  modeSelector: { gap: 8, marginTop: 6 },
  modeCard: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: radius.md, borderWidth: 1.5, gap: 10 },
});
