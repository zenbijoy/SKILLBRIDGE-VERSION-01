import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/ThemeProvider";
import {
  ClubDetail,
  ClubAnalytics,
  ClubApplication,
  ApplicationStatus,
  ClubMembershipType,
} from "../types";
import { APPLICATION_STATUS_LABELS } from "../constants";
import { useI18n } from "../../../i18n";
import { clubErrorMessage } from "../lib/apiErrors";
import api from "../../../services/api";

interface ClubAdminModalProps {
  visible: boolean;
  club: ClubDetail;
  onClose: () => void;
  onRefreshClub: () => void;
}

interface ClubTeam {
  id: string;
  club_id: string;
  name: string;
  description?: string | null;
  team_lead_id?: string | null;
  created_at: string;
}

type AdminTab = "analytics" | "applications" | "teams" | "settings";

export const ClubAdminModal: React.FC<ClubAdminModalProps> = ({
  visible,
  club,
  onClose,
  onRefreshClub,
}) => {
  const { colors } = useTheme();
  const { t } = useI18n();

  const [activeTab, setActiveTab] = useState<AdminTab>("analytics");

  // Analytics State
  const [analytics, setAnalytics] = useState<ClubAnalytics | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  // Applications Kanban State
  const [applications, setApplications] = useState<ClubApplication[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [stageFilter, setStageFilter] = useState<ApplicationStatus | "all">(
    "all"
  );
  const [updatingAppId, setUpdatingAppId] = useState<string | null>(null);

  // Teams State
  const [teams, setTeams] = useState<ClubTeam[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDesc, setNewTeamDesc] = useState("");
  const [creatingTeam, setCreatingTeam] = useState(false);

  // Settings State
  const [tagline, setTagline] = useState(club.tagline || "");
  const [description, setDescription] = useState(club.description || "");
  const [mission, setMission] = useState(club.mission || "");
  const [vision, setVision] = useState(club.vision || "");
  const [contactEmail, setContactEmail] = useState(club.contact_email || "");
  const [contactPhone, setContactPhone] = useState(club.contact_phone || "");
  const [membershipType, setMembershipType] = useState<ClubMembershipType>(
    club.membership_type || "open"
  );
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    if (visible) {
      fetchAnalytics();
      fetchApplications();
      fetchTeams();
      // Sync settings fields
      setTagline(club.tagline || "");
      setDescription(club.description || "");
      setMission(club.mission || "");
      setVision(club.vision || "");
      setContactEmail(club.contact_email || "");
      setContactPhone(club.contact_phone || "");
      setMembershipType(club.membership_type || "open");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- init/sync effect keyed on club id; deps fields would reset user edits
  }, [visible, club.id]);

  const fetchAnalytics = async () => {
    try {
      setLoadingAnalytics(true);
      const res = await api.get(`/clubs/${club.id}/analytics`);
      setAnalytics(res.data?.analytics || null);
    } catch (_err: unknown) {
      setAnalytics(null);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const fetchApplications = async () => {
    try {
      setLoadingApps(true);
      const res = await api.get(`/clubs/${club.id}/applications`);
      setApplications(res.data?.applications || []);
    } catch (_err: unknown) {
      setApplications([]);
    } finally {
      setLoadingApps(false);
    }
  };

  const fetchTeams = async () => {
    try {
      setLoadingTeams(true);
      const res = await api.get<{ teams: ClubTeam[] }>(`/clubs/${club.id}/teams`);
      setTeams(res.data?.teams || []);
    } catch (_err: unknown) {
      setTeams([]);
    } finally {
      setLoadingTeams(false);
    }
  };

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) {
      Alert.alert("Team Name Required", "Please enter a team name.");
      return;
    }
    try {
      setCreatingTeam(true);
      await api.post(`/clubs/${club.id}/teams`, {
        name: newTeamName.trim(),
        description: newTeamDesc.trim() || undefined,
      });
      Alert.alert("Success", "Club sub-team created successfully!");
      setNewTeamName("");
      setNewTeamDesc("");
      fetchTeams();
    } catch (err: unknown) {
      Alert.alert("Error", clubErrorMessage(err, t));
    } finally {
      setCreatingTeam(false);
    }
  };

  const handleUpdateAppStatus = async (
    appId: string,
    newStatus: ApplicationStatus
  ) => {
    try {
      setUpdatingAppId(appId);
      await api.patch(`/clubs/applications/${appId}`, {
        status: newStatus,
      });
      setApplications((prev) =>
        prev.map((a) => (a.id === appId ? { ...a, status: newStatus } : a))
      );
      Alert.alert(
        "Candidate Updated",
        `Application moved to ${APPLICATION_STATUS_LABELS[newStatus] || newStatus}. Candidate has been notified.`
      );
    } catch (err: unknown) {
      Alert.alert(
        "Error",
        clubErrorMessage(err, t)
      );
    } finally {
      setUpdatingAppId(null);
    }
  };

  const handleSaveSettings = async () => {
    try {
      setSavingSettings(true);
      await api.patch(`/clubs/${club.id}/settings`, {
        tagline: tagline.trim() || undefined,
        description: description.trim() || undefined,
        mission: mission.trim() || undefined,
        vision: vision.trim() || undefined,
        contact_email: contactEmail.trim() || undefined,
        contact_phone: contactPhone.trim() || undefined,
        membership_type: membershipType,
      });
      Alert.alert("Success", "Club settings updated.");
      onRefreshClub();
    } catch (err: unknown) {
      Alert.alert(
        "Save Failed",
        clubErrorMessage(err, t)
      );
    } finally {
      setSavingSettings(false);
    }
  };

  const handleArchiveClub = () => {
    Alert.alert(
      "Archive Club",
      "Archiving will disable new memberships and event creation. Existing data will remain preserved. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Archive Club",
          style: "destructive",
          onPress: async () => {
            try {
              await api.post(`/clubs/${club.id}/archive`);
              Alert.alert("Archived", "This club has been archived.");
              onRefreshClub();
              onClose();
            } catch (err: unknown) {
              Alert.alert(
                "Error",
                clubErrorMessage(err, t)
              );
            }
          },
        },
      ]
    );
  };

  const filteredApps =
    stageFilter === "all"
      ? applications
      : applications.filter((a) => a.status === stageFilter);

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
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View
          style={[
            styles.modalCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Ionicons name="settings-sharp" size={20} color={colors.primary} />
              <View>
                <Text style={[styles.title, { color: colors.text }]}>
                  Club Management
                </Text>
                <Text style={[styles.sub, { color: colors.textSecondary }]}>
                  {club.name}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Segmented Tab Bar */}
          <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
            <TouchableOpacity
              style={[
                styles.tabItem,
                activeTab === "analytics" && {
                  borderBottomColor: colors.primary,
                },
              ]}
              onPress={() => setActiveTab("analytics")}
            >
              <Ionicons
                name="bar-chart-outline"
                size={16}
                color={
                  activeTab === "analytics" ? colors.primary : colors.textSecondary
                }
              />
              <Text
                style={[
                  styles.tabItemText,
                  {
                    color:
                      activeTab === "analytics"
                        ? colors.primary
                        : colors.textSecondary,
                  },
                ]}
              >
                Analytics
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.tabItem,
                activeTab === "applications" && {
                  borderBottomColor: colors.primary,
                },
              ]}
              onPress={() => setActiveTab("applications")}
            >
              <Ionicons
                name="git-network-outline"
                size={16}
                color={
                  activeTab === "applications"
                    ? colors.primary
                    : colors.textSecondary
                }
              />
              <Text
                style={[
                  styles.tabItemText,
                  {
                    color:
                      activeTab === "applications"
                        ? colors.primary
                        : colors.textSecondary,
                  },
                ]}
              >
                Recruitment ({applications.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.tabItem,
                activeTab === "teams" && {
                  borderBottomColor: colors.primary,
                },
              ]}
              onPress={() => setActiveTab("teams")}
            >
              <Ionicons
                name="people-circle-outline"
                size={16}
                color={
                  activeTab === "teams"
                    ? colors.primary
                    : colors.textSecondary
                }
              />
              <Text
                style={[
                  styles.tabItemText,
                  {
                    color:
                      activeTab === "teams"
                        ? colors.primary
                        : colors.textSecondary,
                  },
                ]}
              >
                Teams ({teams.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.tabItem,
                activeTab === "settings" && {
                  borderBottomColor: colors.primary,
                },
              ]}
              onPress={() => setActiveTab("settings")}
            >
              <Ionicons
                name="options-outline"
                size={16}
                color={
                  activeTab === "settings"
                    ? colors.primary
                    : colors.textSecondary
                }
              />
              <Text
                style={[
                  styles.tabItemText,
                  {
                    color:
                      activeTab === "settings"
                        ? colors.primary
                        : colors.textSecondary,
                  },
                ]}
              >
                Settings
              </Text>
            </TouchableOpacity>
          </View>

          {/* Tab 1: Analytics & Health */}
          {activeTab === "analytics" && (
            <ScrollView contentContainerStyle={styles.tabContent}>
              {loadingAnalytics ? (
                <View style={styles.centerBox}>
                  <ActivityIndicator size="large" color={colors.primary} />
                </View>
              ) : (
                <View style={styles.metricsGrid}>
                  <View
                    style={[
                      styles.metricCard,
                      {
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Ionicons name="people" size={22} color={colors.primary} />
                    <Text style={[styles.metricVal, { color: colors.text }]}>
                      {analytics?.memberCount ?? club.member_count ?? 0}
                    </Text>
                    <Text
                      style={[styles.metricLabel, { color: colors.textSecondary }]}
                    >
                      Active Members
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.metricCard,
                      {
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Ionicons name="heart" size={22} color="#ec4899" />
                    <Text style={[styles.metricVal, { color: colors.text }]}>
                      {analytics?.followerCount ?? club.follower_count ?? 0}
                    </Text>
                    <Text
                      style={[styles.metricLabel, { color: colors.textSecondary }]}
                    >
                      Followers
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.metricCard,
                      {
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Ionicons name="document-text" size={22} color="#f59e0b" />
                    <Text style={[styles.metricVal, { color: colors.text }]}>
                      {analytics?.pendingApplicationsCount ?? 0}
                    </Text>
                    <Text
                      style={[styles.metricLabel, { color: colors.textSecondary }]}
                    >
                      Pending Applicants
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.metricCard,
                      {
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Ionicons name="rocket" size={22} color="#10b981" />
                    <Text style={[styles.metricVal, { color: colors.text }]}>
                      {analytics?.activeProjectsCount ?? 0}
                    </Text>
                    <Text
                      style={[styles.metricLabel, { color: colors.textSecondary }]}
                    >
                      Active Projects
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.metricCard,
                      {
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Ionicons name="calendar" size={22} color="#3b82f6" />
                    <Text style={[styles.metricVal, { color: colors.text }]}>
                      {analytics?.totalEventsCount ?? 0}
                    </Text>
                    <Text
                      style={[styles.metricLabel, { color: colors.textSecondary }]}
                    >
                      Organized Events
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.metricCard,
                      {
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Ionicons name="chatbubbles" size={22} color="#8b5cf6" />
                    <Text style={[styles.metricVal, { color: colors.text }]}>
                      {analytics?.totalPostsCount ?? 0}
                    </Text>
                    <Text
                      style={[styles.metricLabel, { color: colors.textSecondary }]}
                    >
                      Community Posts
                    </Text>
                  </View>
                </View>
              )}
            </ScrollView>
          )}

          {/* Tab 2: Applications Kanban */}
          {activeTab === "applications" && (
            <View style={{ flex: 1 }}>
              {/* Pipeline filter pills */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.stageFilterScroll}
              >
                {(
                  [
                    "all",
                    "applied",
                    "shortlisted",
                    "interview",
                    "selected",
                    "rejected",
                  ] as const
                ).map((stage) => {
                  const isSel = stageFilter === stage;
                  return (
                    <TouchableOpacity
                      key={stage}
                      style={[
                        styles.stagePill,
                        isSel && { backgroundColor: colors.primary },
                      ]}
                      onPress={() => setStageFilter(stage)}
                    >
                      <Text
                        style={[
                          styles.stagePillText,
                          { color: isSel ? "#fff" : colors.textSecondary },
                        ]}
                      >
                        {stage === "all"
                          ? "All"
                          : APPLICATION_STATUS_LABELS[stage] || stage}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {loadingApps ? (
                <View style={styles.centerBox}>
                  <ActivityIndicator size="large" color={colors.primary} />
                </View>
              ) : filteredApps.length === 0 ? (
                <View style={styles.centerBox}>
                  <Text style={{ color: colors.textSecondary }}>
                    No candidates found in this stage.
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={filteredApps}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
                  renderItem={({ item }) => {
                    const stColor = getStatusColor(item.status);
                    const isUpdating = updatingAppId === item.id;
                    return (
                      <View
                        style={[
                          styles.appCard,
                          {
                            backgroundColor: colors.background,
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        <View style={styles.appCardHeader}>
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[styles.candidateName, { color: colors.text }]}
                            >
                              {item.applicant?.full_name || "Applicant"}
                            </Text>
                            <Text
                              style={[
                                styles.candidateDept,
                                { color: colors.textSecondary },
                              ]}
                            >
                              {item.applied_position} ·{" "}
                              {item.applicant?.department || "Student"}
                            </Text>
                          </View>

                          <View
                            style={[
                              styles.stageBadge,
                              { backgroundColor: `${stColor}20` },
                            ]}
                          >
                            <Text
                              style={[styles.stageBadgeText, { color: stColor }]}
                            >
                              {APPLICATION_STATUS_LABELS[item.status] ||
                                item.status.toUpperCase()}
                            </Text>
                          </View>
                        </View>

                        {item.statement ? (
                          <Text
                            style={[
                              styles.statementText,
                              { color: colors.textSecondary },
                            ]}
                            numberOfLines={3}
                          >
                            "{item.statement}"
                          </Text>
                        ) : null}

                        {/* Portfolio Links */}
                        {(item.portfolio_url || item.resume_url) && (
                          <View style={styles.linksRow}>
                            {item.portfolio_url && (
                              <TouchableOpacity
                                style={styles.linkChip}
                                onPress={() =>
                                  item.portfolio_url &&
                                  Linking.openURL(item.portfolio_url)
                                }
                              >
                                <Ionicons
                                  name="globe-outline"
                                  size={12}
                                  color={colors.primary}
                                />
                                <Text
                                  style={[
                                    styles.linkChipText,
                                    { color: colors.primary },
                                  ]}
                                >
                                  Portfolio
                                </Text>
                              </TouchableOpacity>
                            )}
                            {item.resume_url && (
                              <TouchableOpacity
                                style={styles.linkChip}
                                onPress={() =>
                                  item.resume_url &&
                                  Linking.openURL(item.resume_url)
                                }
                              >
                                <Ionicons
                                  name="document-text-outline"
                                  size={12}
                                  color={colors.primary}
                                />
                                <Text
                                  style={[
                                    styles.linkChipText,
                                    { color: colors.primary },
                                  ]}
                                >
                                  Resume
                                </Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        )}

                        {/* Stage Progression Action Buttons */}
                        <View style={styles.stageActionsRow}>
                          <Text
                            style={[
                              styles.stageActionLabel,
                              { color: colors.textSecondary },
                            ]}
                          >
                            Move to:
                          </Text>
                          {(
                            [
                              "applied",
                              "shortlisted",
                              "interview",
                              "selected",
                              "rejected",
                            ] as const
                          ).map((st) => {
                            if (st === item.status) return null;
                            return (
                              <TouchableOpacity
                                key={st}
                                style={[
                                  styles.stageActionBtn,
                                  {
                                    borderColor: getStatusColor(st),
                                    backgroundColor: `${getStatusColor(st)}12`,
                                  },
                                ]}
                                onPress={() => handleUpdateAppStatus(item.id, st)}
                                disabled={isUpdating}
                              >
                                <Text
                                  style={[
                                    styles.stageActionBtnText,
                                    { color: getStatusColor(st) },
                                  ]}
                                >
                                  {APPLICATION_STATUS_LABELS[st] || st}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    );
                  }}
                />
              )}
            </View>
          )}

          {/* Tab 3: Sub-Teams & Committees */}
          {activeTab === "teams" && (
            <ScrollView
              contentContainerStyle={styles.tabContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={[styles.inputLabel, { color: colors.text, fontSize: 16, fontWeight: "700" }]}>
                Club Sub-Teams & Working Committees
              </Text>
              <Text style={[{ color: colors.textSecondary, fontSize: 13, marginBottom: 14 }]}>
                Structure your club into specialized teams (e.g. Core Tech, Design, PR & Outreach).
              </Text>

              {/* Create Team Form Card */}
              <View
                style={[
                  styles.dangerZone,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                    marginTop: 0,
                    marginBottom: 16,
                  },
                ]}
              >
                <Text style={[styles.inputLabel, { color: colors.text, marginTop: 0 }]}>
                  New Team Name *
                </Text>
                <TextInput
                  style={[
                    styles.formInput,
                    {
                      borderColor: colors.border,
                      color: colors.text,
                      backgroundColor: colors.surface,
                    },
                  ]}
                  placeholder="e.g. Media & Communications"
                  placeholderTextColor={colors.textSecondary}
                  value={newTeamName}
                  onChangeText={setNewTeamName}
                />

                <Text style={[styles.inputLabel, { color: colors.text, marginTop: 8 }]}>
                  Description (optional)
                </Text>
                <TextInput
                  style={[
                    styles.formInput,
                    styles.formTextArea,
                    {
                      borderColor: colors.border,
                      color: colors.text,
                      backgroundColor: colors.surface,
                      height: 60,
                    },
                  ]}
                  placeholder="Scope, duties, or requirements..."
                  placeholderTextColor={colors.textSecondary}
                  value={newTeamDesc}
                  onChangeText={setNewTeamDesc}
                  multiline
                />

                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: colors.primary, marginTop: 10 }]}
                  onPress={handleCreateTeam}
                  disabled={creatingTeam}
                >
                  {creatingTeam ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.saveBtnText}>Create Sub-Team</Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* Teams List */}
              <Text style={[styles.inputLabel, { color: colors.text, fontSize: 15, fontWeight: "700", marginBottom: 10 }]}>
                Active Sub-Teams ({teams.length})
              </Text>

              {loadingTeams ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 20 }} />
              ) : teams.length === 0 ? (
                <View style={{ alignItems: "center", paddingVertical: 24 }}>
                  <Ionicons name="people-outline" size={40} color={colors.textSecondary} />
                  <Text style={{ color: colors.text, fontWeight: "600", marginTop: 8 }}>
                    No sub-teams yet
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
                    Use the form above to establish your first working team.
                  </Text>
                </View>
              ) : (
                teams.map((t) => (
                  <View
                    key={t.id}
                    style={[
                      styles.kanbanCard,
                      { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 10 },
                    ]}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Ionicons name="shield-checkmark" size={18} color={colors.primary} />
                      <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>
                        {t.name}
                      </Text>
                    </View>
                    {t.description ? (
                      <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4 }}>
                        {t.description}
                      </Text>
                    ) : null}
                    <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 6 }}>
                      Established {new Date(t.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>
          )}

          {/* Tab 4: Settings & Branding */}
          {activeTab === "settings" && (
            <ScrollView contentContainerStyle={styles.tabContent}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Club Tagline
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
                placeholder="Short motto or tagline"
                placeholderTextColor={colors.textSecondary}
                value={tagline}
                onChangeText={setTagline}
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
                placeholder="Club overview..."
                placeholderTextColor={colors.textSecondary}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Mission
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
                placeholder="What is the core mission of this club?"
                placeholderTextColor={colors.textSecondary}
                value={mission}
                onChangeText={setMission}
                multiline
                numberOfLines={2}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Vision
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
                placeholder="What does the club aspire to achieve long-term?"
                placeholderTextColor={colors.textSecondary}
                value={vision}
                onChangeText={setVision}
                multiline
                numberOfLines={2}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Membership Policy
              </Text>
              <View style={styles.memTypeRow}>
                {(["open", "application", "invite_only"] as const).map(
                  (type) => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.memTypeBtn,
                        membershipType === type && {
                          backgroundColor: colors.primary,
                          borderColor: colors.primary,
                        },
                        { borderColor: colors.border },
                      ]}
                      onPress={() => setMembershipType(type)}
                    >
                      <Text
                        style={[
                          styles.memTypeBtnText,
                          {
                            color:
                              membershipType === type ? "#fff" : colors.text,
                          },
                        ]}
                      >
                        {type === "open"
                          ? "Open"
                          : type === "application"
                          ? "Screening"
                          : "Invite"}
                      </Text>
                    </TouchableOpacity>
                  )
                )}
              </View>

              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Official Contact Email
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
                placeholder="club@ruet.ac.bd"
                placeholderTextColor={colors.textSecondary}
                value={contactEmail}
                onChangeText={setContactEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <TouchableOpacity
                style={[
                  styles.saveBtn,
                  { backgroundColor: colors.primary },
                ]}
                onPress={handleSaveSettings}
                disabled={savingSettings}
              >
                {savingSettings ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveBtnText}>Save Settings</Text>
                )}
              </TouchableOpacity>

              <View style={[styles.dangerZone, { borderColor: "#ef4444" }]}>
                <Text style={styles.dangerTitle}>Danger Zone</Text>
                <Text
                  style={[styles.dangerSub, { color: colors.textSecondary }]}
                >
                  Archiving the club will hide it from active discovery.
                </Text>
                <TouchableOpacity
                  style={styles.archiveBtn}
                  onPress={handleArchiveClub}
                >
                  <Ionicons name="archive-outline" size={16} color="#fff" />
                  <Text style={styles.archiveBtnText}>Archive This Club</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    height: "90%",
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(150, 150, 150, 0.15)",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
  },
  sub: {
    fontSize: 12,
  },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  tabItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabItemText: {
    fontSize: 13,
    fontWeight: "600",
  },
  tabContent: {
    padding: 18,
    paddingBottom: 40,
    gap: 12,
  },
  centerBox: {
    paddingVertical: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  metricCard: {
    width: "48%",
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    alignItems: "center",
    gap: 6,
  },
  metricVal: {
    fontSize: 24,
    fontWeight: "800",
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  stageFilterScroll: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  stagePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "rgba(150, 150, 150, 0.12)",
  },
  stagePillText: {
    fontSize: 12,
    fontWeight: "600",
  },
  appCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  kanbanCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  appCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  candidateName: {
    fontSize: 15,
    fontWeight: "700",
  },
  candidateDept: {
    fontSize: 12,
    marginTop: 2,
  },
  stageBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  stageBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  statementText: {
    fontSize: 13,
    fontStyle: "italic",
    lineHeight: 18,
    marginBottom: 10,
  },
  linksRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  linkChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  linkChipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  stageActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(150, 150, 150, 0.12)",
  },
  stageActionLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  stageActionBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  stageActionBtnText: {
    fontSize: 11,
    fontWeight: "700",
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 6,
  },
  formInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  formTextArea: {
    height: 60,
    textAlignVertical: "top",
  },
  memTypeRow: {
    flexDirection: "row",
    gap: 8,
  },
  memTypeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
  },
  memTypeBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  saveBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 12,
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  dangerZone: {
    marginTop: 20,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  dangerTitle: {
    color: "#ef4444",
    fontSize: 14,
    fontWeight: "700",
  },
  dangerSub: {
    fontSize: 12,
  },
  archiveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#ef4444",
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 4,
  },
  archiveBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
});
