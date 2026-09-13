import { useState } from "react";
import { View, Text, StyleSheet, Modal, Pressable, ActivityIndicator, Alert, TextInput } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { Card, Pill, Row } from "@/components/ui";
import { useTheme, radius } from "@/theme";

export type ClashItem = {
  target_event_id: string;
  target_event_title: string;
  target_club_id: string;
  target_club_name: string;
  starts_at: string;
  ends_at: string;
  signals: {
    member_overlap_count: number;
    member_overlap_percentage: number;
    venue_collision: boolean;
    academic_conflict: boolean;
  };
  severity: "low" | "warning" | "critical";
};

export function ClashDetectorModal({
  clubId,
  initiatorEventId = "",
  startsAt,
  endsAt,
  location,
  visible,
  onClose,
  onProceedAnyway,
}: {
  clubId: string;
  initiatorEventId?: string;
  startsAt: string;
  endsAt: string;
  location?: string;
  visible: boolean;
  onClose: () => void;
  onProceedAnyway?: () => void;
}) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [selectedClash, setSelectedClash] = useState<ClashItem | null>(null);
  const [proposedTime, setProposedTime] = useState("");
  const [negotiationNote, setNegotiationNote] = useState("");

  const { data, isLoading } = useQuery<{
    total_clashes: number;
    has_critical_clash: boolean;
    clashes: ClashItem[];
  }>({
    queryKey: ["club-clashes", clubId, startsAt, endsAt, location],
    queryFn: () =>
      api(`/clubs/${clubId}/clashes?startsAt=${encodeURIComponent(startsAt)}&endsAt=${encodeURIComponent(endsAt)}${location ? `&location=${encodeURIComponent(location)}` : ""}`),
    enabled: visible && Boolean(clubId && startsAt && endsAt),
  });

  const negotiateMutation = useMutation({
    mutationFn: (clash: ClashItem) =>
      api(`/clubs/${clubId}/negotiations`, {
        method: "POST",
        body: JSON.stringify({
          initiatorEventId,
          targetClubId: clash.target_club_id,
          targetEventId: clash.target_event_id,
          proposedNewTime: proposedTime || new Date(new Date(clash.starts_at).getTime() + 86400000).toISOString(),
          note: negotiationNote,
          overlapCount: clash.signals.member_overlap_count,
          overlapPercentage: clash.signals.member_overlap_percentage,
        }),
      }),
    onSuccess: () => {
      Alert.alert("Negotiation Sent", "Reschedule proposal has been delivered to the other club admin.");
      setSelectedClash(null);
      setNegotiationNote("");
      onClose();
    },
    onError: (err: Error) => Alert.alert("Negotiation failed", err.message),
  });

  const clashes = data?.clashes ?? [];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.modalBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Row style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <Row style={{ alignItems: "center", gap: 8 }}>
              <MaterialCommunityIcons name="calendar-alert" size={24} color={colors.warning} />
              <Text style={[styles.modalTitle, { color: colors.text }]}>Schedule Conflict Check</Text>
            </Row>
            <Pressable onPress={onClose}>
              <MaterialCommunityIcons name="close" size={22} color={colors.muted} />
            </Pressable>
          </Row>

          {isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 32 }} />
          ) : clashes.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 24, gap: 12 }}>
              <MaterialCommunityIcons name="check-decagram" size={48} color={colors.success} />
              <Text style={[styles.safeTitle, { color: colors.text }]}>No Schedule Clashes Detected!</Text>
              <Text style={{ color: colors.muted, textAlign: "center", fontSize: 13 }}>
                Your proposed timing is completely clear of conflicts across university clubs and venues.
              </Text>
              {onProceedAnyway && (
                <Pressable
                  onPress={onProceedAnyway}
                  style={[styles.proceedBtn, { backgroundColor: colors.success }]}
                >
                  <Text style={styles.proceedBtnText}>Publish Event</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <View>
              <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 12 }}>
                Found {clashes.length} potential clash(es). Review conflicts or negotiate timing:
              </Text>
              {onProceedAnyway && !data?.has_critical_clash && (
                <Row style={{ justifyContent: "flex-end", marginBottom: 10 }}>
                  <Pressable onPress={onProceedAnyway} style={styles.proceedSmallBtn}>
                    <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12 }}>
                      Acknowledge & Publish Anyway →
                    </Text>
                  </Pressable>
                </Row>
              )}

              {clashes.map((c) => (
                <Card key={c.target_event_id} style={[styles.clashCard, { borderColor: c.severity === "critical" ? colors.danger : colors.border }]}>
                  <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.eventTitle, { color: colors.text }]}>{c.target_event_title}</Text>
                      <Text style={[styles.clubName, { color: colors.primary }]}>{c.target_club_name}</Text>
                      <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>
                        {new Date(c.starts_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                      </Text>
                    </View>
                    <Pill tone={c.severity === "critical" ? "danger" : "warning"}>
                      {c.severity.toUpperCase()}
                    </Pill>
                  </Row>

                  <Row style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    <Pill tone="info">
                      {c.signals.member_overlap_count} shared members ({c.signals.member_overlap_percentage}%)
                    </Pill>
                    {c.signals.venue_collision && <Pill tone="danger">Venue Conflict</Pill>}
                    {c.signals.academic_conflict && <Pill tone="warning">Exam Season</Pill>}
                  </Row>

                  <Pressable
                    onPress={() => setSelectedClash(c)}
                    style={[styles.negotiateBtn, { backgroundColor: colors.primary }]}
                  >
                    <MaterialCommunityIcons name="handshake" size={16} color="#FFFFFF" />
                    <Text style={styles.negotiateBtnText}>Negotiate Alternate Time</Text>
                  </Pressable>
                </Card>
              ))}

              {selectedClash && (
                <Card style={[styles.negotiateForm, { borderColor: colors.primary }]}>
                  <Text style={[styles.formTitle, { color: colors.text }]}>
                    Propose Alternate Time to {selectedClash.target_club_name}
                  </Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
                    placeholder="Proposed Time (e.g. 2026-09-15T14:00:00Z)"
                    placeholderTextColor={colors.muted}
                    value={proposedTime}
                    onChangeText={setProposedTime}
                  />
                  <TextInput
                    style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
                    placeholder="Add a polite note to the other club admin..."
                    placeholderTextColor={colors.muted}
                    value={negotiationNote}
                    onChangeText={setNegotiationNote}
                  />
                  <Row style={{ justifyContent: "flex-end", gap: 10, marginTop: 6 }}>
                    <Pressable onPress={() => setSelectedClash(null)} style={styles.cancelBtn}>
                      <Text style={{ color: colors.muted }}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => negotiateMutation.mutate(selectedClash)}
                      disabled={negotiateMutation.isPending}
                      style={[styles.sendProposalBtn, { backgroundColor: colors.primary }]}
                    >
                      {negotiateMutation.isPending ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={styles.sendProposalText}>Send Proposal</Text>
                      )}
                    </Pressable>
                  </Row>
                </Card>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 16 },
  modalBox: { borderWidth: 1, borderRadius: radius.xl, padding: 18, maxHeight: "85%" },
  modalTitle: { fontSize: 17, fontWeight: "800" },
  safeTitle: { fontSize: 16, fontWeight: "700" },
  clashCard: { borderWidth: 1, padding: 12, marginBottom: 10, borderRadius: radius.md },
  eventTitle: { fontSize: 14, fontWeight: "700" },
  clubName: { fontSize: 12, fontWeight: "600", marginTop: 2 },
  negotiateBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 10, paddingVertical: 7, borderRadius: radius.sm },
  negotiateBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 12 },
  proceedBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: radius.md, marginTop: 12 },
  proceedBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
  proceedSmallBtn: { paddingVertical: 4, paddingHorizontal: 6 },
  negotiateForm: { borderWidth: 1.5, padding: 12, marginTop: 10, borderRadius: radius.md },
  formTitle: { fontSize: 13, fontWeight: "700", marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 7, fontSize: 13, marginBottom: 8 },
  cancelBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  sendProposalBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.sm },
  sendProposalText: { color: "#FFFFFF", fontWeight: "700", fontSize: 12 },
});
