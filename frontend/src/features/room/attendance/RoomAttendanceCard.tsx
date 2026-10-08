import { View, Text, StyleSheet, Pressable, Alert } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { Row } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import { useI18n } from "@/i18n";

export function RoomAttendanceCard({ roomId }: { roomId: string }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["room-attendance-me", roomId],
    queryFn: () =>
      api<{
        totalSessions: number;
        attended: number;
        percent: number;
        eligible: boolean;
        certificate: any;
      }>(`/rooms/${roomId}/attendance/me`),
  });
  const d = q.data;
  const claim = useMutation({
    mutationFn: () => api(`/rooms/${roomId}/attendance/claim`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["room-attendance-me", roomId] }),
    onError: (err: Error) => Alert.alert(t("rooms.attendance.claimError"), err.message),
  });
  const pct = d?.percent ?? 0;
  return (
    <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Row style={{ alignItems: "center", gap: 6 }}>
        <MaterialCommunityIcons name="certificate-outline" size={18} color={colors.primary} />
        <Text style={[s.title, { color: colors.text }]}>{t("rooms.attendance.title")}</Text>
      </Row>
      <Text style={[s.sub, { color: colors.muted }]}>
        {d ? `${d.attended}/${d.totalSessions} ${t("rooms.attendance.classesCount")} · ${pct}%` : t("common.loading")}
      </Text>
      <View style={[s.bar, { backgroundColor: colors.border }]}>
        <View style={[s.fill, { width: `${pct}%`, backgroundColor: pct >= 80 ? colors.success : colors.primary }]} />
      </View>
      {d?.certificate ? (
        <Text style={[s.done, { color: colors.success }]}>
          {t("rooms.attendance.certEarned")} {d.certificate.code} · +100 XP
        </Text>
      ) : d?.eligible ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("rooms.attendance.claimBtn")}
          disabled={claim.isPending}
          onPress={() => claim.mutate()}
          style={[s.btn, { backgroundColor: colors.primary, opacity: claim.isPending ? 0.6 : 1 }]}
        >
          <Text style={s.btnTxt}>
            {claim.isPending ? t("rooms.attendance.claiming") : t("rooms.attendance.claimBtn")}
          </Text>
        </Pressable>
      ) : (
        <Text style={[s.sub, { color: colors.muted }]}>{t("rooms.attendance.requirement")}</Text>
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
