import { View, Text, StyleSheet, Pressable } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { Row } from "@/components/ui";
import { radius, useTheme } from "@/theme";

export function RoomAttendanceCard({ roomId }: { roomId: string }) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["room-attendance-me", roomId],
    queryFn: () => api<{ totalSessions: number; attended: number; percent: number; eligible: boolean; certificate: any }>(`/rooms/${roomId}/attendance/me`),
  });
  const d = q.data;
  const claim = useMutation({
    mutationFn: () => api(`/rooms/${roomId}/attendance/claim`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["room-attendance-me", roomId] }),
  });
  const pct = d?.percent ?? 0;
  return (
    <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Row style={{ alignItems: "center", gap: 6 }}>
        <MaterialCommunityIcons name="certificate-outline" size={18} color={colors.primary} />
        <Text style={[s.title, { color: colors.text }]}>Hajira + Certificate</Text>
      </Row>
      <Text style={[s.sub, { color: colors.muted }]}>
        {d ? `${d.attended}/${d.totalSessions} class · ${pct}%` : "Loading…"}
      </Text>
      <View style={[s.bar, { backgroundColor: colors.border }]}>
        <View style={[s.fill, { width: `${pct}%`, backgroundColor: pct >= 80 ? colors.success : colors.primary }]} />
      </View>
      {d?.certificate ? (
        <Text style={[s.done, { color: colors.success }]}>Certificate peye gecho! Code: {d.certificate.code} · +100 XP</Text>
      ) : d?.eligible ? (
        <Pressable onPress={() => claim.mutate()} style={[s.btn, { backgroundColor: colors.primary }]}>
          <Text style={s.btnTxt}>Certificate Claim (+100 XP)</Text>
        </Pressable>
      ) : (
        <Text style={[s.sub, { color: colors.muted }]}>80% thakle certificate pabe.</Text>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  card: { padding: 12, borderRadius: radius.md, borderWidth: 1, gap: 6 },
  title: { fontSize: 14, fontWeight: "800" },
  sub: { fontSize: 12 },
  bar: { height: 8, borderRadius: 4, overflow: "hidden" },
  fill: { height: "100%" },
  btn: { padding: 10, borderRadius: radius.sm, alignItems: "center" },
  btnTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },
  done: { fontSize: 12, fontWeight: "700" },
});
