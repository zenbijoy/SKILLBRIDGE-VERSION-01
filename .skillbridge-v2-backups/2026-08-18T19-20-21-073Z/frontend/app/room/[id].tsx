import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { Alert, StyleSheet, Text } from "react-native";
import { api } from "@/lib/api";
import type { Profile, Room, Session } from "@/types";
import {
  Button,
  Card,
  Field,
  H1,
  H2,
  Muted,
  Pill,
  Row,
  Screen,
} from "@/components/ui";
import { colors } from "@/theme";
import { supabase } from "@/lib/supabase";

type Detail = {
  room: Room;
  members: Profile[];
  teachingRequests: { id: string; volunteer: Profile; status: string }[];
  sessions: Session[];
  resources: { id: string; title: string; url: string }[];
  myMembership?: { role: string; user_id: string } | null;
};

export default function RoomDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["room", id],
    queryFn: () => api<Detail>(`/rooms/${id}`),
    enabled: !!id,
  });
  const join = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("join_room_atomic", { p_room_id: id });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["room", id] }),
    onError: (e) => Alert.alert("Join failed", e.message),
  });
  const leave = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("leave_room_atomic", { p_room_id: id });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["room", id] }),
    onError: (e) => Alert.alert("Leave failed", e.message),
  });
  const [volunteerNote, setVolunteerNote] = useState("");
  const [showVolunteerForm, setShowVolunteerForm] = useState(false);
  const volunteer = useMutation({
    mutationFn: () =>
      api(`/rooms/${id}/teach`, {
        method: "POST",
        body: JSON.stringify({ note: volunteerNote }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["room", id] });
      setShowVolunteerForm(false);
      setVolunteerNote("");
      Alert.alert("Success", "Teaching request sent!");
    },
    onError: (e) => Alert.alert("Failed", e.message),
  });
  const d = q.data;
  if (!d)
    return (
      <Screen>
        <Muted>Loading room…</Muted>
      </Screen>
    );
  return (
    <Screen>
      <Row>
        <Pill tone={d.room.status === "live" ? "danger" : "accent"}>
          {d.room.status}
        </Pill>
        <Pill>{d.room.mode}</Pill>
        <Pill>
          {d.room.member_count}/{d.room.capacity}
        </Pill>
      </Row>
      <H1>{d.room.title}</H1>
      <Muted>{d.room.description}</Muted>
      <Card>
        <H2>{d.room.topic}</H2>
        <Muted>{d.room.tags.join(" · ")}</Muted>
        {d.room.scheduled_at ? (
          <Text style={s.text}>
            {new Date(d.room.scheduled_at).toLocaleString()}
          </Text>
        ) : null}
      </Card>
      {!d.myMembership ? (
        <Button
          title={join.isPending ? "Joining..." : "Join room"}
          onPress={() => join.mutate()}
          disabled={join.isPending}
        />
      ) : (
        <Button
          title={leave.isPending ? "Leaving..." : "Leave room"}
          variant="danger"
          onPress={() => leave.mutate()}
          disabled={leave.isPending}
        />
      )}
      {!d.myMembership ? null : (
        <>
          {!showVolunteerForm ? (
            <Button
              title="Volunteer to teach"
              variant="secondary"
              onPress={() => setShowVolunteerForm(true)}
            />
          ) : (
            <Card>
              <H2>Volunteer to teach</H2>
              <Field 
                placeholder="Why are you a good fit? (Optional note)" 
                value={volunteerNote} 
                onChangeText={setVolunteerNote} 
                multiline 
                numberOfLines={3} 
              />
              <Row>
                <Button title="Submit" onPress={() => volunteer.mutate()} />
                <Button title="Cancel" variant="secondary" onPress={() => setShowVolunteerForm(false)} />
              </Row>
            </Card>
          )}
          {d.room.conversation_id ? (
            <Button
              title="Open room chat"
              variant="secondary"
              onPress={() => router.push(`/chat/${d.room.conversation_id}`)}
            />
          ) : null}
          {d.room.status === "live" ? (
            <Button
              title="Join live classroom"
              onPress={() => router.push(`/live/${id}`)}
            />
          ) : null}
          {["owner", "teacher"].includes(d.myMembership.role) ? (
            <Button
              title="Schedule a session"
              variant="secondary"
              onPress={() => router.push(`/room/${id}/schedule`)}
            />
          ) : null}
        </>
      )}
      <H2>Teaching requests</H2>
      {d.teachingRequests.length === 0 ? <Muted>No pending requests.</Muted> : null}
      {d.teachingRequests.map((t) => (
        <Card key={t.id}>
          <Text style={s.text}>{t.volunteer.full_name}</Text>
          <Muted>Status: {t.status}</Muted>
          {d.myMembership?.role === "owner" && t.status === "pending" ? (
            <Row>
              <Button
                title="Accept"
                variant="secondary"
                onPress={() =>
                  api(`/rooms/${id}/teach/${t.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ status: "accepted" }),
                  }).then(() => qc.invalidateQueries({ queryKey: ["room", id] }))
                }
              />
              <Button
                title="Reject"
                variant="secondary"
                onPress={() =>
                  api(`/rooms/${id}/teach/${t.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ status: "rejected" }),
                  }).then(() => qc.invalidateQueries({ queryKey: ["room", id] }))
                }
              />
            </Row>
          ) : null}
          {d.myMembership && t.volunteer.id === d.myMembership.user_id && t.status === "pending" ? (
             <Button
                title="Cancel request"
                variant="secondary"
                onPress={() =>
                  api(`/rooms/${id}/teach/${t.id}`, {
                    method: "DELETE",
                  }).then(() => qc.invalidateQueries({ queryKey: ["room", id] }))
                }
              />
          ) : null}
        </Card>
      ))}
      <H2>Scheduled sessions</H2>
      {d.sessions.length === 0 ? <Muted>No sessions scheduled.</Muted> : null}
      {d.sessions.map((x) => (
        <Card key={x.id}>
          <Text style={s.text}>{new Date(x.starts_at).toLocaleString()}</Text>
          <Muted>
            {x.mode} · Status: {x.status}
          </Muted>
          {x.status === "completed" && x.teacher_id !== d.myMembership?.user_id && (
            <Button 
              title="Submit Review" 
              variant="secondary" 
              onPress={() => {
                Alert.prompt("Review", "Enter rating (1-5):", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Submit", onPress: (val?: string) => {
                     const rating = parseInt(val || "0");
                     if (rating < 1 || rating > 5) return Alert.alert("Error", "Rating must be between 1 and 5");
                     api(`/sessions/${x.id}/review`, {
                       method: "POST",
                       body: JSON.stringify({ rating, comment: "Reviewed via UI" })
                     }).then(() => {
                       Alert.alert("Success", "Review submitted!");
                       qc.invalidateQueries({ queryKey: ["room", id] });
                       qc.invalidateQueries({ queryKey: ["me"] });
                     }).catch(e => Alert.alert("Error", e.message));
                  }}
                ]);
              }}
            />
          )}
          {["owner", "teacher"].includes(d.myMembership?.role || "") && x.teacher_id === d.myMembership?.user_id && x.status === "scheduled" && (
            <Button
              title="Mark Completed"
              variant="secondary"
              onPress={() => {
                api(`/sessions/${x.id}`, { method: "PATCH", body: JSON.stringify({ status: "completed" }) })
                  .then(() => qc.invalidateQueries({ queryKey: ["room", id] }));
              }}
            />
          )}
        </Card>
      ))}
      <H2>Resources</H2>
      {d.myMembership ? (
        <Button
          title="Upload Resource"
          variant="secondary"
          onPress={() => {
            Alert.prompt("Upload Resource", "Enter URL or text (File upload requires native picker)", [
              { text: "Cancel", style: "cancel" },
              { text: "Submit", onPress: (url?: string) => {
                if (!url) return;
                api("/resources", {
                  method: "POST",
                  body: JSON.stringify({ room_id: id, title: url.slice(0, 20), url, kind: "link" }),
                }).then(() => qc.invalidateQueries({ queryKey: ["room", id] }))
                  .catch(e => Alert.alert("Upload failed", e.message));
              }}
            ]);
          }}
        />
      ) : null}
      {d.resources.length === 0 ? <Muted>No resources available.</Muted> : null}
      {d.resources.map((r) => (
        <Card key={r.id}>
          <Text style={s.text}>{r.title}</Text>
          <Row>
            <Muted style={{ flex: 1 }} numberOfLines={1}>{r.url}</Muted>
            <Button title="Open" onPress={() => api<{url: string}>(`/resources/${r.id}/download`).then(res => Alert.alert("Signed URL", res.url)).catch(() => Alert.alert("Opened", r.url))} variant="secondary" />
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
const s = StyleSheet.create({
  text: { color: colors.text, fontWeight: "700" },
});
