import { useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { Button, Card, Empty, ErrorState, H1, H2, Muted, Pill, Row, Screen, Skeleton } from "@/components/ui";
import { radius, useTheme } from "@/theme";

type AdminStats = {
  total_users: number;
  active_rooms: number;
  total_sessions: number;
  open_reports: number;
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

export default function AdminConsoleScreen() {
  const { colors } = useTheme();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<"reports" | "users">("reports");
  const [userSearch, setUserSearch] = useState("");

  // Stats query
  const statsQuery = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => api<AdminStats>("/admin/stats"),
  });

  // Reports query
  const reportsQuery = useQuery({
    queryKey: ["admin-reports"],
    queryFn: () => api<{ reports: ReportItem[] }>("/admin/reports"),
  });

  // Users query
  const usersQuery = useQuery({
    queryKey: ["admin-users", userSearch],
    queryFn: () => api<{ users: UserItem[] }>(`/admin/users?query=${encodeURIComponent(userSearch)}`),
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
    mutationFn: ({ userId, roles }: { userId: string; roles: string[] }) =>
      api(`/admin/users/${userId}/role`, {
        method: "POST",
        body: JSON.stringify({ roles }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      Alert.alert("Roles Updated", "Permissions updated successfully.");
    },
    onError: (err: any) => Alert.alert("Action Failed", err.message),
  });

  const stats = statsQuery.data;

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
          Elevated platform operations, user moderation, and transactional audit governance.
        </Muted>

        {/* Stats Grid */}
        {stats && (
          <Row style={styles.statsGrid}>
            <Card tone="glow" style={styles.statCard}>
              <Text style={[styles.statNumber, { color: colors.primary }]}>{stats.total_users}</Text>
              <Text style={[styles.statLabel, { color: colors.muted }]}>Total Users</Text>
            </Card>
            <Card style={styles.statCard}>
              <Text style={[styles.statNumber, { color: colors.text }]}>{stats.active_rooms}</Text>
              <Text style={[styles.statLabel, { color: colors.muted }]}>Active Rooms</Text>
            </Card>
            <Card style={styles.statCard}>
              <Text style={[styles.statNumber, { color: colors.text }]}>{stats.total_sessions}</Text>
              <Text style={[styles.statLabel, { color: colors.muted }]}>Sessions</Text>
            </Card>
            <Card tone={stats.open_reports > 0 ? "accent" : "default"} style={styles.statCard}>
              <Text style={[styles.statNumber, { color: stats.open_reports > 0 ? colors.accent : colors.text }]}>
                {stats.open_reports}
              </Text>
              <Text style={[styles.statLabel, { color: colors.muted }]}>Open Reports</Text>
            </Card>
          </Row>
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
            <Text
              style={[
                styles.tabText,
                { color: activeTab === "reports" ? "#fff" : colors.muted },
              ]}
            >
              Reports Queue ({reportsQuery.data?.reports.length ?? 0})
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
            <Text
              style={[
                styles.tabText,
                { color: activeTab === "users" ? "#fff" : colors.muted },
              ]}
            >
              User Moderation
            </Text>
          </Pressable>
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
              reportsQuery.data?.reports.map((report) => (
                <Card key={report.id} style={styles.reportCard}>
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
              usersQuery.data?.users.map((user) => (
                <Card key={user.id} style={styles.userCard}>
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

                    {!user.roles.includes("moderator") ? (
                      <View style={{ flex: 1 }}>
                        <Button
                          title="Make Moderator"
                          variant="secondary"
                          compact
                          onPress={() =>
                            userRoleMutation.mutate({
                              userId: user.id,
                              roles: [...user.roles, "moderator"],
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
                              roles: user.roles.filter((r) => r !== "moderator"),
                            })
                          }
                          disabled={userRoleMutation.isPending}
                        />
                      </View>
                    )}
                  </Row>
                </Card>
              ))
            )}
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
    gap: 8,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tabText: {
    fontSize: 13,
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
