import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import type { Profile, Room, Session } from "@/types";
import { Button, Card, Empty, ErrorState, Field, H1, H2, Muted, Pill, Row, Screen, Skeleton } from "@/components/ui";
import { TextPromptModal } from "@/components/feedback/TextPromptModal";
import { radius, useTheme } from "@/theme";
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
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [volunteerNote, setVolunteerNote] = useState("");
  const [showVolunteerForm, setShowVolunteerForm] = useState(false);
  const [reviewSessionId, setReviewSessionId] = useState<string | null>(null);
  const [ratingValue, setRatingValue] = useState("");
  const [showResourcePrompt, setShowResourcePrompt] = useState(false);
  const [resourceUrl, setResourceUrl] = useState("");
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteUsername, setInviteUsername] = useState("");

  const room = useQuery({
    queryKey: ["room", id],
    queryFn: () => api<Detail>(`/rooms/${id}`),
    enabled: Boolean(id),
  });

  const join = useMutation({
    mutationFn: () => api<{ joined: boolean; role: string }>(`/rooms/${id}/join`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["room", id] });
      qc.invalidateQueries({ queryKey: ["rooms"] });
    },
    onError: (error) => Alert.alert("Join failed", error.message),
  });
  const leave = useMutation({
    mutationFn: () => api<{ left: boolean }>(`/rooms/${id}/leave`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["room", id] });
      qc.invalidateQueries({ queryKey: ["rooms"] });
    },
    onError: (error) => Alert.alert("Leave failed", error.message),
  });
  const volunteer = useMutation({
    mutationFn: () => api(`/rooms/${id}/teach`, { method: "POST", body: JSON.stringify({ note: volunteerNote }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["room", id] });
      setShowVolunteerForm(false);
      setVolunteerNote("");
      Alert.alert("Request sent", "The room owner can now review your teaching request.");
    },
    onError: (error) => Alert.alert("Could not send request", error.message),
  });

  const d = room.data;
  if (room.isLoading) return <Screen><Skeleton height={150} /><Skeleton height={120} /><Skeleton height={120} /></Screen>;
  if (room.isError) return <Screen><ErrorState detail={(room.error as Error).message} onRetry={() => room.refetch()} /></Screen>;
  if (!d) return <Screen><Empty title="Room unavailable" detail="This room may have been removed or you may not have access." /></Screen>;

  async function submitReview() {
    if (!reviewSessionId) return;
    const rating = Number(ratingValue);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      Alert.alert("Invalid rating", "Enter a whole number from 1 to 5.");
      return;
    }
    try {
      await api(`/sessions/${reviewSessionId}/review`, { method: "POST", body: JSON.stringify({ rating, comment: "Reviewed via SkillBridge mobile" }) });
      setReviewSessionId(null);
      setRatingValue("");
      qc.invalidateQueries({ queryKey: ["room", id] });
      qc.invalidateQueries({ queryKey: ["me"] });
      Alert.alert("Review submitted");
    } catch (error: any) {
      Alert.alert("Could not submit review", error.message);
    }
  }

  async function addResource() {
    const url = resourceUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      Alert.alert("Invalid link", "Enter a complete http:// or https:// URL.");
      return;
    }
    try {
      await api("/resources", { method: "POST", body: JSON.stringify({ room_id: id, title: new URL(url).hostname, url, kind: "link" }) });
      setResourceUrl("");
      setShowResourcePrompt(false);
      qc.invalidateQueries({ queryKey: ["room", id] });
    } catch (error: any) {
      Alert.alert("Could not add resource", error.message);
    }
  }

  async function sendInvite() {
    const target = inviteUsername.trim().replace(/^@/, "");
    if (!target) {
      Alert.alert("Missing username", "Enter the username of the peer to invite.");
      return;
    }
    try {
      await api(`/rooms/${id}/invitations`, { method: "POST", body: JSON.stringify({ username: target }) });
      setInviteUsername("");
      setShowInviteModal(false);
      Alert.alert("Invitation Sent", `Invited @${target} to join this room.`);
    } catch (error: any) {
      Alert.alert("Could not send invite", error.message);
    }
  }

  async function openResource(resourceId: string, fallbackUrl: string) {
    try {
      const response = await api<{ url: string }>(`/resources/${resourceId}/download`);
      await Linking.openURL(response.url);
    } catch {
      const supported = await Linking.canOpenURL(fallbackUrl);
      if (supported) await Linking.openURL(fallbackUrl);
      else Alert.alert("Cannot open resource", fallbackUrl);
    }
  }

  return (
    <Screen>
      <Row>
        <Pill tone={d.room.status === "live" ? "danger" : "primary"}>{d.room.status === "live" ? "● LIVE" : d.room.status.toUpperCase()}</Pill>
        <Pill>{d.room.mode}</Pill>
        <Pill>{d.room.member_count}/{d.room.capacity} members</Pill>
      </Row>
      <H1>{d.room.title}</H1>
      <Muted>{d.room.description}</Muted>
      <Card tone="soft">
        <View style={s.infoRow}><MaterialCommunityIcons name="tag-outline" size={19} color={colors.primary} /><Text style={[s.infoText, { color: colors.text }]}>{d.room.topic}</Text></View>
        {d.room.tags.length ? <Row>{d.room.tags.slice(0, 5).map((tag) => <Pill key={tag}>{tag}</Pill>)}</Row> : null}
        {d.room.scheduled_at ? <View style={s.infoRow}><MaterialCommunityIcons name="calendar-clock" size={19} color={colors.primary} /><Muted>{new Date(d.room.scheduled_at).toLocaleString()}</Muted></View> : null}
      </Card>

      {!d.myMembership ? <Button title={join.isPending ? "Joining…" : "Join room"} onPress={() => join.mutate()} disabled={join.isPending} /> : <Button title={leave.isPending ? "Leaving…" : "Leave room"} variant="secondary" onPress={() => leave.mutate()} disabled={leave.isPending} />}

      {d.myMembership ? (
        <Card>
          <H2>Room actions</H2>
          <View style={s.actionGrid}>
            {d.room.conversation_id ? <Action icon="message-text-outline" label="Room chat" onPress={() => router.push(`/chat/${d.room.conversation_id}` as any)} /> : null}
            {d.room.status === "live" ? <Action icon="video-outline" label="Live class" onPress={() => router.push(`/live/${id}` as any)} /> : null}
            {["owner", "teacher", "moderator"].includes(d.myMembership.role) ? <Action icon="account-plus-outline" label="Invite peer" onPress={() => setShowInviteModal(true)} /> : null}
            {["owner", "teacher"].includes(d.myMembership.role) ? <Action icon="calendar-plus" label="Schedule" onPress={() => router.push(`/room/${id}/schedule` as any)} /> : null}
            <Action icon="book-plus-outline" label="Resource" onPress={() => setShowResourcePrompt(true)} />
          </View>
        </Card>
      ) : null}

      {d.myMembership ? (
        <>
          {!showVolunteerForm ? <Button title="Volunteer to teach" variant="secondary" onPress={() => setShowVolunteerForm(true)} /> : (
            <Card tone="primary">
              <H2>Volunteer to teach</H2>
              <Muted>Explain briefly why you're a good fit for this topic.</Muted>
              <Field placeholder="Optional note" value={volunteerNote} onChangeText={setVolunteerNote} multiline numberOfLines={3} />
              <Row><Button title="Cancel" variant="ghost" onPress={() => setShowVolunteerForm(false)} /><Button title={volunteer.isPending ? "Sending…" : "Submit"} disabled={volunteer.isPending} onPress={() => volunteer.mutate()} /></Row>
            </Card>
          )}
        </>
      ) : null}

      <H2>Room members ({d.members.length})</H2>
      {d.members.length === 0 ? <Muted>No members listed.</Muted> : (
        <View style={{ gap: 8, marginVertical: 8 }}>
          {d.members.map((member) => (
            <Pressable key={member.id} onPress={() => router.push(`/user/${member.id}` as any)}>
              <Card tone="soft" style={{ padding: 12 }}>
                <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <View style={{ gap: 2 }}>
                    <Text style={[s.infoText, { color: colors.text }]}>{member.full_name || `@${member.username}`}</Text>
                    <Muted>@{member.username} · {member.reputation || 0} rep</Muted>
                  </View>
                  <Pill tone={member.id === d.room.owner_id ? "primary" : "default"}>
                    {member.id === d.room.owner_id ? "OWNER" : "MEMBER"}
                  </Pill>
                </Row>
              </Card>
            </Pressable>
          ))}
        </View>
      )}

      <H2>Teaching requests</H2>
      {d.teachingRequests.length === 0 ? <Muted>No pending teaching requests.</Muted> : d.teachingRequests.map((request) => (
        <Card key={request.id}>
          <Text style={[s.infoText, { color: colors.text }]}>{request.volunteer.full_name}</Text>
          <Muted>Status: {request.status}</Muted>
          {d.myMembership?.role === "owner" && request.status === "pending" ? (
            <Row>
              <Button title="Accept" compact onPress={() => api(`/rooms/${id}/teach/${request.id}`, { method: "PATCH", body: JSON.stringify({ status: "accepted" }) }).then(() => qc.invalidateQueries({ queryKey: ["room", id] })).catch((error) => Alert.alert("Could not update", error.message))} />
              <Button title="Reject" compact variant="secondary" onPress={() => api(`/rooms/${id}/teach/${request.id}`, { method: "PATCH", body: JSON.stringify({ status: "rejected" }) }).then(() => qc.invalidateQueries({ queryKey: ["room", id] })).catch((error) => Alert.alert("Could not update", error.message))} />
            </Row>
          ) : null}
          {d.myMembership && request.volunteer.id === d.myMembership.user_id && request.status === "pending" ? <Button title="Cancel request" compact variant="secondary" onPress={() => api(`/rooms/${id}/teach/${request.id}`, { method: "DELETE" }).then(() => qc.invalidateQueries({ queryKey: ["room", id] })).catch((error) => Alert.alert("Could not cancel", error.message))} /> : null}
        </Card>
      ))}

      <H2>Scheduled sessions</H2>
      {d.sessions.length === 0 ? <Muted>No sessions scheduled.</Muted> : d.sessions.map((session) => {
        const isTeacher = session.teacher_id === d.myMembership?.user_id;
        const isHost = ["owner", "teacher"].includes(d.myMembership?.role ?? "");
        return (
          <Card key={session.id} tone={session.status === "live" ? "glow" : "default"}>
            <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
              <Text style={[s.infoText, { color: colors.text, fontWeight: "800" }]}>{new Date(session.starts_at).toLocaleString()}</Text>
              <Pill tone={session.status === "live" ? "danger" : session.status === "scheduled" ? "primary" : "default"}>
                {session.status === "live" ? "● LIVE NOW" : session.status.toUpperCase()}
              </Pill>
            </Row>
            <Muted>{session.mode.toUpperCase()} session · Status: {session.status}</Muted>

            <Row style={{ gap: 8, marginTop: 8 }}>
              {session.status === "scheduled" && (isTeacher || isHost) ? (
                <Button
                  title="Start Live Class 🔴"
                  compact
                  variant="primary"
                  onPress={() =>
                    api(`/sessions/${session.id}`, { method: "PATCH", body: JSON.stringify({ status: "live" }) })
                      .then(() => {
                        qc.invalidateQueries({ queryKey: ["room", id] });
                        router.push(`/live/${session.id}` as any);
                      })
                      .catch((err) => Alert.alert("Error starting class", err.message))
                  }
                />
              ) : null}

              {session.status === "live" ? (
                <>
                  <Button
                    title="Join Live Class 🔴"
                    compact
                    variant="primary"
                    onPress={() => router.push(`/live/${session.id}` as any)}
                  />
                  {(isTeacher || isHost) ? (
                    <Button
                      title="End Session 🏁"
                      compact
                      variant="secondary"
                      onPress={() =>
                        api(`/sessions/${session.id}`, { method: "PATCH", body: JSON.stringify({ status: "completed" }) })
                          .then(() => qc.invalidateQueries({ queryKey: ["room", id] }))
                          .catch((err) => Alert.alert("Error ending class", err.message))
                      }
                    />
                  ) : null}
                </>
              ) : null}

              {session.status === "completed" && !isTeacher ? (
                <Button
                  title="Review session ⭐"
                  compact
                  variant="secondary"
                  onPress={() => { setReviewSessionId(session.id); setRatingValue(""); }}
                />
              ) : null}
            </Row>
          </Card>
        );
      })}

      <H2>Resources</H2>
      {d.resources.length === 0 ? <Muted>No resources available.</Muted> : d.resources.map((resource) => (
        <Pressable key={resource.id} onPress={() => void openResource(resource.id, resource.url)}>
          <Card>
            <View style={s.resourceRow}>
              <View style={[s.resourceIcon, { backgroundColor: colors.primarySoft }]}><MaterialCommunityIcons name="link-variant" size={21} color={colors.primary} /></View>
              <View style={{ flex: 1, gap: 3 }}><Text style={[s.infoText, { color: colors.text }]}>{resource.title}</Text><Muted numberOfLines={1}>{resource.url}</Muted></View>
              <MaterialCommunityIcons name="open-in-new" size={19} color={colors.muted} />
            </View>
          </Card>
        </Pressable>
      ))}

      <TextPromptModal visible={Boolean(reviewSessionId)} title="Rate this session" detail="Enter a whole number from 1 to 5." value={ratingValue} onChangeText={setRatingValue} keyboardType="number-pad" placeholder="1–5" submitLabel="Submit review" onCancel={() => { setReviewSessionId(null); setRatingValue(""); }} onSubmit={() => void submitReview()} />
      <TextPromptModal visible={showResourcePrompt} title="Add a resource link" detail="File picking can be added later without blocking Android users. For now, add a safe web resource URL." value={resourceUrl} onChangeText={setResourceUrl} keyboardType="url" placeholder="https://..." submitLabel="Add resource" onCancel={() => { setShowResourcePrompt(false); setResourceUrl(""); }} onSubmit={() => void addResource()} />
      <TextPromptModal visible={showInviteModal} title="Invite Peer to Room" detail="Enter username of the peer you wish to invite." value={inviteUsername} onChangeText={setInviteUsername} placeholder="e.g. johndoe" submitLabel="Send Invitation" onCancel={() => { setShowInviteModal(false); setInviteUsername(""); }} onSubmit={() => void sendInvite()} />
    </Screen>
  );
}

function Action({ icon, label, onPress }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.action, { backgroundColor: colors.surface2, opacity: pressed ? 0.75 : 1 }]}>
      <MaterialCommunityIcons name={icon} size={22} color={colors.primary} />
      <Text style={{ color: colors.text, fontSize: 12, fontWeight: "800" }}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  infoRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  infoText: { fontWeight: "800", fontSize: 15 },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  action: { width: "47%", minHeight: 70, borderRadius: radius.md, padding: 12, alignItems: "center", justifyContent: "center", gap: 6 },
  resourceRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  resourceIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
