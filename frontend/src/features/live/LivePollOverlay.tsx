import { useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal, TextInput, Alert } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { Row, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import type { LivePollPacket } from "./liveDataPacket";

type PollMeta = {
  kind?: string;
  options: { id: string; text: string; votes: number }[];
  total_votes: number;
  is_open: boolean;
};

/**
 * Live classroom poll overlay.
 *
 * Durable truth lives in the API (`/rooms/:id/polls/*`) so a student who
 * reconnects mid-class still sees the running poll. The LiveKit DataChannel is
 * only an instant "a new poll just started" nudge, never the vote source.
 */
export function LivePollOverlay({
  roomId,
  isHost,
  publish,
}: {
  roomId: string;
  isHost: boolean;
  publish?: (packet: LivePollPacket) => Promise<void>;
}) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);

  const pollQ = useQuery({
    queryKey: ["room-poll-active", roomId],
    queryFn: () =>
      api<{ poll: { id: string; title: string; metadata: PollMeta } | null }>(
        `/rooms/${roomId}/polls/active`,
      ),
    refetchInterval: 5000,
    enabled: Boolean(roomId),
  });
  const poll = pollQ.data?.poll ?? null;
  const meta = poll?.metadata;
  const total = meta?.total_votes ?? 0;

  const voteM = useMutation({
    mutationFn: (optionId: string) =>
      api(`/rooms/${roomId}/polls/${poll!.id}/vote`, {
        method: "POST",
        body: JSON.stringify({ optionId }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["room-poll-active", roomId] }),
  });
  const createM = useMutation({
    mutationFn: () =>
      api(`/rooms/${roomId}/polls`, {
        method: "POST",
        body: JSON.stringify({
          question: question.trim(),
          options: options.map((o) => o.trim()).filter(Boolean),
        }),
      }),
    onSuccess: async (data: any) => {
      setQuestion("");
      setOptions(["", ""]);
      setShowCreate(false);
      qc.invalidateQueries({ queryKey: ["room-poll-active", roomId] });
      const p = data?.poll;
      if (p && publish) {
        await publish({
          version: 1,
          type: "poll",
          pollId: p.id,
          question: p.title,
          options: (p.metadata?.options ?? []).map((o: any) => ({ id: o.id, text: o.text })),
          action: "start",
          timestamp: Date.now(),
        }).catch(() => {});
      }
    },
    onError: (e: Error) => Alert.alert("Poll hoy ni", e.message),
  });
  const closeM = useMutation({
    mutationFn: () => api(`/rooms/${roomId}/polls/${poll!.id}/close`, { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["room-poll-active", roomId] }),
  });

  return (
    <>
      <Pressable
        style={[s.bar, { backgroundColor: "rgba(8,16,30,0.88)", borderColor: colors.border }]}
        onPress={() => isHost && setShowCreate(true)}
      >
        <Row style={{ alignItems: "center", gap: 6, flex: 1 }}>
          <MaterialCommunityIcons name="poll" size={15} color={colors.primary} />
          <Text style={[s.barTitle, { color: colors.text }]} numberOfLines={1}>
            {poll ? poll.title : isHost ? "Tap: live poll chalu koro" : "Ekhono poll chalu nei"}
          </Text>
        </Row>
        {poll && meta?.is_open && (
          <Text style={[s.barMeta, { color: colors.primary }]}>{total} votes</Text>
        )}
        {isHost && poll && meta?.is_open && (
          <Pressable onPress={() => closeM.mutate()} hitSlop={8}>
            <MaterialCommunityIcons name="close-circle" size={16} color={colors.danger} />
          </Pressable>
        )}
      </Pressable>

      {poll && meta?.is_open && (
        <View style={[s.optionsWrap, { backgroundColor: "rgba(8,16,30,0.88)", borderColor: colors.border }]}>
          {meta.options.map((o) => {
            const pct = total > 0 ? Math.round(((o.votes ?? 0) / total) * 100) : 0;
            return (
              <Pressable
                key={o.id}
                onPress={() => {
                  triggerHaptic();
                  voteM.mutate(o.id);
                }}
                style={[s.opt, { borderColor: colors.border }]}
              >
                <View style={[s.optFill, { width: `${pct}%`, backgroundColor: colors.primary + "33" }]} />
                <Row style={{ alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={[s.optText, { color: colors.text }]} numberOfLines={1}>
                    {o.text}
                  </Text>
                  <Text style={[s.optPct, { color: colors.primary }]}>{pct}%</Text>
                </Row>
              </Pressable>
            );
          })}
          <Text style={[s.hint, { color: colors.muted }]}>
            Vote dile +5 XP · Notappati change kora jay
          </Text>
        </View>
      )}

      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <View style={s.overlay}>
          <View style={[s.sheet, { backgroundColor: colors.surface }]}>
            <Text style={[s.sheetTitle, { color: colors.text }]}>Live Poll</Text>
            <TextInput
              value={question}
              onChangeText={setQuestion}
              placeholder="Ki proshno korcho?"
              placeholderTextColor={colors.muted}
              style={[s.input, { borderColor: colors.border, color: colors.text }]}
            />
            {options.map((o, i) => (
              <TextInput
                key={i}
                value={o}
                onChangeText={(t) => setOptions((prev) => prev.map((x, j) => (j === i ? t : x)))}
                placeholder={`Option ${i + 1}`}
                placeholderTextColor={colors.muted}
                style={[s.input, { borderColor: colors.border, color: colors.text }]}
              />
            ))}
            {options.length < 6 && (
              <Pressable onPress={() => setOptions((p) => [...p, ""])}>
                <Text style={{ color: colors.primary, fontWeight: "700" }}>+ Option jog koro</Text>
              </Pressable>
            )}
            <Row style={{ justifyContent: "flex-end", gap: 12, marginTop: 14 }}>
              <Pressable onPress={() => setShowCreate(false)}>
                <Text style={{ color: colors.muted, fontWeight: "700" }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => createM.mutate()}
                disabled={createM.isPending || !question.trim() || options.filter((o) => o.trim()).length < 2}
                style={[s.submit, { backgroundColor: colors.primary, opacity: question.trim() ? 1 : 0.5 }]}
              >
                <Text style={s.submitText}>Chalu koro</Text>
              </Pressable>
            </Row>
          </View>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginHorizontal: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  barTitle: { fontSize: 12, fontWeight: "800", flexShrink: 1 },
  barMeta: { fontSize: 11, fontWeight: "800" },
  optionsWrap: {
    marginHorizontal: 8,
    padding: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    gap: 6,
  },
  opt: { borderWidth: 1, borderRadius: radius.sm, overflow: "hidden", paddingHorizontal: 10, paddingVertical: 7 },
  optFill: { position: "absolute", top: 0, bottom: 0, left: 0 },
  optText: { fontSize: 12, fontWeight: "700" },
  optPct: { fontSize: 11, fontWeight: "800" },
  hint: { fontSize: 10 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { padding: 16, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 8 },
  sheetTitle: { fontSize: 16, fontWeight: "800" },
  input: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  submit: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.sm },
  submitText: { color: "#fff", fontWeight: "800", fontSize: 13 },
});