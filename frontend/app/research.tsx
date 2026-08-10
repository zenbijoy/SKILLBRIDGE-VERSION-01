import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import type { Profile } from "@/types";
import { Button, Card, Field, H1, H2, Muted, Pill, Row, Screen } from "@/components/ui";
import { ProfileCard } from "@/components/ProfileCard";
import { Alert, Text, View } from "react-native";
import { colors } from "@/theme";

type ResearchProject = {
  id: string;
  title: string;
  description: string;
  owner: Profile;
  status: string;
  research_areas: string[];
  looking_for_collaborators: boolean;
};

export default function Research() {
  const [tab, setTab] = useState<"projects" | "people" | "my-requests">("projects");
  const [interest, setInterest] = useState("");
  const qc = useQueryClient();

  const qPeople = useQuery({
    queryKey: ["research-people", interest],
    queryFn: () =>
      api<{ people: Profile[]; topics: string[] }>(`/recommendations/research?${qs({ interest })}`),
    enabled: tab === "people",
  });

  const qProjects = useQuery({
    queryKey: ["research-projects"],
    queryFn: () => api<{ data: ResearchProject[] }>("/research/projects"),
    enabled: tab === "projects",
  });

  const qRequests = useQuery({
    queryKey: ["research-requests"],
    queryFn: () => api<{ data: any[] }>("/research/collaboration-requests"),
    enabled: tab === "my-requests",
  });
  
  const [newTitle, setNewTitle] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const createProject = useMutation({
    mutationFn: () => api("/research/projects", { method: "POST", body: JSON.stringify({ title: newTitle, research_areas: [interest] }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["research-projects"] });
      setNewTitle("");
      setShowCreate(false);
    },
  });

  return (
    <Screen>
      <H1>Research Hub</H1>
      <Row>
        <Button title="Projects" variant={tab === "projects" ? "primary" : "secondary"} onPress={() => setTab("projects")} />
        <Button title="People" variant={tab === "people" ? "primary" : "secondary"} onPress={() => setTab("people")} />
        <Button title="Requests" variant={tab === "my-requests" ? "primary" : "secondary"} onPress={() => setTab("my-requests")} />
      </Row>

      {tab === "projects" && (
        <View style={{ gap: 16, marginTop: 16 }}>
          {showCreate ? (
            <Card>
              <H2>New Project</H2>
              <Field placeholder="Project title" value={newTitle} onChangeText={setNewTitle} />
              <Row>
                <Button title="Create" onPress={() => createProject.mutate()} />
                <Button title="Cancel" variant="secondary" onPress={() => setShowCreate(false)} />
              </Row>
            </Card>
          ) : (
            <Button title="Create New Project" onPress={() => setShowCreate(true)} />
          )}

          {qProjects.data?.data?.map((p) => (
            <Card key={p.id}>
              <H2>{p.title}</H2>
              <Muted>{p.owner.full_name} · {p.status}</Muted>
              <Text style={{ color: colors.text }}>{p.description}</Text>
              <Button title="Request Collaboration" variant="secondary" onPress={() => api(`/research/projects/${p.id}/collaborate`, { method: "POST", body: JSON.stringify({}) }).then(() => Alert.alert("Requested!")).catch(e => Alert.alert("Error", e.message))} />
            </Card>
          ))}
        </View>
      )}

      {tab === "people" && (
        <View style={{ gap: 16, marginTop: 16 }}>
          <Field value={interest} onChangeText={setInterest} placeholder="Filter by interest..." />
          <Row>{qPeople.data?.topics.map((t) => <Pill key={t} tone="accent">{t}</Pill>)}</Row>
          {qPeople.data?.people.map((p) => <ProfileCard key={p.id} profile={p} />)}
        </View>
      )}
      
      {tab === "my-requests" && (
        <View style={{ gap: 16, marginTop: 16 }}>
          {qRequests.data?.data?.map(req => (
            <Card key={req.id}>
              <Text style={{ color: colors.text }}>Project: {req.project?.title}</Text>
              <Muted>Requester: {req.requester?.full_name}</Muted>
              <Muted>Status: {req.status}</Muted>
              {req.status === "pending" && (
                 <Row>
                   <Button title="Accept" onPress={() => api(`/research/collaboration-requests/${req.id}`, { method: "PATCH", body: JSON.stringify({ status: "accepted" }) }).then(() => qc.invalidateQueries({ queryKey: ["research-requests"] }))} />
                   <Button title="Reject" variant="secondary" onPress={() => api(`/research/collaboration-requests/${req.id}`, { method: "PATCH", body: JSON.stringify({ status: "rejected" }) }).then(() => qc.invalidateQueries({ queryKey: ["research-requests"] }))} />
                 </Row>
              )}
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
