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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/ThemeProvider";
import { ApplicationStatus, ClubRecruitment, ClubRole } from "../types";
import { APPLICATION_STATUS_LABELS } from "../constants";
import api from "../../../services/api";

interface ClubRecruitmentTabProps {
  clubId: string;
  myRole?: ClubRole | null;
  recruitments: ClubRecruitment[];
  isLoading: boolean;
  onRefresh: () => void;
  onOpenAdminKanban?: () => void;
}

export const ClubRecruitmentTab: React.FC<ClubRecruitmentTabProps> = ({
  clubId,
  myRole,
  recruitments,
  isLoading,
  onRefresh,
  onOpenAdminKanban,
}) => {
  const { colors } = useTheme();
  const isLeader =
    myRole &&
    ["owner", "admin", "president", "vice_president", "secretary"].includes(
      myRole
    );

  // Application Modal state
  const [applyingRecruitment, setApplyingRecruitment] =
    useState<ClubRecruitment | null>(null);
  const [selectedPosition, setSelectedPosition] = useState("");
  const [statement, setStatement] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [resumeUrl, setResumeUrl] = useState("");
  const [submittingApp, setSubmittingApp] = useState(false);

  // Create Campaign Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [positionsInput, setPositionsInput] = useState("");
  const [skillsInput, setSkillsInput] = useState("");
  const [deptsInput, setDeptsInput] = useState("");
  const [deadline, setDeadline] = useState("");
  const [creatingCampaign, setCreatingCampaign] = useState(false);

  const handleApply = async () => {
    if (!applyingRecruitment || !selectedPosition) {
      Alert.alert("Position Required", "Please select the position you are applying for.");
      return;
    }
    try {
      setSubmittingApp(true);
      await api.post(
        `/clubs/${clubId}/recruitments/${applyingRecruitment.id}/apply`,
        {
          applied_position: selectedPosition,
          statement: statement.trim() || undefined,
          portfolio_url: portfolioUrl.trim() || undefined,
          resume_url: resumeUrl.trim() || undefined,
        }
      );
      Alert.alert(
        "Application Submitted! 🚀",
        "Your application has been received by the club leadership. You will be notified of stage updates."
      );
      setApplyingRecruitment(null);
      setSelectedPosition("");
      setStatement("");
      setPortfolioUrl("");
      setResumeUrl("");
      onRefresh();
    } catch (err: any) {
      Alert.alert(
        "Submission Failed",
        err?.response?.data?.message || err.message || "Failed to submit application."
      );
    } finally {
      setSubmittingApp(false);
    }
  };

  const handleCreateCampaign = async () => {
    if (!title.trim() || !deadline.trim()) {
      Alert.alert("Required Fields", "Please enter campaign title and deadline.");
      return;
    }
    const open_positions = positionsInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const required_skills = skillsInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const eligible_departments = deptsInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      setCreatingCampaign(true);
      await api.post(`/clubs/${clubId}/recruitments`, {
        title: title.trim(),
        description: description.trim(),
        open_positions: open_positions.length ? open_positions : ["General Member"],
        required_skills,
        eligible_departments,
        deadline: deadline.trim(),
        status: "open",
      });
      Alert.alert("Success", "Recruitment campaign published!");
      setShowCreateModal(false);
      setTitle("");
      setDescription("");
      setPositionsInput("");
      setSkillsInput("");
      setDeptsInput("");
      setDeadline("");
      onRefresh();
    } catch (err: any) {
      Alert.alert(
        "Failed",
        err?.response?.data?.message || "Failed to create campaign."
      );
    } finally {
      setCreatingCampaign(false);
    }
  };

  const getStatusColor = (status: ApplicationStatus) => {
    switch (status) {
      case "applied":
        return "#3b82f6";
      case "shortlisted":
        return "#8b5cf6";
      case "interview":
        return "#f59e0b";
      case "selected":
        return "#10b981";
      case "rejected":
        return "#ef4444";
      default:
        return "#6b7280";
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top action bar */}
      <View style={styles.topBar}>
        <Text style={[styles.heading, { color: colors.text }]}>
          Recruitment & Open Roles
        </Text>
        {isLeader && (
          <View style={styles.leaderActions}>
            {onOpenAdminKanban && (
              <TouchableOpacity
                style={[
                  styles.kanbanBtn,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                ]}
                onPress={onOpenAdminKanban}
              >
                <Ionicons name="git-network-outline" size={16} color={colors.primary} />
                <Text style={[styles.kanbanBtnText, { color: colors.primary }]}>
                  Pipeline
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.createBtn, { backgroundColor: colors.primary }]}
              onPress={() => setShowCreateModal(true)}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.createBtnText}>New Drive</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {isLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.textSecondary, marginTop: 10 }}>
            Checking recruitment opportunities...
          </Text>
        </View>
      ) : recruitments.length === 0 ? (
        <View style={styles.centerBox}>
          <Ionicons name="briefcase-outline" size={48} color={colors.textSecondary} />
          <Text style={[styles.centerTitle, { color: colors.text }]}>
            No Active Recruitment
          </Text>
          <Text style={[styles.centerSub, { color: colors.textSecondary }]}>
            This club is not currently running an open recruitment campaign. Follow the club
            to be notified as soon as new positions open!
          </Text>
          {isLeader && (
            <TouchableOpacity
              style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
              onPress={() => setShowCreateModal(true)}
            >
              <Ionicons name="add-circle-outline" size={18} color="#fff" />
              <Text style={styles.emptyBtnText}>Start Recruitment Campaign</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={recruitments}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 60 }}
          renderItem={({ item }) => {
            const hasApplied = !!item.my_application;
            const appStatus = item.my_application?.status;

            return (
              <View
                style={[
                  styles.campaignCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                {/* Header: Title & Status */}
                <View style={styles.cardHeader}>
                  <Text style={[styles.campaignTitle, { color: colors.text }]}>
                    {item.title}
                  </Text>
                  <View
                    style={[
                      styles.statusPill,
                      {
                        backgroundColor:
                          item.status === "open"
                            ? "rgba(16, 185, 129, 0.12)"
                            : "rgba(239, 68, 68, 0.12)",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        {
                          color:
                            item.status === "open" ? "#10b981" : "#ef4444",
                        },
                      ]}
                    >
                      {item.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                {item.description ? (
                  <Text
                    style={[styles.campaignDesc, { color: colors.textSecondary }]}
                    numberOfLines={3}
                  >
                    {item.description}
                  </Text>
                ) : null}

                {/* Open Positions Pills */}
                {item.open_positions?.length > 0 && (
                  <View style={styles.sectionWrap}>
                    <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
                      OPEN POSITIONS:
                    </Text>
                    <View style={styles.positionsRow}>
                      {item.open_positions.map((pos, idx) => (
                        <View
                          key={idx}
                          style={[
                            styles.positionChip,
                            {
                              backgroundColor: "rgba(59, 130, 246, 0.1)",
                              borderColor: "rgba(59, 130, 246, 0.2)",
                            },
                          ]}
                        >
                          <Ionicons
                            name="sparkles-outline"
                            size={12}
                            color={colors.primary}
                          />
                          <Text
                            style={[
                              styles.positionChipText,
                              { color: colors.primary },
                            ]}
                          >
                            {pos}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Deadline info */}
                <View style={styles.metaRow}>
                  <Ionicons name="alarm-outline" size={16} color={colors.textSecondary} />
                  <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                    Deadline: {new Date(item.deadline).toLocaleDateString()}
                  </Text>
                </View>

                {/* Application Status Banner or Apply CTA */}
                {hasApplied && appStatus ? (
                  <View
                    style={[
                      styles.appliedBanner,
                      {
                        backgroundColor: `${getStatusColor(appStatus)}12`,
                        borderColor: getStatusColor(appStatus),
                      },
                    ]}
                  >
                    <View style={styles.appliedBannerLeft}>
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color={getStatusColor(appStatus)}
                      />
                      <View>
                        <Text
                          style={[
                            styles.appliedStatusTitle,
                            { color: getStatusColor(appStatus) },
                          ]}
                        >
                          Application Status:{" "}
                          {APPLICATION_STATUS_LABELS[appStatus] || appStatus}
                        </Text>
                        <Text
                          style={[
                            styles.appliedPosSub,
                            { color: colors.textSecondary },
                          ]}
                        >
                          Applied for {item.my_application?.applied_position}
                        </Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.applyBtn,
                      {
                        backgroundColor:
                          item.status === "open"
                            ? colors.primary
                            : "rgba(150, 150, 150, 0.2)",
                      },
                    ]}
                    onPress={() => {
                      setApplyingRecruitment(item);
                      if (item.open_positions?.length > 0) {
                        setSelectedPosition(item.open_positions[0]);
                      }
                    }}
                    disabled={item.status !== "open"}
                  >
                    <Ionicons name="paper-plane-outline" size={16} color="#fff" />
                    <Text style={styles.applyBtnText}>
                      {item.status === "open" ? "Apply for Role" : "Recruitment Closed"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
        />
      )}

      {/* Application Form Modal */}
      <Modal
        visible={!!applyingRecruitment}
        animationType="slide"
        transparent
        onRequestClose={() => setApplyingRecruitment(null)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.appModalCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  Club Application
                </Text>
                <Text style={[styles.modalSub, { color: colors.textSecondary }]}>
                  {applyingRecruitment?.title}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setApplyingRecruitment(null)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formScroll}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Select Target Position *
              </Text>
              <View style={styles.posSelectGrid}>
                {applyingRecruitment?.open_positions?.map((pos) => (
                  <TouchableOpacity
                    key={pos}
                    style={[
                      styles.posOption,
                      selectedPosition === pos && {
                        backgroundColor: colors.primary,
                        borderColor: colors.primary,
                      },
                      { borderColor: colors.border },
                    ]}
                    onPress={() => setSelectedPosition(pos)}
                  >
                    <Text
                      style={[
                        styles.posOptionText,
                        {
                          color: selectedPosition === pos ? "#fff" : colors.text,
                        },
                      ]}
                    >
                      {pos}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Statement of Interest / Why this club?
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
                placeholder="What skills can you contribute? Why do you want to join this club's mission?"
                placeholderTextColor={colors.textSecondary}
                value={statement}
                onChangeText={setStatement}
                multiline
                numberOfLines={3}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Portfolio / GitHub / LinkedIn URL
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
                value={portfolioUrl}
                onChangeText={setPortfolioUrl}
                autoCapitalize="none"
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Resume / CV Link (Drive / Cloud URL)
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
                placeholder="https://drive.google.com/..."
                placeholderTextColor={colors.textSecondary}
                value={resumeUrl}
                onChangeText={setResumeUrl}
                autoCapitalize="none"
              />

              <TouchableOpacity
                style={[
                  styles.submitAppBtn,
                  { backgroundColor: colors.primary },
                ]}
                onPress={handleApply}
                disabled={submittingApp}
              >
                {submittingApp ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitAppBtnText}>Submit Application</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Create Campaign Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.appModalCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                New Recruitment Campaign
              </Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formScroll}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Drive Title *
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
                placeholder="e.g. Fall 2026 Executive & Sub-Team Recruitment"
                placeholderTextColor={colors.textSecondary}
                value={title}
                onChangeText={setTitle}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Description
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
                placeholder="Details on the campaign, selection phases, expectations..."
                placeholderTextColor={colors.textSecondary}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Open Positions (comma separated) *
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
                placeholder="Frontend Developer, Robotics Lead, Graphic Designer"
                placeholderTextColor={colors.textSecondary}
                value={positionsInput}
                onChangeText={setPositionsInput}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Required Skills (comma separated)
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
                placeholder="Python, C++, ROS, Figma, Public Speaking"
                placeholderTextColor={colors.textSecondary}
                value={skillsInput}
                onChangeText={setSkillsInput}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Eligible Departments (comma separated, or leave blank for all)
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
                placeholder="CSE, EEE, ME, Civil"
                placeholderTextColor={colors.textSecondary}
                value={deptsInput}
                onChangeText={setDeptsInput}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Deadline (ISO format, e.g. 2026-11-01) *
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
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textSecondary}
                value={deadline}
                onChangeText={setDeadline}
              />

              <TouchableOpacity
                style={[
                  styles.submitAppBtn,
                  { backgroundColor: colors.primary },
                ]}
                onPress={handleCreateCampaign}
                disabled={creatingCampaign}
              >
                {creatingCampaign ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitAppBtnText}>Publish Recruitment</Text>
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
  },
  heading: {
    fontSize: 16,
    fontWeight: "700",
  },
  leaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  kanbanBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 1,
  },
  kanbanBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
  },
  createBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
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
  campaignCard: {
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
    alignItems: "flex-start",
    marginBottom: 8,
    gap: 10,
  },
  campaignTitle: {
    fontSize: 17,
    fontWeight: "700",
    flex: 1,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "800",
  },
  campaignDesc: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  sectionWrap: {
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  positionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  positionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  positionChipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 14,
  },
  metaText: {
    fontSize: 12,
    fontWeight: "500",
  },
  appliedBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  appliedBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  appliedStatusTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  appliedPosSub: {
    fontSize: 12,
    marginTop: 2,
  },
  applyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  applyBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  appModalCard: {
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
    fontSize: 13,
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
  posSelectGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  posOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  posOptionText: {
    fontSize: 12,
    fontWeight: "600",
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
  submitAppBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 14,
  },
  submitAppBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});
