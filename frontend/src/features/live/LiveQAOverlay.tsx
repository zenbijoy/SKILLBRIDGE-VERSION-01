import { useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, Alert, ScrollView } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { Row, triggerHaptic } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import type { LiveQAQueuePacket } from "./liveDataPacket";

type QAItem = {
  id: string;
  title: string;
  body?: string;
  is_resolved: boolean;
  upvotes_count: number;
  author?: { full_name?: string };
};

/**
 * Live Q&A queue.
 *
 * Questions are real `room_questions` rows, so anything asked during class is
 * still in the room's Q&A board afterwards (and can earn the accepted-answer
 * XP). The DataChannel only tells the teacher instantly that a new question
 * landed, so the modal pops up mid-lecture without polling latency.
 */
export function LiveQAOverlay({
  roomId,
  publish,
}: {
  roomId: string;
  publish?: (packet: LiveQAQueuePacket) => Promise<void>;
}) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");

  const q = useQuery({
    queryKey: ["room-questions", roomId],
    queryFn: () => api<{ questions: QAItem[] }>(`/rooms/${roomId}/questions`),
    refetchInterval: open ? 4000 : 15000,
    enabled: Boolean(roomId),
  });
  const questions = (q.data?.questions ?? []).filter((x) => !x.is_resolved).slice(0, 6);

  const askM = useMutation({
    mutationFn: () =>
      api(`/rooms/${roomId}/questions`, {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), body: title.trim() }),
      }),
    onSuccess: async (data: any) => {
      setTitle("");
      qc.invalidateQueries({ queryKey: ["room-questions", roomId] });
      if (publish && data?.question) {
        await publish({
          version: 1,
          type: "qa_queue",
          questionId: data.question.id,
          title: data.question.title,
          senderId: data.question.author_id,
          senderName: data.question.author?.full_name ?? "Student",
          action: "ask",
          timestamp: Date.now(),
        }).catch(() => {});
      }
    },
    onError: (e: Error) => Alert.alert("Proshno jay ni", e.message),
  });

  return (
    <>
      <Pressable
        onPress={() => {
          triggerHaptic();
          setOpen(true);
        }}
        style={[s.bar, { backgroundColor: "rgba(8,16,30,0.88)", borderColor: colors.border }]}
      >
        <Row style={{ alignItems: "center", gap: 6, flex: 1 }}>
          <MaterialCommunityIcons name="help-circle-outline" size={15} color={colors.primary} />
          <Text style={[s.barTitle, { color: colors.text }]} numberOfLines={1}>
            {questions.length > 0
              ? `${questions.length} ta proshno pending`
              : "Proshno ache? Ekhane likho"}
          </Text>
        </Row>
        <MaterialCommunityIcons name="chevron-up" size={16} color={colors.muted} />
      </Pressable>

      {open && (
        <View style={[s.sheet, { backgroundColor: "rgba(8,16,30,0.94)", borderColor: colors.border }]}>
          <Row style={{ gap: 8 }}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Prothom line e proshno likho…"
              placeholderTextColor={colors.muted}
              style={[s.input, { borderColor: colors.border, color: colors.text, flex: 1 }]}
            />
            <Pressable
              onPress={() => askM.mutate()}
              disabled={askM.isPending || !title.trim()}
              style={[s.send, { backgroundColor: colors.primary, opacity: title.trim() ? 1 : 0.5 }]}
            >
              <MaterialCommunityIcons name="send" size={16} color="#fff" />
            </Pressable>
          </Row>

          <ScrollView style={{ maxHeight: 140 }} showsVerticalScrollIndicator={false}>
            {questions.length === 0 ? (
              <Text style={[s.empty, { color: colors.muted }]}>
                Ekhono koi proshno kore nai. Teacher-ke jigges koro!
              </Text>
            ) : (
              questions.map((item) => (
                <View key={item.id} style={[s.item, { borderColor: colors.border }]}>
                  <Text style={[s.itemTitle, { color: colors.text }]} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={[s.itemMeta, { color: colors.muted }]}>
                    {item.author?.full_name ?? "Student"} · {item.upvotes_count} vote
                  </Text>
                </View>
              ))
            )}
          </ScrollView>

          <Pressable onPress={() => setOpen(false)} style={s.closeBtn}>
            <Text style={[s.closeTxt, { color: colors.muted }]}>Close</Text>
          </Pressable>
        </View>
      )}
    </>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  barTitle: { fontSize: 12, fontWeight: "800", flexShrink: 1 },
  sheet: {
    marginHorizontal: 8,
    marginTop: 4,
    padding: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 12,
  },
  send: { paddingHorizontal: 12, justifyContent: "center", borderRadius: radius.sm },
  empty: { fontSize: 11, textAlign: "center", paddingVertical: 10 },
  item: { borderWidth: 1, borderRadius: radius.sm, padding: 7, marginBottom: 5 },
  itemTitle: { fontSize: 12, fontWeight: "700" },
  itemMeta: { fontSize: 10, marginTop: 2 },
  closeBtn: { alignItems: "center", paddingVertical: 2 },
  closeTxt: { fontSize: 11, fontWeight: "700" },
});