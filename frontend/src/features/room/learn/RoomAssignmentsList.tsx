import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Image,
  Alert,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { Card, Pill, Row, triggerHaptic } from "@/components/ui";
import { useTheme, radius } from "@/theme";
import { nextGenAnimationsV2 } from "@/assets/nextgen";
import { getSocket } from "@/lib/socket";
import type { RoomAssignment } from "@/types";
import { CreateAssignmentModal } from "./CreateAssignmentModal";
import { SubmitAssignmentModal } from "./SubmitAssignmentModal";
import { TeacherGradingModal } from "./TeacherGradingModal";
import { AssignmentDetailModal } from "./AssignmentDetailModal";

interface RoomAssignmentsListProps {
  roomId: string;
  isLeader: boolean; // teacher, moderator, or room owner
  isMember: boolean;
}

type AssignmentFilter = "all" | "active" | "completed";

export function RoomAssignmentsList({
  roomId,
  isLeader,
  isMember,
}: RoomAssignmentsListProps) {
  const { colors } = useTheme();
  const qc = useQueryClient();

  const [filter, setFilter] = useState<AssignmentFilter>("all");
  const [search, setSearch] = useState("");

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [gradingModalOpen, setGradingModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<RoomAssignment | null>(null);

  // 1. Fetch Room Assignments Query
  const assignmentsQuery = useQuery<RoomAssignment[]>({
    queryKey: ["room-assignments", roomId],
    queryFn: async () => {
      const res = await api<{ assignments: RoomAssignment[] }>(
        `/rooms/${roomId}/assignments`
      );
      return res.assignments ?? [];
    },
    enabled: Boolean(roomId),
  });

  // 2. Real-time socket events
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !roomId) return;

    const onUpdate = () => {
      qc.invalidateQueries({ queryKey: ["room-assignments", roomId] });
    };

    socket.on("room:assignment:created", onUpdate);
    socket.on("room:assignment:updated", onUpdate);
    socket.on("room:assignment:deleted", onUpdate);
    socket.on("room:assignment:submitted", onUpdate);
    socket.on("room:assignment:graded", onUpdate);

    return () => {
      socket.off("room:assignment:created", onUpdate);
      socket.off("room:assignment:updated", onUpdate);
      socket.off("room:assignment:deleted", onUpdate);
      socket.off("room:assignment:submitted", onUpdate);
      socket.off("room:assignment:graded", onUpdate);
    };
  }, [roomId, qc]);

  // Delete assignment mutation
  const deleteMutation = useMutation({
    mutationFn: (assignmentId: string) =>
      api(`/rooms/${roomId}/assignments/${assignmentId}`, { method: "DELETE" }),
    onSuccess: () => {
      triggerHaptic("notificationSuccess");
      qc.invalidateQueries({ queryKey: ["room-assignments", roomId] });
    },
    onError: (err: any) => Alert.alert("Could not delete", err.message),
  });

  const handleDelete = (item: RoomAssignment) => {
    Alert.alert(
      "Delete Assignment?",
      `Are you sure you want to delete "${item.title}"? All submitted student solutions will also be deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMutation.mutate(item.id),
        },
      ]
    );
  };

  const allAssignments = assignmentsQuery.data ?? [];

  // Filter & Search logic
  const filtered = allAssignments.filter((item) => {
    const isPastDue = new Date() > new Date(item.due_date);
    const isGraded = item.mySubmission?.status === "graded";

    if (filter === "active") {
      if (item.status === "closed" || (isPastDue && isGraded)) return false;
    }
    if (filter === "completed") {
      if (item.status !== "closed" && !isGraded && !isPastDue) return false;
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchDesc = item.description?.toLowerCase().includes(q);
      return matchTitle || matchDesc;
    }

    return true;
  });

  const getDueTimeText = (dueDateStr: string) => {
    const now = new Date();
    const due = new Date(dueDateStr);
    const diffMs = due.getTime() - now.getTime();

    if (diffMs < 0) {
      return { text: "Past Due", isUrgent: true };
    }

    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 24) {
      return { text: `Due in ${diffHours}h`, isUrgent: true };
    }

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) {
      return { text: "Due Tomorrow", isUrgent: true };
    }
    return { text: `Due in ${diffDays} days`, isUrgent: false };
  };

  return (
    <View style={s.container}>
      {/* 1. Header Row */}
      <Row style={s.headerRow}>
        <View style={{ flex: 1 }}>
          <Row style={{ alignItems: "center", gap: 8 }}>
            <Text style={[s.sectionTitle, { color: colors.text }]}>Homework & Assignments</Text>
            <Pill tone="accent">R2 Vault</Pill>
          </Row>
          <Text style={[s.sectionSubtitle, { color: colors.muted }]}>
            Submit PDF solutions & receive teacher grades
          </Text>
        </View>

        {isLeader && (
          <Pressable
            onPress={() => {
              triggerHaptic("selection");
              setCreateModalOpen(true);
            }}
            style={[s.createBtn, { backgroundColor: colors.primary }]}
          >
            <MaterialCommunityIcons name="plus" size={17} color="#FFFFFF" />
            <Text style={s.createBtnText}>New Task</Text>
          </Pressable>
        )}
      </Row>

      {/* 2. Search & Segment Filters */}
      <View style={s.controlsRow}>
        <View style={[s.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MaterialCommunityIcons name="magnify" size={17} color={colors.muted} />
          <TextInput
            style={[s.searchInput, { color: colors.text }]}
            placeholder="Search assignments..."
            placeholderTextColor={colors.muted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <MaterialCommunityIcons name="close-circle" size={16} color={colors.muted} />
            </Pressable>
          )}
        </View>

        {/* Filter Pills */}
        <Row style={{ gap: 8, marginTop: 8 }}>
          {[
            { key: "all", label: `All (${allAssignments.length})` },
            { key: "active", label: "Active & Due" },
            { key: "completed", label: "Past & Graded" },
          ].map((tab) => {
            const isSelected = filter === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => {
                  triggerHaptic("selection");
                  setFilter(tab.key as AssignmentFilter);
                }}
                style={[
                  s.filterPill,
                  {
                    borderColor: isSelected ? colors.primary : colors.border,
                    backgroundColor: isSelected ? colors.primary : colors.surface,
                  },
                ]}
              >
                <Text
                  style={[
                    s.filterPillText,
                    { color: isSelected ? "#FFFFFF" : colors.text, fontWeight: isSelected ? "700" : "500" },
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </Row>
      </View>

      {/* 3. Assignment Cards List */}
      {assignmentsQuery.isLoading && allAssignments.length === 0 ? (
        <Card style={s.emptyCard}>
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={{ marginTop: 8, fontSize: 13, color: colors.muted }}>Loading assignments...</Text>
        </Card>
      ) : filtered.length === 0 ? (
        <Card style={s.emptyCard}>
          <Image
            source={nextGenAnimationsV2.bookmarkSaved}
            style={{ width: 60, height: 60, marginBottom: 8 }}
            resizeMode="contain"
          />
          <Text style={[s.emptyTitle, { color: colors.text }]}>
            {search ? "No matching assignments" : "No assignments posted yet"}
          </Text>
          <Text style={[s.emptySub, { color: colors.muted }]}>
            {isLeader
              ? "Publish a homework assignment with due date and rubrics for your students."
              : "Assignments given by teachers will appear here with submission buttons."}
          </Text>
        </Card>
      ) : (
        filtered.map((item) => {
          const dueMeta = getDueTimeText(item.due_date);
          const mySub = item.mySubmission;
          const isGraded = mySub?.status === "graded";
          const isSubmitted = Boolean(mySub);

          return (
            <Card key={item.id} style={s.assignmentCard}>
              <Row style={{ alignItems: "flex-start", justifyContent: "space-between" }}>
                <Row style={{ alignItems: "flex-start", gap: 12, flex: 1 }}>
                  {/* Category icon */}
                  <View style={[s.iconCircle, { backgroundColor: `${colors.primary}15` }]}>
                    <MaterialCommunityIcons name="clipboard-text-outline" size={24} color={colors.primary} />
                  </View>

                  {/* Details */}
                  <View style={{ flex: 1 }}>
                    <Text style={[s.cardTitle, { color: colors.text }]} numberOfLines={2}>
                      {item.title}
                    </Text>

                    {/* Metadata line: Points & Due Date */}
                    <Row style={{ alignItems: "center", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
                      <Text style={[s.pointText, { color: colors.primary }]}>
                        {item.total_points} Pts
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.muted }}>•</Text>
                      <Row style={{ alignItems: "center", gap: 3 }}>
                        <MaterialCommunityIcons
                          name="clock-outline"
                          size={13}
                          color={dueMeta.isUrgent ? "#EF4444" : colors.muted}
                        />
                        <Text style={[s.dueText, { color: dueMeta.isUrgent ? "#EF4444" : colors.muted }]}>
                          {dueMeta.text}
                        </Text>
                      </Row>
                      {Boolean(item.attachment_url) && (
                        <>
                          <Text style={{ fontSize: 11, color: colors.muted }}>•</Text>
                          <Row style={{ alignItems: "center", gap: 3 }}>
                            <MaterialCommunityIcons name="paperclip" size={13} color={colors.muted} />
                            <Text style={{ fontSize: 11, color: colors.muted }}>Attachment</Text>
                          </Row>
                        </>
                      )}
                    </Row>

                    {/* Status Pill for Student */}
                    {!isLeader && (
                      <View style={{ marginTop: 8 }}>
                        {isGraded ? (
                          <View style={[s.statusPill, { backgroundColor: "#10B98120" }]}>
                            <MaterialCommunityIcons name="check-decagram" size={13} color="#10B981" />
                            <Text style={{ color: "#10B981", fontSize: 11, fontWeight: "700" }}>
                              Graded: {mySub?.grade} / {item.total_points}
                            </Text>
                          </View>
                        ) : isSubmitted ? (
                          <View style={[s.statusPill, { backgroundColor: `${colors.primary}20` }]}>
                            <MaterialCommunityIcons name="check-circle" size={13} color={colors.primary} />
                            <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700" }}>
                              Submitted (Pending Grade)
                            </Text>
                          </View>
                        ) : (
                          <View style={[s.statusPill, { backgroundColor: "#F59E0B20" }]}>
                            <MaterialCommunityIcons name="alert-circle-outline" size={13} color="#F59E0B" />
                            <Text style={{ color: "#F59E0B", fontSize: 11, fontWeight: "700" }}>
                              Pending Submission
                            </Text>
                          </View>
                        )}
                      </View>
                    )}

                    {/* Teacher stats */}
                    {isLeader && (
                      <Row style={{ alignItems: "center", gap: 10, marginTop: 8 }}>
                        <Text style={[s.teacherStats, { color: colors.muted }]}>
                          👥 {item.submissionsCount ?? 0} Submissions
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.muted }}>•</Text>
                        <Text style={[s.teacherStats, { color: colors.muted }]}>
                          ✅ {item.gradedCount ?? 0} Graded
                        </Text>
                      </Row>
                    )}
                  </View>
                </Row>

                {/* Card Actions */}
                <Row style={{ alignItems: "center", gap: 6, marginLeft: 8 }}>
                  {isLeader ? (
                    <>
                      <Pressable
                        onPress={() => handleDelete(item)}
                        style={[s.iconBtn, { borderColor: colors.border }]}
                      >
                        <MaterialCommunityIcons name="trash-can-outline" size={16} color={colors.danger} />
                      </Pressable>

                      <Pressable
                        onPress={() => {
                          triggerHaptic("selection");
                          setSelectedAssignment(item);
                          setGradingModalOpen(true);
                        }}
                        style={[s.actionBtn, { backgroundColor: colors.primary }]}
                      >
                        <MaterialCommunityIcons name="check-all" size={15} color="#FFFFFF" />
                        <Text style={s.actionBtnText}>Grade</Text>
                      </Pressable>
                    </>
                  ) : (
                    <>
                      {isSubmitted ? (
                        <Pressable
                          onPress={() => {
                            triggerHaptic("selection");
                            setSelectedAssignment(item);
                            setDetailModalOpen(true);
                          }}
                          style={[s.actionBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
                        >
                          <Text style={[s.actionBtnText, { color: colors.text }]}>Details</Text>
                        </Pressable>
                      ) : (
                        <Pressable
                          onPress={() => {
                            triggerHaptic("selection");
                            setSelectedAssignment(item);
                            setSubmitModalOpen(true);
                          }}
                          style={[s.actionBtn, { backgroundColor: colors.primary }]}
                        >
                          <MaterialCommunityIcons name="upload" size={14} color="#FFFFFF" />
                          <Text style={s.actionBtnText}>Submit</Text>
                        </Pressable>
                      )}
                    </>
                  )}
                </Row>
              </Row>
            </Card>
          );
        })
      )}

      {/* 4. MODALS */}
      <CreateAssignmentModal
        visible={createModalOpen}
        roomId={roomId}
        onClose={() => setCreateModalOpen(false)}
      />

      <SubmitAssignmentModal
        visible={submitModalOpen}
        roomId={roomId}
        assignment={selectedAssignment}
        onClose={() => setSubmitModalOpen(false)}
      />

      <TeacherGradingModal
        visible={gradingModalOpen}
        roomId={roomId}
        assignment={selectedAssignment}
        onClose={() => setGradingModalOpen(false)}
      />

      <AssignmentDetailModal
        visible={detailModalOpen}
        assignment={selectedAssignment}
        onClose={() => setDetailModalOpen(false)}
        onOpenSubmit={() => setSubmitModalOpen(true)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    marginTop: 8,
    marginBottom: 20,
  },
  headerRow: {
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  sectionSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.md,
  },
  createBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 12,
  },
  controlsRow: {
    marginBottom: 12,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    height: 38,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
  },
  filterPill: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  filterPillText: {
    fontSize: 11,
  },
  emptyCard: {
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginTop: 8,
  },
  emptySub: {
    fontSize: 12,
    marginTop: 4,
    textAlign: "center",
  },
  assignmentCard: {
    padding: 13,
    marginBottom: 10,
    borderRadius: radius.md,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  pointText: {
    fontSize: 12,
    fontWeight: "700",
  },
  dueText: {
    fontSize: 11,
    fontWeight: "600",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  teacherStats: {
    fontSize: 11,
    fontWeight: "600",
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.md,
  },
  actionBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
});
