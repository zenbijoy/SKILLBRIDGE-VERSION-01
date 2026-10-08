import { View, Text, StyleSheet, Pressable } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { Row, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import { useI18n } from "@/i18n";

export type RoomPoll = {
  id: string;
  title: string;
  metadata: { options: { id: string; text: string; votes: number }[]; total_votes: number; is_open: boolean };
};

export function RoomPollCard({ roomId, isLeader }: { roomId: string; isLeader?: boolean }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const qc = useQueryClient();
  const activeQ = useQuery({
    queryKey: ["room-poll-active", roomId],
    queryFn: () => api<{ poll: RoomPoll | null }>(`/rooms/${roomId}/polls/active`),
    refetchInterval: 8000,
  });
  const poll = activeQ.data?.poll ?? null;
  const meta = poll?.metadata;
  const total = meta?.total_votes ?? 0;
  const voteM = useMutation({
    mutationFn: (optionId: string) =>
      api(`/rooms/${roomId}/polls/${poll!.id}/vote`, { method: "POST", body: JSON.stringify({ optionId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["room-poll-active", roomId] }),
  });
  return (
    <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Row style={{ alignItems: "center", gap: 6 }}>
        <MaterialCommunityIcons name="poll" size={18} color={colors.primary} />
        <Text style={[s.title, { color: colors.text }]}>{t("rooms.polls.livePoll")}</Text>
      </Row>
      {!poll ? (
        <Text style={[s.sub, { color: colors.muted }]}>{t("rooms.polls.noPoll")}</Text>
      ) : (
        <View style={{ gap: 8, marginTop: 8 }}>
          <Text style={[s.question, { color: colors.text }]}>{poll.title}</Text>
          {meta?.options?.map((o) => {
            const pct = total > 0 ? Math.round(((o.votes ?? 0) / total) * 100) : 0;
            return (
              <Pressable
                key={o.id}
                accessibilityRole="button"
                accessibilityLabel={o.text}
                onPress={() => {
                  triggerHaptic();
                  meta.is_open && voteM.mutate(o.id);
                }}
                style={[s.opt, { borderColor: colors.border, backgroundColor: colors.surface2 }]}
              >
                <View style={[s.fill, { width: `${pct}%`, backgroundColor: colors.primary + "22" }]} />
                <Row style={{ alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={[s.optTxt, { color: colors.text }]}>{o.text}</Text>
                  <Text style={[s.pct, { color: colors.primary }]}>{pct}%</Text>
                </Row>
              </Pressable>
            );
          })}
          <Text style={[s.sub, { color: colors.muted }]}>{total} {t("rooms.polls.votesCount")}</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { padding: 12, borderRadius: radius.md, borderWidth: 1 },
  title: { fontSize: 14, fontWeight: "800" },
  sub: { fontSize: 12, marginTop: 4 },
  question: { fontSize: 14, fontWeight: "800" },
  opt: { borderWidth: 1, borderRadius: radius.sm, overflow: "hidden", padding: 10 },
  fill: { position: "absolute", top: 0, bottom: 0, left: 0 },
  optTxt: { fontSize: 13, fontWeight: "700" },
  pct: { fontSize: 12, fontWeight: "800" },
});

