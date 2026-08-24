import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { Button, Card, Empty, ErrorState, H1, H2, Muted, Pill, Row, Screen, Skeleton } from "@/components/ui";
import { radius, useTheme } from "@/theme";
import type { Profile } from "@/types";

type AdminStats = {
  totalUsers: number;
  totalRooms: number;
  activeSessions: number;
  pendingReports: number;
};

type ReportItem = {
  id: string;
  reason: string;
  details?: string;
  status: string;
  created_at: string;
  reporter_id: string;
  target_id?: string;
  target_type?: string;
  reporter?: { username: string; full_name: string };
  target_user?: { username: string; full_name: string; account_status: string };
};

type UserItem = {
  id: string;
  username: string;
  full_name: string;
  account_status: string;
  roles: string[];
  reputation: number;
  created_at: string;
};

type DashboardConfigItem = {
  id: string;
  widget_key: string;
  title_en: string;
  title_bn: string;
  default_order: number;
  is_required: boolean;
  is_enabled: boolean;
};

type AnnouncementItem = {
  id: string;
  title_en: string;
  body_en: string;
  tone: string;
  is_active: boolean;
  created_at: string;
};

export default function AdminConsoleScreen() {
  const { colors } = useTheme();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<"reports" | "users" | "widgets" | "announcements">("reports");
  const [userSearch, setUserSearch] = useState("");

  // New announcement inputs
  const [annTitle, setAnnTitle] = useState("");
  const [annBody, setAnnBody] = useState("");

  const currentProfileQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ profile: Profile }>("/profiles/me"),
  });
  const currentRoles = currentProfileQuery.data?.profile.roles ?? [];
  const isAdmin = currentRoles.includes("admin");
  const isElevated = isAdmin || currentRoles.includes("moderator");

  // Stats query
  const statsQuery = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => api<AdminStats>("/admin/stats"),
    enabled: isElevated,
  });

  // Reports query
  const reportsQuery = useQuery({
    queryKey: ["admin-reports"],
    queryFn: () => api<{ reports: ReportItem[] }>("/admin/reports"),
    enabled: isElevated,
  });

  // Users query
  const usersQuery = useQuery({
    queryKey: ["admin-users", userSearch],
    queryFn: () => api<{ users: UserItem[] }>(`/admin/users?q=${encodeURIComponent(userSearch)}`),
    enabled: isElevated,
  });

  // Dashboard Configs query
  const configsQuery = useQuery({
    queryKey: ["admin-dashboard-configs"],
    queryFn: () => api<{ configs: DashboardConfigItem[] }>("/admin/dashboard-configs"),
    enabled: isAdmin,
  });

  // Announcements query
  const announcementsQuery = useQuery({
    queryKey: ["admin-announcements"],
    queryFn: () => api<{ announcements: AnnouncementItem[] }>("/admin/announcements"),
    enabled: isAdmin,
  });

  // Report decision mutation
  const reportDecision = useMutation({
    mutationFn: ({ id, status, action }: { id: string; status: string; action: string }) =>
      api(`/admin/reports/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, action }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-reports"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      Alert.alert("Report Updated", "Decision recorded with transactional audit logging.");
    },
    onError: (err: any) => Alert.alert("Action Failed", err.message),
  });

  // User status mutation
  const userStatusMutation = useMutation({
    mutationFn: ({ userId, status, reason }: { userId: string; status: string; reason: string }) =>
      api(`/admin/users/${userId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, reason }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      Alert.alert("Status Updated", "User moderation action applied.");
    },
    onError: (err: any) => Alert.alert("Action Failed", err.message),
  });

  // User role mutation
  const userRoleMutation = useMutation({
    mutationFn: ({ userId, elevatedRole }: { userId: string; elevatedRole: "moderator" | null }) =>
      api(`/admin/users/${userId}/roles`, {
        method: "PUT",
        body: JSON.stringify({ elevatedRole }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      Alert.alert("Roles Updated", "Permissions updated successfully.");
    },
    onError: (err: any) => Alert.alert("Action Failed", err.message),
  });

  // Widget config toggle mutation
  const widgetToggleMutation = useMutation({
    mutationFn: ({ id, is_enabled }: { id: string; is_enabled: boolean }) =>
      api(`/admin/dashboard-configs/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_enabled }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-dashboard-configs"] });
      Alert.alert("Widget Updated", "Dashboard widget status changed.");
    },
    onError: (err: any) => Alert.alert("Action Failed", err.message),
  });

  // Create announcement mutation
  const createAnnouncementMutation = useMutation({
    mutationFn: () =>
      api("/admin/announcements", {
        method: "POST",
        body: JSON.stringify({
          title_en: annTitle.trim(),
          title_bn: annTitle.trim(),
          body_en: annBody.trim(),
          body_bn: annBody.trim(),
          tone: "info",
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-announcements"] });
      setAnnTitle("");
      setAnnBody("");
      Alert.alert("Broadcast Published", "Announcement is now active on user dashboards.");
    },
    onError: (err: any) => Alert.alert("Publish Failed", err.message),
  });

  const stats = statsQuery.data;

  if (currentProfileQuery.isLoading) {
    return <Screen><View style={styles.container}><Skeleton height={180} /></View></Screen>;
  }

  if (currentProfileQuery.isError) {
    return (
      <Screen>
        <View style={styles.container}>
          <ErrorState detail={(currentProfileQuery.error as Error).message} onRetry={() => currentProfileQuery.refetch()} />
        </View>
      </Screen>
    );
  }

  if (!isElevated) {
    return (
      <Screen>
        <View style={styles.container}>
          <Empty title="Access denied" detail="This console is available only to moderators and administrators." />
          <Button title="Go back" variant="secondary" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.container}>
        {/* Header */}
        <Row style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <H1 style={styles.title}>Admin Control Plane 🛡️</H1>
          </View>
        </Row>
        <Muted style={{ marginBottom: 14 }}>
          Elevated platform operations, user moderation, dashboard builder, and broadcast governance.
        </Muted>

        {/* Stats Grid */}
        {stats && (
          <Animated.View entering={FadeInUp.springify()}>
            <Row style={styles.statsGrid}>
              <Card tone="glow" style={styles.statCard}>
                <Text style={[styles.statNumber, { color: colors.primary }]}>{stats.totalUsers}</Text>
                <Text style={[styles.statLabel, { color: colors.muted }]}>Total Users</Text>
              </Card>
              <Card style={styles.statCard}>
                <Text style={[styles.statNumber, { color: colors.text }]}>{stats.totalRooms}</Text>
                <Text style={[styles.statLabel, { color: colors.muted }]}>Rooms</Text>
              </Card>
              <Card style={styles.statCard}>
                <Text style={[styles.statNumber, { color: colors.text }]}>{stats.activeSessions}</Text>
                <Text style={[styles.statLabel, { color: colors.muted }]}>Active Sessions</Text>
              </Card>
              <Card tone={stats.pendingReports > 0 ? "accent" : "default"} style={styles.statCard}>
                <Text style={[styles.statNumber, { color: stats.pendingReports > 0 ? colors.accent : colors.text }]}>
                  {stats.pendingReports}
                </Text>
                <Text style={[styles.statLabel, { color: colors.muted }]}>Open Reports</Text>
              </Card>
            </Row>
          </Animated.View>
        )}

        {/* Tab Switcher */}
        <Row style={styles.tabsRow}>
          <Pressable
            onPress={() => setActiveTab("reports")}
            style={[
              styles.tabButton,
              { borderColor: colors.border },
              activeTab === "reports" && { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
          >
            <Text style={[styles.tabText, { color: activeTab === "reports" ? "#fff" : colors.muted }]}>
              Reports ({reportsQuery.data?.reports.length ?? 0})
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setActiveTab("users")}
            style={[
              styles.tabButton,
              { borderColor: colors.border },
              activeTab === "users" && { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
          >
            <Text style={[styles.tabText, { color: activeTab === "users" ? "#fff" : colors.muted }]}>
              Users
            </Text>
          </Pressable>

          {isAdmin && <Pressable
            onPress={() => setActiveTab("widgets")}
            style={[
              styles.tabButton,
              { borderColor: colors.border },
              activeTab === "widgets" && { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
          >
            <Text style={[styles.tabText, { color: activeTab === "widgets" ? "#fff" : colors.muted }]}>
              Widgets
            </Text>
          </Pressable>}

          {isAdmin && <Pressable
            onPress={() => setActiveTab("announcements")}
            style={[
              styles.tabButton,
              { borderColor: colors.border },
              activeTab === "announcements" && { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
          >
            <Text style={[styles.tabText, { color: activeTab === "announcements" ? "#fff" : colors.muted }]}>
              Broadcasts
            </Text>
          </Pressable>}
        </Row>

        {/* Tab Content: Reports */}
        {activeTab === "reports" && (
          <View style={{ gap: 12 }}>
            {reportsQuery.isLoading ? (
              <View style={{ gap: 10 }}>
                <Skeleton height={110} />
                <Skeleton height={110} />
              </View>
            ) : reportsQuery.isError ? (
              <ErrorState
                detail={(reportsQuery.error as Error).message}
                onRetry={() => reportsQuery.refetch()}
              />
            ) : (reportsQuery.data?.reports.length ?? 0) === 0 ? (
              <Empty
                title="Reports Queue Clear"
                detail="All safety and moderation reports have been resolved."
              />
            ) : (
              reportsQuery.data?.reports.map((report, idx) => (
                <Animated.View key={report.id} entering={FadeInUp.delay(idx * 70).springify()}>
                  <Card style={styles.reportCard}>
                    <Row style={{ justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.reportReason, { color: colors.text }]}>{report.reason}</Text>
                        {report.details && <Muted>{report.details}</Muted>}
                      </View>
                    <Pill tone={report.status === "open" ? "danger" : "accent"}>
                      {report.status.toUpperCase()}
                    </Pill>
                  </Row>

                  <Muted style={{ fontSize: 12, marginBottom: 10 }}>
                    Reported on {new Date(report.created_at).toLocaleString()}
                    {report.target_user ? ` · Target: @${report.target_user.username}` : ""}
                  </Muted>

                  {report.status === "open" && (
                    <Row style={{ gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Button
                          title="Dismiss"
                          variant="secondary"
                          compact
                          onPress={() =>
                            reportDecision.mutate({
                              id: report.id,
                              status: "dismissed",
                              action: "Reviewed and dismissed",
                            })
                          }
                          disabled={reportDecision.isPending}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Button
                          title="Resolve & Action"
                          compact
                          onPress={() =>
                            reportDecision.mutate({
                              id: report.id,
                              status: "resolved",
                              action: "Reviewed and resolved",
                            })
                          }
                          disabled={reportDecision.isPending}
                        />
                      </View>
                    </Row>
                    )}
                  </Card>
                </Animated.View>
              ))
            )}
          </View>
        )}

        {/* Tab Content: Users */}
        {activeTab === "users" && (
          <View style={{ gap: 12 }}>
            <TextInput
              style={[styles.searchInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              placeholder="Search by username or name..."
              placeholderTextColor={colors.muted}
              value={userSearch}
              onChangeText={setUserSearch}
            />

            {usersQuery.isLoading ? (
              <View style={{ gap: 10 }}>
                <Skeleton height={90} />
                <Skeleton height={90} />
              </View>
            ) : (usersQuery.data?.users.length ?? 0) === 0 ? (
              <Empty title="No Users Found" detail="Try a different search keyword." />
            ) : (
              usersQuery.data?.users.map((user, idx) => (
                <Animated.View key={user.id} entering={FadeInUp.delay(idx * 70).springify()}>
                  <Card style={styles.userCard}>
                    <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.userName, { color: colors.text }]}>{user.full_name}</Text>
                        <Muted>@{user.username} · {user.reputation || 0} rep · Roles: {user.roles.join(", ")}</Muted>
                      </View>
                    <Pill tone={user.account_status === "active" ? "primary" : "danger"}>
                      {user.account_status.toUpperCase()}
                    </Pill>
                  </Row>

                  <Row style={{ gap: 8, marginTop: 10 }}>
                    {user.account_status === "active" ? (
                      <View style={{ flex: 1 }}>
                        <Button
                          title="Suspend User"
                          variant="danger"
                          compact
                          onPress={() =>
                            userStatusMutation.mutate({
                              userId: user.id,
                              status: "suspended",
                              reason: "Administrative suspension",
                            })
                          }
                          disabled={userStatusMutation.isPending}
                        />
                      </View>
                    ) : (
                      <View style={{ flex: 1 }}>
                        <Button
                          title="Reactivate"
                          variant="secondary"
                          compact
                          onPress={() =>
                            userStatusMutation.mutate({
                              userId: user.id,
                              status: "active",
                              reason: "Administrative reinstatement",
                            })
                          }
                          disabled={userStatusMutation.isPending}
                        />
                      </View>
                    )}

                    {isAdmin && (!user.roles.includes("moderator") ? (
                      <View style={{ flex: 1 }}>
                        <Button
                          title="Make Moderator"
                          variant="secondary"
                          compact
                          onPress={() =>
                            userRoleMutation.mutate({
                              userId: user.id,
                              elevatedRole: "moderator",
                            })
                          }
                          disabled={userRoleMutation.isPending}
                        />
                      </View>
                    ) : (
                      <View style={{ flex: 1 }}>
                        <Button
                          title="Revoke Moderator"
                          variant="secondary"
                          compact
                          onPress={() =>
                            userRoleMutation.mutate({
                              userId: user.id,
                              elevatedRole: null,
                            })
                          }
                          disabled={userRoleMutation.isPending}
                        />
                      </View>
                    ))}
                  </Row>
                </Card>
              </Animated.View>
              ))
            )}
          </View>
        )}

        {/* Tab Content: Dashboard Widgets */}
        {activeTab === "widgets" && (
          <View style={{ gap: 12 }}>
            <Card>
              <H2>Dashboard Widgets Manager</H2>
              <Muted>Enable or disable widgets globally across client applications.</Muted>
            </Card>

            {configsQuery.data?.configs.map((cfg, idx) => (
              <Animated.View key={cfg.id} entering={FadeInUp.delay(idx * 70).springify()}>
                <Card style={{ padding: 12 }}>
                  <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.userName, { color: colors.text }]}>{cfg.title_en} ({cfg.widget_key})</Text>
                      <Muted>Order: {cfg.default_order} · {cfg.is_required ? "Mandatory" : "Optional"}</Muted>
                    </View>
                  <Button
                    title={cfg.is_enabled ? "Enabled" : "Disabled"}
                    variant={cfg.is_enabled ? "primary" : "secondary"}
                    compact
                    onPress={() =>
                      widgetToggleMutation.mutate({
                        id: cfg.id,
                        is_enabled: !cfg.is_enabled,
                      })
                    }
                  />
                  </Row>
                </Card>
              </Animated.View>
            ))}
          </View>
        )}

        {/* Tab Content: Announcements */}
        {activeTab === "announcements" && (
          <View style={{ gap: 12 }}>
            <Card>
              <H2>Publish Service Announcement</H2>
              <Muted style={{ marginBottom: 10 }}>Broadcast critical updates to all active user dashboards.</Muted>
              <TextInput
                style={[styles.searchInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border, marginBottom: 8 }]}
                placeholder="Announcement Title..."
                placeholderTextColor={colors.muted}
                value={annTitle}
                onChangeText={setAnnTitle}
              />
              <TextInput
                style={[styles.searchInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border, marginBottom: 12 }]}
                placeholder="Announcement Body..."
                placeholderTextColor={colors.muted}
                value={annBody}
                onChangeText={setAnnBody}
              />
              <Button
                title="Publish Broadcast"
                onPress={() => createAnnouncementMutation.mutate()}
                disabled={!annTitle.trim() || !annBody.trim() || createAnnouncementMutation.isPending}
                loading={createAnnouncementMutation.isPending}
              />
            </Card>

            {announcementsQuery.data?.announcements.map((ann, idx) => (
              <Animated.View key={ann.id} entering={FadeInUp.delay(idx * 70).springify()}>
                <Card>
                  <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={[styles.userName, { color: colors.text }]}>{ann.title_en}</Text>
                    <Pill tone={ann.is_active ? "primary" : "default"}>{ann.is_active ? "Active" : "Archived"}</Pill>
                  </Row>
                  <Text style={{ color: colors.muted, marginTop: 4 }}>{ann.body_en}</Text>
                </Card>
              </Animated.View>
            ))}
          </View>
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
    marginBottom: 4,
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
  statsGrid: {
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  statCard: {
    width: "48%",
    padding: 12,
    borderRadius: radius.md,
    alignItems: "center",
  },
  statNumber: {
    fontSize: 22,
    fontWeight: "800",
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    marginTop: 2,
  },
  tabsRow: {
    gap: 6,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tabText: {
    fontSize: 12,
    fontWeight: "700",
  },
  reportCard: {
    padding: 14,
    borderRadius: radius.lg,
  },
  reportReason: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 2,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  userCard: {
    padding: 14,
    borderRadius: radius.lg,
  },
  userName: {
    fontSize: 15,
    fontWeight: "700",
  },
});
