import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import type { Profile } from "@/types";
import { Button, Card, Empty, ErrorState, H1, H2, Muted, Pill, Row, Screen, Skeleton } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import { useSession } from "@/hooks/useSession";

type ResearchDetail = {
  project: {
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
    members?: { id: string; user: Profile; role: string }[];
  };
  calls?: {
    id: string;
    title: string;
    description: string;
    requirements?: string;
    slots_available: number;
    skills_required: string[];
  }[];
  myApplication?: {
    id: string;
    status: string;
  } | null;
};

export default function ResearchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { session } = useSession();
  const qc = useQueryClient();

  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applyNote, setApplyNote] = useState("");

  const projectQuery = useQuery({
    queryKey: ["research-project", id],
    queryFn: () => api<ResearchDetail>(`/research/projects/${id}`),
    enabled: Boolean(id),
  });

  const applyMutation = useMutation({
    mutationFn: () =>
      api(`/research/applications`, {
        method: "POST",
        body: JSON.stringify({
          project_id: id,
          call_id: null,
          statement: applyNote.trim(),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["research-project", id] });
      setShowApplyModal(false);
      setApplyNote("");
      Alert.alert("Application Sent!", "The Principal Investigator will review your collaboration request.");
    },
    onError: (err: any) => {
      Alert.alert("Application Failed", err.message || "Could not submit application.");
    },
  });

  const d = projectQuery.data?.project;

  if (projectQuery.isLoading) {
    return (
      <Screen>
        <Skeleton height={140} />
        <Skeleton height={100} />
        <Skeleton height={120} />
      </Screen>
    );
  }

  if (projectQuery.isError) {
    return (
      <Screen>
        <ErrorState
          detail={(projectQuery.error as Error).message}
          onRetry={() => projectQuery.refetch()}
        />
      </Screen>
    );
  }

  if (!d) {
    return (
      <Screen>
        <Empty title="Project Not Found" detail="This research project could not be found." />
      </Screen>
    );
  }

  const isOwner = session?.user?.id === d.owner_id;

  return (
    <Screen>
      <View style={styles.container}>
        {/* Header */}
        <Row style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <H1 style={styles.title}>{d.title}</H1>
          </View>
        </Row>

        {/* Badges */}
        <Row style={styles.badgeRow}>
          <Pill tone={d.status === "active" ? "primary" : "default"}>
            {d.status.toUpperCase()}
          </Pill>
          {d.looking_for_collaborators && (
            <Pill tone="accent">LOOKING FOR COLLABORATORS</Pill>
          )}
        </Row>

        {/* Lead Investigator */}
        <Pressable onPress={() => router.push(`/user/${d.owner.id}` as any)}>
          <Card style={styles.leadCard}>
            <Row style={{ alignItems: "center", gap: 12 }}>
              <View style={[styles.avatar, { backgroundColor: colors.primary + "18" }]}>
                <MaterialCommunityIcons name="microscope" size={24} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.leadLabel, { color: colors.muted }]}>Lead Investigator</Text>
                <Text style={[styles.leadName, { color: colors.text }]}>{d.owner.full_name}</Text>
                <Muted>@{d.owner.username} · {d.owner.university}</Muted>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={colors.muted} />
            </Row>
          </Card>
        </Pressable>

        {/* Description */}
        <Card style={styles.card}>
          <H2 style={styles.sectionTitle}>Abstract & Overview</H2>
          <Text style={[styles.descText, { color: colors.text }]}>
            {d.description || "No abstract provided."}
          </Text>
        </Card>

        {/* Fields & Methods */}
        <Card style={styles.card}>
          <H2 style={styles.sectionTitle}>Focus Areas & Methodology</H2>
          {d.research_areas?.length > 0 && (
            <View style={{ marginBottom: 8 }}>
              <Muted style={styles.subLabel}>Research Areas</Muted>
              <Row style={{ flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                {d.research_areas.map((area) => (
                  <Pill key={area} tone="primary">#{area}</Pill>
                ))}
              </Row>
            </View>
          )}

          {d.methods?.length > 0 && (
            <View style={{ marginBottom: 8 }}>
              <Muted style={styles.subLabel}>Methods & Approaches</Muted>
              <Row style={{ flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                {d.methods.map((method) => (
                  <Pill key={method} tone="accent">{method}</Pill>
                ))}
              </Row>
            </View>
          )}

          {d.tools?.length > 0 && (
            <View>
              <Muted style={styles.subLabel}>Tools & Frameworks</Muted>
              <Row style={{ flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                {d.tools.map((tool) => (
                  <Pill key={tool}>{tool}</Pill>
                ))}
              </Row>
            </View>
          )}
        </Card>

        {/* Collaboration Requirements & Apply CTA */}
        {d.looking_for_collaborators && !isOwner && (
          <Card tone="glow" style={styles.card}>
            <H2 style={styles.sectionTitle}>Collaboration Openings</H2>
            {d.collaboration_requirements && (
              <Text style={[styles.descText, { color: colors.text, marginBottom: 12 }]}>
                {d.collaboration_requirements}
              </Text>
            )}

            {!showApplyModal ? (
              <Button
                title="Apply to Collaborate 🔬"
                onPress={() => setShowApplyModal(true)}
              />
            ) : (
              <View style={styles.applyForm}>
                <Text style={[styles.subLabel, { color: colors.text }]}>Statement of Interest & Background</Text>
                <TextInput
                  style={[styles.input, styles.textArea, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                  placeholder="Explain your relevant coursework, research background, or skills..."
                  placeholderTextColor={colors.muted}
                  value={applyNote}
                  onChangeText={setApplyNote}
                  multiline
                  numberOfLines={4}
                />
                <Row style={{ gap: 10, marginTop: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      title="Cancel"
                      variant="ghost"
                      onPress={() => setShowApplyModal(false)}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      title={applyMutation.isPending ? "Submitting..." : "Send Application"}
                      onPress={() => applyMutation.mutate()}
                      disabled={applyMutation.isPending || !applyNote.trim()}
                    />
                  </View>
                </Row>
              </View>
            )}
          </Card>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  headerRow: {
    alignItems: "flex-start",
    marginBottom: 8,
  },
  backButton: {
    marginRight: 12,
    marginTop: 4,
    padding: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
  },
  badgeRow: {
    gap: 8,
    marginBottom: 14,
  },
  leadCard: {
    padding: 14,
    borderRadius: radius.lg,
    marginBottom: 14,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  leadLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  leadName: {
    fontSize: 15,
    fontWeight: "700",
  },
  card: {
    padding: 16,
    borderRadius: radius.lg,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 10,
  },
  subLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 4,
  },
  descText: {
    fontSize: 14,
    lineHeight: 22,
  },
  applyForm: {
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
});
