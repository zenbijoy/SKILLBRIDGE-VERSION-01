import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api, qs } from "@/lib/api";
import type { Profile } from "@/types";
import { Button, Card, Empty, ErrorState, Field, H1, H2, Muted, Pill, Row, Screen, Skeleton, triggerHaptic } from "@/components/ui";
import { ProfileCard } from "@/components/ProfileCard";
import { radius, spacing, useTheme } from "@/theme";
import { useSession } from "@/hooks/useSession";
import { spotIllustrations } from "@/assets/illustrations";

type ResearchProject = {
  id: string;
  title: string;
  description?: string;
  owner: Profile;
  owner_id: string;
  status: string;
  research_areas: string[];
  methods: string[];
  tools: string[];
  looking_for_collaborators: boolean;
  collaboration_requirements?: string;
  created_at: string;
};

const RESEARCH_DISCIPLINES = [
  "All",
  "AI / Machine Learning",
  "Biomedical & Healthcare",
  "Cybersecurity & Networks",
  "Robotics & IoT",
  "Data Science & Analytics",
  "Algorithms & Theory",
  "Renewable Energy & Climate",
  "Economics & Social Sciences",
];

export default function ResearchHub() {
  const { colors } = useTheme();
  const { session } = useSession();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<"projects" | "calls" | "people" | "desk">("projects");
  const [selectedDiscipline, setSelectedDiscipline] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  // Create Project Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newAreas, setNewAreas] = useState<string[]>(["AI / Machine Learning"]);
  const [newMethods, setNewMethods] = useState("");
  const [lookingForCollabs, setLookingForCollabs] = useState(true);
  const [collabRequirements, setCollabRequirements] = useState("");

  // Collaboration Request Modal
  const [selectedProjectForCollab, setSelectedProjectForCollab] = useState<ResearchProject | null>(null);
  const [collabMessage, setCollabMessage] = useState("");

  // Stats Query
  const statsQuery = useQuery({
    queryKey: ["research-stats"],
    queryFn: () => api<{ totalProjects: number; openCalls: number; completedProjects: number }>("/research/stats"),
  });

  // Projects Query
  const projectsQuery = useQuery({
    queryKey: ["research-projects", selectedDiscipline, searchQuery, activeTab],
    queryFn: () => {
      const areaParam = selectedDiscipline === "All" ? "" : selectedDiscipline;
      const openParam = activeTab === "calls" ? "true" : "false";
      return api<{ data: ResearchProject[] }>(
        `/research/projects?${qs({ area: areaParam, q: searchQuery, openOnly: openParam })}`
      );
    },
    enabled: activeTab === "projects" || activeTab === "calls",
  });

  // People Query
  const peopleQuery = useQuery({
    queryKey: ["research-people", searchQuery],
    queryFn: () =>
      api<{ people: Profile[]; topics: string[] }>(`/recommendations/research?${qs({ interest: searchQuery })}`),
    enabled: activeTab === "people",
  });

  // Requests Desk Query
  const requestsQuery = useQuery({
    queryKey: ["research-requests"],
    queryFn: () => api<{ data: any[] }>("/research/collaboration-requests"),
    enabled: activeTab === "desk",
  });

  // Mutations
  const createProject = useMutation({
    mutationFn: () =>
      api("/research/projects", {
        method: "POST",
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDesc.trim(),
          research_areas: newAreas,
          methods: newMethods.split(",").map((s) => s.trim()).filter(Boolean),
          looking_for_collaborators: lookingForCollabs,
          collaboration_requirements: collabRequirements.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["research-projects"] });
      qc.invalidateQueries({ queryKey: ["research-stats"] });
      setShowCreateModal(false);
      setNewTitle("");
      setNewDesc("");
      setCollabRequirements("");
      Alert.alert("Project Published! 🔬", "Your research project is now indexed in the Campus Research Hub.");
    },
    onError: (e: any) => Alert.alert("Error", e.message),
  });

  const sendCollabRequest = useMutation({
    mutationFn: () =>
      api(`/research/projects/${selectedProjectForCollab?.id}/collaborate`, {
        method: "POST",
        body: JSON.stringify({ message: collabMessage.trim() || "I would like to collaborate on this research project." }),
      }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["research-requests"] });
      setSelectedProjectForCollab(null);
      setCollabMessage("");
      Alert.alert("Proposal Sent! 🚀", "The lead researcher will review your collaboration request.");
    },
    onError: (e: any) => Alert.alert("Could not send request", e.message),
  });

  const updateRequestStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "accepted" | "rejected" | "cancelled" }) =>
      api(`/research/collaboration-requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["research-requests"] });
    },
  });

  const deleteProject = useMutation({
    mutationFn: (id: string) => api(`/research/projects/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      triggerHaptic();
      qc.invalidateQueries({ queryKey: ["research-projects"] });
      qc.invalidateQueries({ queryKey: ["research-stats"] });
    },
  });

  const toggleArea = (area: string) => {
    triggerHaptic();
    setNewAreas((prev) => (prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]));
  };

  const stats = statsQuery.data;

  return (
    <Screen>
      {/* Header Banner */}
      <View style={s.headerBanner}>
        <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <H1>Research & Innovation Hub 🔬</H1>
            <Muted>Collaborate with campus scholars, publish preprints, and join funded research projects.</Muted>
          </View>
          <Button
            title="+ New Project"
            compact
            icon="plus"
            onPress={() => {
              triggerHaptic();
              setShowCreateModal(true);
            }}
          />
        </Row>

        {/* Live Metrics Stat Strip */}
        <View style={[s.statStrip, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
          <View style={s.statItem}>
            <Text style={[s.statVal, { color: colors.primary }]}>{stats?.totalProjects ?? 0}</Text>
            <Text style={[s.statLabel, { color: colors.muted }]}>Active Projects</Text>
          </View>
          <View style={[s.statDivider, { backgroundColor: colors.border }]} />
          <View style={s.statItem}>
            <Text style={[s.statVal, { color: colors.accent }]}>{stats?.openCalls ?? 0}</Text>
            <Text style={[s.statLabel, { color: colors.muted }]}>Open Co-Author Calls</Text>
          </View>
          <View style={[s.statDivider, { backgroundColor: colors.border }]} />
          <View style={s.statItem}>
            <Text style={[s.statVal, { color: colors.primary2 }]}>{stats?.completedProjects ?? 0}</Text>
            <Text style={[s.statLabel, { color: colors.muted }]}>Completed Papers</Text>
          </View>
        </View>
      </View>

      {/* Main Tabs */}
      <View style={s.tabBar}>
        {[
          { key: "projects", label: "📚 All Projects", icon: "book-open-outline" },
          { key: "calls", label: "🤝 Co-Author Calls", icon: "account-group-outline" },
          { key: "people", label: "👥 Scholars", icon: "account-search-outline" },
          { key: "desk", label: "📬 Collab Desk", icon: "inbox-outline" },
        ].map((t) => {
          const active = activeTab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => {
                triggerHaptic();
                setActiveTab(t.key as any);
              }}
              style={[
                s.tabBtn,
                {
                  backgroundColor: active ? colors.primary : colors.surface2,
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={{
                  color: active ? colors.white : colors.text,
                  fontWeight: "800",
                  fontSize: 12,
                }}
              >
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Search & Discipline Filter (Visible on Projects and Calls tabs) */}
      {(activeTab === "projects" || activeTab === "calls") && (
        <View style={{ gap: 10, marginVertical: 6 }}>
          <Field
            placeholder="Search projects, topics, methods..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.disciplineScroll}>
            {RESEARCH_DISCIPLINES.map((d) => {
              const selected = selectedDiscipline === d;
              return (
                <Pressable
                  key={d}
                  onPress={() => {
                    triggerHaptic();
                    setSelectedDiscipline(d);
                  }}
                  style={[
                    s.disciplinePill,
                    {
                      backgroundColor: selected ? colors.primary : colors.surface2,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: selected ? colors.white : colors.text,
                      fontWeight: selected ? "800" : "600",
                      fontSize: 12,
                    }}
                  >
                    {d}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* 1. Projects & Calls Tab */}
      {(activeTab === "projects" || activeTab === "calls") && (
        <View style={{ gap: 12 }}>
          {projectsQuery.isLoading ? (
            <>
              <Skeleton height={140} />
              <Skeleton height={140} />
            </>
          ) : null}

          {projectsQuery.isError ? (
            <ErrorState detail={(projectsQuery.error as Error).message} onRetry={() => projectsQuery.refetch()} />
          ) : null}

          {projectsQuery.data?.data?.map((p, idx) => {
            const isMyProject = p.owner_id === session?.user.id || p.owner?.id === session?.user.id;
            return (
              <Animated.View key={p.id} entering={FadeInUp.delay(idx * 70).springify()}>
                <Card tone={p.looking_for_collaborators ? "glow" : "soft"}>
                {/* Author Info & Status Tag */}
                <Row style={{ alignItems: "center", justifyContent: "space-between" }}>
                  <Row style={{ alignItems: "center", flex: 1 }}>
                    {p.owner?.avatar_url ? (
                      <Image source={{ uri: p.owner.avatar_url }} style={s.authorAvatar} />
                    ) : (
                      <View style={[s.authorAvatar, { backgroundColor: colors.primarySoft }]}>
                        <Text style={{ color: colors.primary, fontWeight: "800" }}>
                          {p.owner?.full_name?.[0] || "U"}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[s.authorName, { color: colors.text }]} numberOfLines={1}>
                        {p.owner?.full_name || "Lead Researcher"}
                      </Text>
                      <Muted style={{ fontSize: 11 }}>
                        {p.owner?.university ? `${p.owner.university} · ` : ""}
                        {p.owner?.department || "Academic Scholar"}
                      </Muted>
                    </View>
                  </Row>

                  <Pill tone={p.status === "completed" ? "success" : "primary"}>
                    {p.status.toUpperCase()}
                  </Pill>
                </Row>

                {/* Project Title & Abstract */}
                <Text style={[s.projectTitle, { color: colors.text }]}>{p.title}</Text>
                {p.description ? <Muted numberOfLines={3}>{p.description}</Muted> : null}

                {/* Research Discipline Tags */}
                {p.research_areas?.length ? (
                  <Row style={{ marginTop: 4 }}>
                    {p.research_areas.map((area) => (
                      <Pill key={area} tone="accent">
                        {area}
                      </Pill>
                    ))}
                  </Row>
                ) : null}

                {/* Looking for Collaborators Alert Box */}
                {p.looking_for_collaborators && (
                  <View style={[s.collabBox, { backgroundColor: colors.surface2, borderColor: colors.primary }]}>
                    <Row style={{ alignItems: "center" }}>
                      <MaterialCommunityIcons name="bullhorn-outline" size={18} color={colors.primary} />
                      <Text style={[s.collabTitle, { color: colors.primary }]}>RECRUITING CO-AUTHORS / TEAM</Text>
                    </Row>
                    {p.collaboration_requirements ? (
                      <Muted style={{ fontSize: 12 }}>{p.collaboration_requirements}</Muted>
                    ) : null}
                  </View>
                )}

                {/* Action Buttons */}
                <Row style={{ justifyContent: "flex-end", marginTop: 8, alignItems: "center" }}>
                  {isMyProject ? (
                    <Button
                      title="Delete"
                      variant="ghost"
                      compact
                      onPress={() => {
                        Alert.alert("Delete project", "Are you sure you want to remove this research project?", [
                          { text: "Cancel", style: "cancel" },
                          { text: "Delete", style: "destructive", onPress: () => deleteProject.mutate(p.id) },
                        ]);
                      }}
                    />
                  ) : (
                    <Button
                      title="🤝 Request Collaboration"
                      compact
                      variant="primary"
                      onPress={() => {
                        triggerHaptic();
                        setSelectedProjectForCollab(p);
                      }}
                    />
                  )}
                </Row>
              </Card>
            </Animated.View>
            );
          })}

          {projectsQuery.data?.data?.length === 0 && !projectsQuery.isLoading ? (
            <Empty
              illustration={spotIllustrations.researchInnovation}
              title="No research projects found"
              detail="Be the first scholar to publish a project or paper in this research discipline!"
            />
          ) : null}
        </View>
      )}

      {/* 2. Scholars / People Tab */}
      {activeTab === "people" && (
        <View style={{ gap: 12 }}>
          <Field placeholder="Filter scholars by topic, skills..." value={searchQuery} onChangeText={setSearchQuery} />
          {peopleQuery.isLoading ? <Skeleton height={140} /> : null}
          {peopleQuery.data?.topics?.length ? (
            <Row>
              {peopleQuery.data.topics.map((t) => (
                <Pill key={t} tone="accent">
                  {t}
                </Pill>
              ))}
            </Row>
          ) : null}
          {peopleQuery.data?.people?.map((p, idx) => (
            <Animated.View key={p.id} entering={FadeInUp.delay(idx * 60).springify()}>
              <ProfileCard profile={p} />
            </Animated.View>
          ))}
          {peopleQuery.data?.people?.length === 0 && !peopleQuery.isLoading ? (
            <Empty title="No scholars found" detail="Try searching with a broader topic name or department." />
          ) : null}
        </View>
      )}

      {/* 3. Collaboration Desk Tab */}
      {activeTab === "desk" && (
        <View style={{ gap: 12 }}>
          {requestsQuery.isLoading ? (
            <>
              <Skeleton height={100} />
              <Skeleton height={100} />
            </>
          ) : null}

          {requestsQuery.data?.data?.map((req, idx) => {
            const isOwner = req.project?.owner_id === session?.user.id;
            return (
              <Animated.View key={req.id} entering={FadeInUp.delay(idx * 60).springify()}>
                <Card>
                  <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={[s.projectTitle, { color: colors.text, fontSize: 15 }]}>
                    {req.project?.title || "Research Project"}
                  </Text>
                  <Pill
                    tone={
                      req.status === "accepted"
                        ? "success"
                        : req.status === "rejected"
                        ? "danger"
                        : "accent"
                    }
                  >
                    {req.status.toUpperCase()}
                  </Pill>
                </Row>

                <Muted>
                  Requester: <Text style={{ color: colors.text, fontWeight: "700" }}>{req.requester?.full_name}</Text> (@{req.requester?.username})
                </Muted>
                {req.message ? <Text style={{ color: colors.text, marginTop: 4 }}>"{req.message}"</Text> : null}

                {req.status === "pending" && isOwner && (
                  <Row style={{ marginTop: 8 }}>
                    <Button
                      title="Accept Request"
                      compact
                      onPress={() => updateRequestStatus.mutate({ id: req.id, status: "accepted" })}
                    />
                    <Button
                      title="Decline"
                      compact
                      variant="secondary"
                      onPress={() => updateRequestStatus.mutate({ id: req.id, status: "rejected" })}
                    />
                  </Row>
                )}

                {req.status === "pending" && !isOwner && (
                  <Button
                    title="Cancel Request"
                    compact
                    variant="ghost"
                    onPress={() => updateRequestStatus.mutate({ id: req.id, status: "cancelled" })}
                  />
                )}
              </Card>
            </Animated.View>
            );
          })}

          {requestsQuery.data?.data?.length === 0 && !requestsQuery.isLoading ? (
            <Empty
              title="No collaboration requests"
              detail="Incoming and outgoing research collaboration proposals will appear here."
            />
          ) : null}
        </View>
      )}

      {/* Publish New Project Modal */}
      <Modal visible={showCreateModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
              <H2>Publish Research Project 📑</H2>
              <Pressable onPress={() => setShowCreateModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color={colors.muted} />
              </Pressable>
            </Row>

            <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
              <View style={{ gap: 10, paddingVertical: 8 }}>
                <Field placeholder="Project / Paper Title *" value={newTitle} onChangeText={setNewTitle} />
                <Field
                  placeholder="Abstract / Objective description..."
                  value={newDesc}
                  onChangeText={setNewDesc}
                  multiline
                  numberOfLines={4}
                />

                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13, marginTop: 4 }}>
                  Research Areas (Select all that apply):
                </Text>
                <Row style={{ flexWrap: "wrap" }}>
                  {RESEARCH_DISCIPLINES.filter((d) => d !== "All").map((area) => {
                    const selected = newAreas.includes(area);
                    return (
                      <Pill
                        key={area}
                        tone={selected ? "primary" : "default"}
                        onPress={() => toggleArea(area)}
                      >
                        {selected ? `✓ ${area}` : `+ ${area}`}
                      </Pill>
                    );
                  })}
                </Row>

                <Field
                  placeholder="Methodologies (e.g. PyTorch, LaTeX, Survey)"
                  value={newMethods}
                  onChangeText={setNewMethods}
                />

                <Pressable
                  onPress={() => {
                    triggerHaptic();
                    setLookingForCollabs(!lookingForCollabs);
                  }}
                  style={[
                    s.collabToggle,
                    {
                      backgroundColor: colors.surface2,
                      borderColor: lookingForCollabs ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={lookingForCollabs ? "checkbox-marked" : "checkbox-blank-outline"}
                    size={22}
                    color={lookingForCollabs ? colors.primary : colors.muted}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: "800", fontSize: 13 }}>
                      Looking for Co-Authors / Research Assistants
                    </Text>
                    <Muted style={{ fontSize: 11 }}>Display open call tag on project card</Muted>
                  </View>
                </Pressable>

                {lookingForCollabs && (
                  <Field
                    placeholder="Specific collaborator requirements (e.g. 3rd year CS, knowledge of NLP)..."
                    value={collabRequirements}
                    onChangeText={setCollabRequirements}
                    multiline
                    numberOfLines={3}
                  />
                )}
              </View>
            </ScrollView>

            <Row style={{ justifyContent: "flex-end", marginTop: 12 }}>
              <Button title="Cancel" variant="ghost" onPress={() => setShowCreateModal(false)} />
              <Button
                title={createProject.isPending ? "Publishing…" : "Publish Project 🚀"}
                disabled={createProject.isPending || !newTitle.trim()}
                loading={createProject.isPending}
                onPress={() => createProject.mutate()}
              />
            </Row>
          </View>
        </View>
      </Modal>

      {/* Collaboration Request Modal */}
      <Modal visible={Boolean(selectedProjectForCollab)} animationType="fade" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <H2>Request Collaboration 🤝</H2>
            <Muted numberOfLines={2}>
              Project: <Text style={{ color: colors.text, fontWeight: "700" }}>{selectedProjectForCollab?.title}</Text>
            </Muted>

            <Field
              placeholder="Introduce your skills, background, and how you'd like to contribute..."
              value={collabMessage}
              onChangeText={setCollabMessage}
              multiline
              numberOfLines={4}
            />

            <Row style={{ justifyContent: "flex-end", marginTop: 12 }}>
              <Button
                title="Cancel"
                variant="ghost"
                onPress={() => {
                  setSelectedProjectForCollab(null);
                  setCollabMessage("");
                }}
              />
              <Button
                title={sendCollabRequest.isPending ? "Sending…" : "Send Proposal 🚀"}
                disabled={sendCollabRequest.isPending}
                loading={sendCollabRequest.isPending}
                onPress={() => sendCollabRequest.mutate()}
              />
            </Row>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const s = StyleSheet.create({
  headerBanner: { gap: 12, marginBottom: 8 },
  statStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  statItem: { alignItems: "center", flex: 1 },
  statVal: { fontSize: 20, fontWeight: "900" },
  statLabel: { fontSize: 11, fontWeight: "700" },
  statDivider: { width: 1, height: 28 },
  tabBar: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginVertical: 4 },
  tabBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1 },
  disciplineScroll: { gap: 6, paddingVertical: 2 },
  disciplinePill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1 },
  authorAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  authorName: { fontWeight: "800", fontSize: 14 },
  projectTitle: { fontSize: 17, fontWeight: "800", marginTop: 6 },
  collabBox: { padding: 10, borderRadius: 10, borderWidth: 1, gap: 4, marginTop: 6 },
  collabTitle: { fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: spacing.md,
  },
  modalContent: {
    borderRadius: radius.lg,
    padding: 18,
    borderWidth: 1,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  collabToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: 4,
  },
});
