import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/ThemeProvider";
import { ClubProject, ClubProjectTask, ClubRole, ProjectStatus } from "../types";
import { PROJECT_STATUS_LABELS, isClubOfficer } from "../constants";
import { useI18n } from "../../../i18n";
import { clubErrorMessage } from "../lib/apiErrors";
import api from "../../../services/api";

interface ClubProjectsTabProps {
  clubId: string;
  myRole?: ClubRole | null;
  projects: ClubProject[];
  isLoading: boolean;
  onRefresh: () => void;
}

export const ClubProjectsTab: React.FC<ClubProjectsTabProps> = ({
  clubId,
  myRole,
  projects,
  isLoading,
  onRefresh,
}) => {
  const { colors } = useTheme();
  const { t } = useI18n();
  const isLeader = isClubOfficer(myRole);

  const [activeStatus, setActiveStatus] = useState<ProjectStatus | "all">("all");

  // Project Workspace / Tasks Modal
  const [selectedProject, setSelectedProject] = useState<ClubProject | null>(null);
  const [projectTasks, setProjectTasks] = useState<ClubProjectTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPriority] = useState<"low" | "medium" | "high">("medium");
  const [addingTask, setAddingTask] = useState(false);

  // Create Project Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("active");
  const [repoUrl, setRepoUrl] = useState("");
  const [demoUrl, setDemoUrl] = useState("");
  const [creating, setCreating] = useState(false);

  const filteredProjects =
    activeStatus === "all"
      ? projects
      : projects.filter((p) => p.status === activeStatus);

  const fetchTasks = async (projectId: string) => {
    try {
      setLoadingTasks(true);
      const res = await api.get(`/clubs/projects/${projectId}/tasks`);
      setProjectTasks(res.data?.tasks || []);
    } catch (err: unknown) {
      setProjectTasks([]);
      Alert.alert("Error", clubErrorMessage(err, t));
    } finally {
      setLoadingTasks(false);
    }
  };

  const handleOpenWorkspace = (proj: ClubProject) => {
    setSelectedProject(proj);
    fetchTasks(proj.id);
  };

  const handleToggleTaskStatus = async (task: ClubProjectTask) => {
    const nextStatus: Record<string, "todo" | "in_progress" | "completed"> = {
      todo: "in_progress",
      in_progress: "completed",
      completed: "todo",
    };
    const updated = nextStatus[task.status] || "todo";
    try {
      await api.patch(`/clubs/tasks/${task.id}`, { status: updated });
      setProjectTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: updated } : t))
      );
    } catch (err: unknown) {
      Alert.alert("Error", clubErrorMessage(err, t));
    }
  };

  const handleAddTask = async () => {
    if (!selectedProject || !newTaskTitle.trim()) return;
    try {
      setAddingTask(true);
      const res = await api.post(`/clubs/projects/${selectedProject.id}/tasks`, {
        title: newTaskTitle.trim(),
        priority: newTaskPriority,
        status: "todo",
      });
      if (res.data?.task) {
        setProjectTasks((prev) => [res.data.task, ...prev]);
        setNewTaskTitle("");
      }
    } catch (err: unknown) {
      Alert.alert("Error", clubErrorMessage(err, t));
    } finally {
      setAddingTask(false);
    }
  };

  const handleCreateProject = async () => {
    if (!title.trim() || !description.trim()) {
      Alert.alert("Required Fields", "Please enter project title and description.");
      return;
    }
    try {
      setCreating(true);
      await api.post(`/clubs/${clubId}/projects`, {
        title: title.trim(),
        description: description.trim(),
        status,
        repository_url: repoUrl.trim() || undefined,
        demo_url: demoUrl.trim() || undefined,
      });
      Alert.alert("Success", "Project initialized!");
      setShowCreateModal(false);
      setTitle("");
      setDescription("");
      setRepoUrl("");
      setDemoUrl("");
      onRefresh();
    } catch (err: unknown) {
      Alert.alert("Error", clubErrorMessage(err, t));
    } finally {
      setCreating(false);
    }
  };

  const getStatusColor = (st: ProjectStatus) => {
    switch (st) {
      case "active":
        return "#10b981";
      case "planning":
        return "#3b82f6";
      case "idea":
        return "#8b5cf6";
      case "completed":
        return "#6b7280";
      default:
        return "#9ca3af";
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Filter Bar + Create button */}
      <View style={styles.topBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {(["all", "active", "planning", "idea", "completed"] as const).map(
            (st) => {
              const isSelected = activeStatus === st;
              return (
                <TouchableOpacity
                  key={st}
                  style={[
                    styles.statusPill,
                    isSelected && { backgroundColor: colors.primary },
                  ]}
                  onPress={() => setActiveStatus(st)}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      { color: isSelected ? "#fff" : colors.textSecondary },
                    ]}
                  >
                    {st === "all"
                      ? "All Projects"
                      : PROJECT_STATUS_LABELS[st] || st}
                  </Text>
                </TouchableOpacity>
              );
            }
          )}
        </ScrollView>

        {isLeader && (
          <TouchableOpacity
            style={[styles.createBtn, { backgroundColor: colors.primary }]}
            onPress={() => setShowCreateModal(true)}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.createBtnText}>New Project</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Projects List */}
      {isLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.centerSub, { color: colors.textSecondary }]}>
            Loading club projects...
          </Text>
        </View>
      ) : filteredProjects.length === 0 ? (
        <View style={styles.centerBox}>
          <Ionicons name="bulb-outline" size={48} color={colors.textSecondary} />
          <Text style={[styles.centerTitle, { color: colors.text }]}>
            No Projects Found
          </Text>
          <Text style={[styles.centerSub, { color: colors.textSecondary }]}>
            {activeStatus === "all"
              ? "This club has not published any projects yet. Club members can collaborate on open-source, robotics, research, or competition initiatives!"
              : `No projects found in status: ${activeStatus}.`}
          </Text>
          {isLeader && (
            <TouchableOpacity
              style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
              onPress={() => setShowCreateModal(true)}
            >
              <Ionicons name="rocket-outline" size={18} color="#fff" />
              <Text style={styles.emptyBtnText}>Start First Project</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={filteredProjects}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 60 }}
          renderItem={({ item }) => {
            const stColor = getStatusColor(item.status);
            return (
              <View
                style={[
                  styles.projectCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                {/* Header: Team & Status */}
                <View style={styles.cardHeader}>
                  <View style={styles.headerLeft}>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: `${stColor}20` },
                      ]}
                    >
                      <View
                        style={[styles.statusDot, { backgroundColor: stColor }]}
                      />
                      <Text style={[styles.statusBadgeText, { color: stColor }]}>
                        {PROJECT_STATUS_LABELS[item.status] || item.status.toUpperCase()}
                      </Text>
                    </View>

                    {item.team?.name && (
                      <View
                        style={[
                          styles.teamBadge,
                          { backgroundColor: "rgba(150, 150, 150, 0.12)" },
                        ]}
                      >
                        <Ionicons
                          name="people-outline"
                          size={12}
                          color={colors.textSecondary}
                        />
                        <Text
                          style={[
                            styles.teamBadgeText,
                            { color: colors.textSecondary },
                          ]}
                        >
                          {item.team.name}
                        </Text>
                      </View>
                    )}
                  </View>

                  {item.lead?.full_name && (
                    <Text style={[styles.leadName, { color: colors.textSecondary }]}>
                      Lead: {item.lead.full_name}
                    </Text>
                  )}
                </View>

                {/* Title & Description */}
                <Text style={[styles.projectTitle, { color: colors.text }]}>
                  {item.title}
                </Text>
                <Text
                  style={[styles.projectDesc, { color: colors.textSecondary }]}
                  numberOfLines={3}
                >
                  {item.description}
                </Text>

                {/* Links */}
                {(item.repository_url || item.demo_url) && (
                  <View style={styles.linksRow}>
                    {item.repository_url && (
                      <TouchableOpacity
                        style={[
                          styles.linkChip,
                          { borderColor: colors.border, backgroundColor: colors.background },
                        ]}
                        onPress={() =>
                          item.repository_url &&
                          Linking.openURL(item.repository_url)
                        }
                      >
                        <Ionicons name="logo-github" size={14} color={colors.text} />
                        <Text style={[styles.linkChipText, { color: colors.text }]}>
                          Code
                        </Text>
                      </TouchableOpacity>
                    )}
                    {item.demo_url && (
                      <TouchableOpacity
                        style={[
                          styles.linkChip,
                          { borderColor: colors.border, backgroundColor: colors.background },
                        ]}
                        onPress={() =>
                          item.demo_url && Linking.openURL(item.demo_url)
                        }
                      >
                        <Ionicons
                          name="open-outline"
                          size={14}
                          color={colors.primary}
                        />
                        <Text
                          style={[styles.linkChipText, { color: colors.primary }]}
                        >
                          Live Demo
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* Action button */}
                <TouchableOpacity
                  style={[
                    styles.workspaceBtn,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                    },
                  ]}
                  onPress={() => handleOpenWorkspace(item)}
                >
                  <Ionicons
                    name="checkbox-outline"
                    size={16}
                    color={colors.primary}
                  />
                  <Text style={[styles.workspaceBtnText, { color: colors.primary }]}>
                    Workspace & Tasks
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}

      {/* Workspace & Tasks Modal */}
      <Modal
        visible={!!selectedProject}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedProject(null)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.workspaceModalCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.modalTitle, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {selectedProject?.title}
                </Text>
                <Text style={[styles.modalSub, { color: colors.textSecondary }]}>
                  Project Task Board
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedProject(null)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Quick Add Task */}
            <View style={styles.addTaskBar}>
              <TextInput
                style={[
                  styles.taskInput,
                  {
                    borderColor: colors.border,
                    color: colors.text,
                    backgroundColor: colors.background,
                  },
                ]}
                placeholder="New task title..."
                placeholderTextColor={colors.textSecondary}
                value={newTaskTitle}
                onChangeText={setNewTaskTitle}
              />
              <TouchableOpacity
                style={[styles.addTaskBtn, { backgroundColor: colors.primary }]}
                onPress={handleAddTask}
                disabled={addingTask || !newTaskTitle.trim()}
              >
                {addingTask ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="add" size={20} color="#fff" />
                )}
              </TouchableOpacity>
            </View>

            {/* Task List */}
            {loadingTasks ? (
              <View style={styles.centerBox}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : projectTasks.length === 0 ? (
              <View style={styles.centerBox}>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                  No tasks added to this project yet.
                </Text>
              </View>
            ) : (
              <FlatList
                data={projectTasks}
                keyExtractor={(t) => t.id}
                contentContainerStyle={{ paddingBottom: 20 }}
                renderItem={({ item: t }) => {
                  const isDone = t.status === "completed";
                  const inProg = t.status === "in_progress";
                  return (
                    <TouchableOpacity
                      style={[
                        styles.taskRow,
                        {
                          borderColor: colors.border,
                          backgroundColor: colors.background,
                        },
                      ]}
                      onPress={() => handleToggleTaskStatus(t)}
                    >
                      <Ionicons
                        name={
                          isDone
                            ? "checkmark-circle"
                            : inProg
                            ? "time-outline"
                            : "ellipse-outline"
                        }
                        size={20}
                        color={
                          isDone
                            ? "#10b981"
                            : inProg
                            ? "#3b82f6"
                            : colors.textSecondary
                        }
                      />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text
                          style={[
                            styles.taskText,
                            {
                              color: isDone ? colors.textSecondary : colors.text,
                              textDecorationLine: isDone
                                ? "line-through"
                                : "none",
                            },
                          ]}
                        >
                          {t.title}
                        </Text>
                        <Text
                          style={[
                            styles.taskPriority,
                            {
                              color:
                                t.priority === "high"
                                  ? "#ef4444"
                                  : t.priority === "medium"
                                  ? "#f59e0b"
                                  : "#10b981",
                            },
                          ]}
                        >
                          {t.priority.toUpperCase()} PRIORITY
                          {t.assignee?.full_name ? ` · ${t.assignee.full_name}` : ""}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Create Project Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.createModalCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                New Club Project
              </Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formScroll}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Project Title *
              </Text>
              <TextInput
                style={[
                  styles.formInput,
                  {
                    borderColor: colors.border,
                    color: colors.text,
                    backgroundColor: colors.background,
                  },
                ]}
                placeholder="e.g. Autonomous Maze Solving Rover"
                placeholderTextColor={colors.textSecondary}
                value={title}
                onChangeText={setTitle}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Description *
              </Text>
              <TextInput
                style={[
                  styles.formInput,
                  styles.formTextArea,
                  {
                    borderColor: colors.border,
                    color: colors.text,
                    backgroundColor: colors.background,
                  },
                ]}
                placeholder="Goals, target competitions, stack used, milestones..."
                placeholderTextColor={colors.textSecondary}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Initial Status
              </Text>
              <View style={styles.statusSelectRow}>
                {(["idea", "planning", "active"] as const).map((st) => (
                  <TouchableOpacity
                    key={st}
                    style={[
                      styles.statusOption,
                      status === st && {
                        backgroundColor: colors.primary,
                        borderColor: colors.primary,
                      },
                      { borderColor: colors.border },
                    ]}
                    onPress={() => setStatus(st)}
                  >
                    <Text
                      style={[
                        styles.statusOptionText,
                        { color: status === st ? "#fff" : colors.text },
                      ]}
                    >
                      {st.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.inputLabel, { color: colors.text }]}>
                GitHub / Repository URL (optional)
              </Text>
              <TextInput
                style={[
                  styles.formInput,
                  {
                    borderColor: colors.border,
                    color: colors.text,
                    backgroundColor: colors.background,
                  },
                ]}
                placeholder="https://github.com/..."
                placeholderTextColor={colors.textSecondary}
                value={repoUrl}
                onChangeText={setRepoUrl}
                autoCapitalize="none"
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Demo / Live Link (optional)
              </Text>
              <TextInput
                style={[
                  styles.formInput,
                  {
                    borderColor: colors.border,
                    color: colors.text,
                    backgroundColor: colors.background,
                  },
                ]}
                placeholder="https://..."
                placeholderTextColor={colors.textSecondary}
                value={demoUrl}
                onChangeText={setDemoUrl}
                autoCapitalize="none"
              />

              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  { backgroundColor: colors.primary },
                ]}
                onPress={handleCreateProject}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitBtnText}>Create Project</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    gap: 8,
  },
  filterScroll: {
    flexDirection: "row",
    gap: 8,
  },
  statusPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "rgba(150, 150, 150, 0.12)",
  },
  statusPillText: {
    fontSize: 13,
    fontWeight: "600",
  },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  createBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  centerBox: {
    paddingVertical: 48,
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
  },
  centerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  centerSub: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    marginTop: 8,
  },
  emptyBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  projectCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  teamBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  teamBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  leadName: {
    fontSize: 12,
  },
  projectTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 6,
  },
  projectDesc: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  linksRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  linkChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  linkChipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  workspaceBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  workspaceBtnText: {
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  workspaceModalCard: {
    width: "100%",
    maxWidth: 460,
    maxHeight: "80%",
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
  },
  createModalCard: {
    width: "100%",
    maxWidth: 460,
    maxHeight: "85%",
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  modalSub: {
    fontSize: 12,
    marginTop: 2,
  },
  addTaskBar: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  taskInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  addTaskBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  taskText: {
    fontSize: 14,
    fontWeight: "500",
  },
  taskPriority: {
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2,
  },
  formScroll: {
    paddingBottom: 20,
    gap: 8,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 6,
  },
  formInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  formTextArea: {
    height: 70,
    textAlignVertical: "top",
  },
  statusSelectRow: {
    flexDirection: "row",
    gap: 8,
  },
  statusOption: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
  },
  statusOptionText: {
    fontSize: 12,
    fontWeight: "700",
  },
  submitBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 14,
  },
  submitBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});
