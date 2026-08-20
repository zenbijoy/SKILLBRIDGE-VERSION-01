import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { Alert } from "react-native";
import { api } from "@/lib/api";
import type { Profile } from "@/types";
import {
  Button,
  Card,
  H1,
  H2,
  Muted,
  Pill,
  Row,
  Screen,
} from "@/components/ui";
export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({
    queryKey: ["profile", id],
    queryFn: () =>
      api<{
        profile: Profile;
        skills: { name: string; kind: string; proficiency: number }[];
        mutualCount: number;
        connectionStatus: string;
      }>(`/profiles/${id}`),
    enabled: !!id,
  });
  const connect = useMutation({
    mutationFn: () =>
      api(`/connections/requests`, {
        method: "POST",
        body: JSON.stringify({ recipientId: id }),
      }),
    onSuccess: () => Alert.alert("Sent", "Connection request sent."),
  });
  const qc = useQueryClient();
  const block = useMutation({
    mutationFn: () => api(`/account/blocks`, { method: "POST", body: JSON.stringify({ blocked_id: id }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile", id] });
      qc.invalidateQueries({ queryKey: ["search"] });
      Alert.alert("Blocked", "This user will be hidden from your network.");
    },
  });
  
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState("Spam or scam");
  const [reportDetails] = useState("");
  
  const report = useMutation({
    mutationFn: () => api(`/moderation/report`, { method: "POST", body: JSON.stringify({ target_type: "user", target_id: id, reason: reportReason, details: reportDetails }) }),
    onSuccess: () => {
      setShowReport(false);
      Alert.alert("Reported", "Thank you for helping keep the community safe.");
    }
  });
  
  const d = q.data;
  if (!d)
    return (
      <Screen>
        <Muted>Loading profile…</Muted>
      </Screen>
    );
  return (
    <Screen>
      <Row>
        <Pill tone="accent">{d.profile.reputation} reputation</Pill>
        <Pill>{d.mutualCount} mutual</Pill>
      </Row>
      <H1>{d.profile.full_name}</H1>
      <Muted>
        @{d.profile.username} · {d.profile.university}
      </Muted>
      <Muted>{d.profile.bio}</Muted>
      <Card>
        <H2>Skills & goals</H2>
        <Row>
          {d.skills.map((s) => (
            <Pill
              key={`${s.kind}-${s.name}`}
              tone={s.kind === "known" ? "accent" : "default"}
            >
              {s.name} · {s.proficiency}/5
            </Pill>
          ))}
        </Row>
      </Card>
      
      {showReport ? (
        <Card>
          <H2>Report User</H2>
          <Muted>Choose the closest reason. You can cancel before submitting.</Muted>
          <Button title="Spam or scam" variant={reportReason === "Spam or scam" ? "primary" : "secondary"} onPress={() => setReportReason("Spam or scam")} />
          <Button title="Harassment or bullying" variant={reportReason === "Harassment or bullying" ? "primary" : "secondary"} onPress={() => setReportReason("Harassment or bullying")} />
          <Button title="Unsafe or inappropriate content" variant={reportReason === "Unsafe or inappropriate content" ? "primary" : "secondary"} onPress={() => setReportReason("Unsafe or inappropriate content")} />
          <Button title="Submit Report" variant="danger" onPress={() => report.mutate()} />
          <Button title="Cancel" variant="ghost" onPress={() => setShowReport(false)} />
        </Card>
      ) : (
        <>
          <Button
            title={d.connectionStatus === "none" ? "Connect" : d.connectionStatus}
            disabled={d.connectionStatus !== "none"}
            onPress={() => connect.mutate()}
          />
          <Button
            title="Report"
            variant="secondary"
            onPress={() => setShowReport(true)}
          />
          <Button
            title="Block user"
            variant="danger"
            onPress={() => block.mutate()}
          />
        </>
      )}
    </Screen>
  );
}
