import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { Button, Card, Empty, ErrorState, H1, H2, Muted, Pill, Row, Screen, Skeleton, AppTextField } from "@/components/ui";
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

type SystemHealthItem = {
  database: { status: string; latencyMs: number | null; error: string | null };
  redis: { status: string; latencyMs: number | null; metrics: Record<string, unknown> };
  auth: { status: string; failuresLast5Min: number; isAuthDegraded: boolean };
  memory: { rssMB: number; heapTotalMB: number; heapUsedMB: number; externalMB: number };
  uptimeSeconds: number;
  startedAt: string;
};

type AnalyticsItem = {
  timeframe: string;
  totalUsers: number;
  newUsersToday: number;
  newUsersPeriod: number;
  dauCount: number;
  wauCount: number;
  mauCount: number;
  totalRooms: number;
  activeRooms: number;
  totalMemberships: number;
  scheduledSessions: number;
  completedSessions: number;
  cancelledSessions: number;
  totalConnectionRequests: number;
  acceptedConnectionRequests: number;
  usersWithSkills: number;
  usersWithConnections: number;
  usersWithRooms: number;
  usersWithSessions: number;
};

type AdminRoomItem = {
  id: string;
  title: string;
  description?: string;
  status: string;
  visibility: string;
  topic?: string;
  created_at: string;
  member_count?: number;
};

type AuditLogItem = {
  id: string;
  created_at: string;
  actor_id: string;
  action: string;
  target_type: string;
  target_id: string;
  ip_address?: string;
  metadata?: Record<string, unknown>;
};

type AdminClubItem = {
  id: string;
  name: string;
  description?: string;
  category?: string;
  created_at: string;
  membersCount: number;
  lead?: { id: string; full_name: string; username: string; avatar_url?: string | null };
};

type ApiKeyItem = {
  id: string;
  service: string;
  keyName: string;
  maskedKey: string;
  apiSecretSet: boolean;
  baseUrl?: string | null;
  monthlyLimit: number;
  currentUsage: number;
  isActive: boolean;
  isEnabled: boolean;
  usagePercent: number;
  createdAt: string;
  updatedAt: string;
};

type ApiKeysResponse = {
  apiKeys: ApiKeyItem[];
  livekitFreeTier: {
    service: string;
    freeMonthlyMinutes: number;
    note: string;
  };
};

type ApiKeyForm = {
  service: "livekit" | "gemini" | "youtube" | "push" | "ai" | "turn" | "other";
  keyName: string;
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
  monthlyLimit: string;
  isEnabled: boolean;
};

export type StoragePoolItem = {
  id: string;
  pool_name: string;
  bucket_name: string;
  public_domain: string;
  status: "active" | "standby" | "full" | "draining";
  priority: number;
  max_capacity_bytes: number;
  used_bytes: number;
  total_files: number;
  usage_percent: number;
  created_at: string;
};

function formatPoolBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function AdminConsoleScreen() {
  const { colors, isDark } = useTheme();
  const qc = useQueryClient();

const [activeTab, setActiveTab] = useState<"reports" | "users" | "widgets" | "announcements" | "storage" | "system" | "analytics" | "rooms" | "audit" | "clubs" | "apiKeys">("reports");
const [userSearch, setUserSearch] = useState("");
const [roomSearch, setRoomSearch] = useState("");
const [clubSearch, setClubSearch] = useState("");
const [auditActionFilter, setAuditActionFilter] = useState("");
const [apiKeyServiceFilter, setApiKeyServiceFilter] = useState("all");

  // New announcement inputs
  const [annTitle, setAnnTitle] = useState("");
  const [annBody, setAnnBody] = useState("");

  // R2 Storage Pool State
  const [poolModalVisible, setPoolModalVisible] = useState(false);
  const [newPoolName, setNewPoolName] = useState("");
  const [newBucketName, setNewBucketName] = useState("");
  const [newAccountId, setNewAccountId] = useState("");
  const [newPublicDomain, setNewPublicDomain] = useState("");
  const [newAccessKeyId, setNewAccessKeyId] = useState("");
  const [newSecretAccessKey, setNewSecretAccessKey] = useState("");
  const [newMaxCapacityGb, setNewMaxCapacityGb] = useState("10");
  const [newPriority, setNewPriority] = useState("10");
  const [testingConnection, setTestingConnection] = useState(false);

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

  // Storage Pools query
  const storagePoolsQuery = useQuery({
    queryKey: ["admin-storage-pools"],
    queryFn: () =>
      api<{
        pools: StoragePoolItem[];
        summary: {
          total_pools: number;
          total_used_bytes: number;
          total_files: number;
          active_pool?: StoragePoolItem;
        };
      }>("/admin/storage/pools"),
    enabled: isAdmin && activeTab === "storage",
  });

  // System Health query (admin only)
  const systemHealthQuery = useQuery({
    queryKey: ["admin-system-health"],
    queryFn: () => api<SystemHealthItem>("/admin/system/status"),
    enabled: isAdmin && activeTab === "system",
  });

  // Analytics query (admin/moderator)
  const analyticsQuery = useQuery({
    queryKey: ["admin-analytics"],
    queryFn: () => api<AnalyticsItem>("/admin/analytics?timeframe=30d"),
    enabled: isElevated && activeTab === "analytics",
  });

  // Rooms query (admin/moderator)
  const roomsQuery = useQuery({
    queryKey: ["admin-rooms", roomSearch],
    queryFn: () => api<{ rooms: AdminRoomItem[]; total: number }>(`/admin/rooms?q=${encodeURIComponent(roomSearch)}`),
    enabled: isElevated && activeTab === "rooms",
  });

  // Audit Logs query (admin only)
  const auditLogsQuery = useQuery({
    queryKey: ["admin-audit-logs", auditActionFilter],
    queryFn: () => api<{ logs: AuditLogItem[]; total: number }>(`/admin/audit-logs?action=${encodeURIComponent(auditActionFilter)}`),
    enabled: isAdmin && activeTab === "audit",
  });

  // Clubs query (admin/moderator)
  const clubsQuery = useQuery({
    queryKey: ["admin-clubs", clubSearch],
    queryFn: () => api<{ items: AdminClubItem[]; total: number }>(`/admin/community?tab=clubs&q=${encodeURIComponent(clubSearch)}`),
    enabled: isElevated && activeTab === "clubs",
  });

  // API Keys query (admin only)
  const apiKeysQuery = useQuery({
    queryKey: ["admin-api-keys", apiKeyServiceFilter],
    queryFn: () =>
      api<ApiKeysResponse>(`/admin/api-keys?service=${encodeURIComponent(apiKeyServiceFilter)}`),
    enabled: isAdmin && activeTab === "apiKeys",
  });

  // API key form state
  const [newApiKey, setNewApiKey] = useState<ApiKeyForm>({
    service: "livekit",
    keyName: "",
    apiKey: "",
    apiSecret: "",
    baseUrl: "",
    monthlyLimit: "",
    isEnabled: true,
  });
  const [editingKeyId, setEditingKeyId] = useState<string | null>(null);
  const [editApiKeyData, setEditApiKeyData] = useState<{
    keyName: string;
    monthlyLimit: string;
    isEnabled: boolean;
  } | null>(null);

  // Create API key mutation
  const createApiKeyMutation = useMutation({
    mutationFn: () =>
      api("/admin/api-keys", {
        method: "POST",
        body: JSON.stringify({
          service: newApiKey.service,
          keyName: newApiKey.keyName.trim(),
          apiKey: newApiKey.apiKey.trim(),
          apiSecret: newApiKey.apiSecret.trim() || undefined,
          baseUrl: newApiKey.baseUrl.trim() || undefined,
          monthlyLimit: parseInt(newApiKey.monthlyLimit, 10) || 10000,
          isEnabled: newApiKey.isEnabled,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-api-keys"] });
      setNewApiKey({
        service: "livekit",
        keyName: "",
        apiKey: "",
        apiSecret: "",
        baseUrl: "",
        monthlyLimit: "",
        isEnabled: true,
      });
      Alert.alert("API Key Added", "New API key has been added and set as active.");
    },
    onError: (err: any) => Alert.alert("Add Failed", err.message),
  });

  // Update API key mutation
  const updateApiKeyMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Record<string, unknown> }) =>
      api(`/admin/api-keys/${id}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-api-keys"] });
      setEditingKeyId(null);
      setEditApiKeyData(null);
      Alert.alert("API Key Updated", "Limits and status have been updated.");
    },
    onError: (err: any) => Alert.alert("Update Failed", err.message),
  });

  // Switch API key mutation
  const switchApiKeyMutation = useMutation({
    mutationFn: (id: string) => api(`/admin/api-keys/${id}/switch`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-api-keys"] });
      Alert.alert("API Key Switched", "This key is now the active key for its service.");
    },
    onError: (err: any) => Alert.alert("Switch Failed", err.message),
  });

  // Delete API key mutation
  const deleteApiKeyMutation = useMutation({
    mutationFn: (id: string) => api(`/admin/api-keys/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-api-keys"] });
      Alert.alert("API Key Removed", "API key has been deleted.");
    },
    onError: (err: any) => Alert.alert("Delete Failed", err.message),
  });

  const testConnectionMutation = async () => {
    if (!newBucketName.trim() || !newAccountId.trim() || !newAccessKeyId.trim() || !newSecretAccessKey.trim()) {
      Alert.alert("Missing Fields", "Please enter Bucket Name, Account ID, and Access Keys to test.");
      return;
    }
    setTestingConnection(true);
    try {
      const res = await api<{ success: boolean; latency_ms: number; message: string }>("/admin/storage/pools/test", {
        method: "POST",
        body: JSON.stringify({
          bucket_name: newBucketName.trim(),
          account_id: newAccountId.trim(),
          access_key_id: newAccessKeyId.trim(),
          secret_access_key: newSecretAccessKey.trim(),
        }),
      });
      if (res.success) {
        Alert.alert("Connection Verified", `Cloudflare R2 bucket reachable! Latency: ${res.latency_ms}ms`);
      } else {
        Alert.alert("Test Failed", res.message || "Could not verify R2 bucket.");
      }
    } catch (err: any) {
      Alert.alert("Connection Failed", err.message || "Failed to reach Cloudflare R2 bucket.");
    } finally {
      setTestingConnection(false);
    }
  };

  const createPoolMutation = useMutation({
    mutationFn: () =>
      api("/admin/storage/pools", {
        method: "POST",
        body: JSON.stringify({
          pool_name: newPoolName.trim(),
          bucket_name: newBucketName.trim(),
          account_id: newAccountId.trim(),
          public_domain: newPublicDomain.trim(),
          access_key_id: newAccessKeyId.trim(),
          secret_access_key: newSecretAccessKey.trim(),
          max_capacity_bytes: Math.round((parseFloat(newMaxCapacityGb) || 10) * 1024 * 1024 * 1024),
          priority: parseInt(newPriority, 10) || 10,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-storage-pools"] });
      setPoolModalVisible(false);
      setNewPoolName("");
      setNewBucketName("");
      setNewAccountId("");
      setNewPublicDomain("");
      setNewAccessKeyId("");
      setNewSecretAccessKey("");
      Alert.alert("Storage Pool Added", "New Cloudflare R2 bucket added to the unlimited storage pool.");
    },
    onError: (err: any) => Alert.alert("Failed to Add Pool", err.message),
  });

  const activatePoolMutation = useMutation({
    mutationFn: (poolId: string) =>
      api(`/admin/storage/pools/${poolId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "active" }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-storage-pools"] });
      Alert.alert("Active Bucket Changed", "This bucket is now the primary active upload destination.");
    },
    onError: (err: any) => Alert.alert("Update Failed", err.message),
  });

  const deletePoolMutation = useMutation({
    mutationFn: (poolId: string) => api(`/admin/storage/pools/${poolId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-storage-pools"] });
      Alert.alert("Pool Removed", "Storage pool unmounted successfully.");
    },
    onError: (err: any) => Alert.alert("Delete Failed", err.message),
  });

  // Clear cache mutation (admin only)
  const clearCacheMutation = useMutation({
    mutationFn: ({ target, reason }: { target: "dashboard" | "catalog" | "rooms"; reason: string }) =>
      api("/admin/cache/clear", {
        method: "POST",
        body: JSON.stringify({ target, reason }),
      }),
    onSuccess: () => {
      qc.invalidateQueries();
      Alert.alert("Cache Cleared", "Selected cache namespace has been purged.");
    },
    onError: (err: any) => Alert.alert("Clear Failed", err.message),
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

          {isAdmin && <Pressable
            onPress={() => setActiveTab("storage")}
            style={[
              styles.tabButton,
              { borderColor: colors.border },
              activeTab === "storage" && { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
          >
            <Text style={[styles.tabText, { color: activeTab === "storage" ? "#fff" : colors.muted }]}>
              R2 Storage
            </Text>
          </Pressable>}

          {isAdmin && <Pressable
            onPress={() => setActiveTab("system")}
            style={[
              styles.tabButton,
              { borderColor: colors.border },
              activeTab === "system" && { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
          >
            <Text style={[styles.tabText, { color: activeTab === "system" ? "#fff" : colors.muted }]}>
              System Health
            </Text>
          </Pressable>}

          {isElevated && <Pressable
            onPress={() => setActiveTab("analytics")}
            style={[
              styles.tabButton,
              { borderColor: colors.border },
              activeTab === "analytics" && { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
          >
            <Text style={[styles.tabText, { color: activeTab === "analytics" ? "#fff" : colors.muted }]}>
              Analytics
            </Text>
          </Pressable>}

          {isElevated && <Pressable
            onPress={() => setActiveTab("rooms")}
            style={[
              styles.tabButton,
              { borderColor: colors.border },
              activeTab === "rooms" && { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
          >
            <Text style={[styles.tabText, { color: activeTab === "rooms" ? "#fff" : colors.muted }]}>
              Rooms
            </Text>
          </Pressable>}

          {isAdmin && <Pressable
            onPress={() => setActiveTab("audit")}
            style={[
              styles.tabButton,
              { borderColor: colors.border },
              activeTab === "audit" && { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
          >
            <Text style={[styles.tabText, { color: activeTab === "audit" ? "#fff" : colors.muted }]}>
              Audit Logs
            </Text>
          </Pressable>}

          {isElevated && <Pressable
            onPress={() => setActiveTab("clubs")}
            style={[
              styles.tabButton,
              { borderColor: colors.border },
              activeTab === "clubs" && { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
          >
            <Text style={[styles.tabText, { color: activeTab === "clubs" ? "#fff" : colors.muted }]}>
              Clubs
            </Text>
          </Pressable>}

          {isAdmin && <Pressable
            onPress={() => setActiveTab("apiKeys")}
            style={[
              styles.tabButton,
              { borderColor: colors.border },
              activeTab === "apiKeys" && { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
          >
            <Text style={[styles.tabText, { color: activeTab === "apiKeys" ? "#fff" : colors.muted }]}>
              API Keys
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

        {/* Tab Content: R2 Storage Pools */}
        {activeTab === "storage" && (
          <View style={{ gap: 14 }}>
            {/* Header / Capability Card */}
            <Card tone="glow" style={{ gap: 8 }}>
              <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <H2 style={{ fontSize: 16 }}>Cloudflare R2 Unlimited Storage Pool</H2>
                  <Muted style={{ fontSize: 12 }}>
                    Dynamic rollover architecture: automatically switches buckets when full.
                  </Muted>
                </View>
                <Pressable
                  onPress={() => setPoolModalVisible(true)}
                  style={{
                    backgroundColor: colors.primary,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: radius.md,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <MaterialCommunityIcons name="plus" size={16} color="#fff" />
                  <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>Add Bucket</Text>
                </Pressable>
              </Row>

              {/* Pool Metrics Row */}
              <Row style={{ gap: 8, marginTop: 4 }}>
                <View style={{ flex: 1, backgroundColor: colors.surface, padding: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase" }}>Total Pools</Text>
                  <Text style={{ fontSize: 18, fontWeight: "800", color: colors.text }}>
                    {storagePoolsQuery.data?.summary.total_pools ?? 0}
                  </Text>
                </View>

                <View style={{ flex: 1, backgroundColor: colors.surface, padding: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase" }}>Total Files</Text>
                  <Text style={{ fontSize: 18, fontWeight: "800", color: colors.text }}>
                    {storagePoolsQuery.data?.summary.total_files ?? 0}
                  </Text>
                </View>

                <View style={{ flex: 1, backgroundColor: colors.surface, padding: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase" }}>Used Storage</Text>
                  <Text style={{ fontSize: 18, fontWeight: "800", color: colors.primary }}>
                    {formatPoolBytes(storagePoolsQuery.data?.summary.total_used_bytes)}
                  </Text>
                </View>
              </Row>
            </Card>

            {/* List of Storage Pools */}
            {storagePoolsQuery.isLoading ? (
              <View style={{ gap: 8 }}>
                <Skeleton height={100} />
                <Skeleton height={100} />
              </View>
            ) : storagePoolsQuery.isError ? (
              <ErrorState
                detail={(storagePoolsQuery.error as Error).message}
                onRetry={() => storagePoolsQuery.refetch()}
              />
            ) : (storagePoolsQuery.data?.pools ?? []).length === 0 ? (
              <Empty
                title="No storage pools found"
                detail="Add your first Cloudflare R2 bucket to initialize the storage pool."
                actionTitle="+ Add First R2 Bucket"
                onAction={() => setPoolModalVisible(true)}
              />
            ) : (
              (storagePoolsQuery.data?.pools ?? []).map((pool, idx) => (
                <Animated.View key={pool.id} entering={FadeInUp.delay(idx * 60).springify()}>
                  <Card style={{ gap: 10 }}>
                    <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Row style={{ alignItems: "center", gap: 8 }}>
                          <Text style={{ fontSize: 15, fontWeight: "800", color: colors.text }}>
                            {pool.pool_name}
                          </Text>
                          <Pill
                            tone={
                              pool.status === "active"
                                ? "success"
                                : pool.status === "standby"
                                ? "warning"
                                : "default"
                            }
                          >
                            {pool.status.toUpperCase()}
                          </Pill>
                        </Row>
                        <Muted style={{ fontSize: 12 }}>
                          Bucket: {pool.bucket_name} • Priority: {pool.priority}
                        </Muted>
                      </View>

                      {pool.status !== "active" && (
                        <Pressable
                          onPress={() => activatePoolMutation.mutate(pool.id)}
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 5,
                            borderRadius: radius.sm,
                            borderWidth: 1,
                            borderColor: colors.primary,
                          }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>
                            Set Active
                          </Text>
                        </Pressable>
                      )}
                    </Row>

                    {/* Usage Progress Bar */}
                    <View style={{ gap: 4 }}>
                      <Row style={{ justifyContent: "space-between" }}>
                        <Text style={{ fontSize: 11, color: colors.muted }}>Capacity Utilization</Text>
                        <Text style={{ fontSize: 11, fontWeight: "700", color: colors.text }}>
                          {formatPoolBytes(pool.used_bytes)} / {formatPoolBytes(pool.max_capacity_bytes)} ({pool.usage_percent}%)
                        </Text>
                      </Row>
                      <View style={{ height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: "hidden" }}>
                        <View
                          style={{
                            width: `${Math.min(100, pool.usage_percent)}%`,
                            height: "100%",
                            backgroundColor: pool.usage_percent > 90 ? "#EF4444" : colors.primary,
                          }}
                        />
                      </View>
                    </View>

                    <Row style={{ justifyContent: "space-between", alignItems: "center", paddingTop: 4, borderTopWidth: 1, borderTopColor: colors.border }}>
                      <Text style={{ fontSize: 11, color: colors.muted, flex: 1 }} numberOfLines={1}>
                        {pool.public_domain}
                      </Text>

                      <Pressable
                        onPress={() => {
                          Alert.alert("Remove Pool", `Are you sure you want to delete pool ${pool.pool_name}?`, [
                            { text: "Cancel", style: "cancel" },
                            { text: "Delete", style: "destructive", onPress: () => deletePoolMutation.mutate(pool.id) },
                          ]);
                        }}
                        hitSlop={8}
                      >
                        <MaterialCommunityIcons name="trash-can-outline" size={17} color="#EF4444" />
                      </Pressable>
                    </Row>
                  </Card>
                </Animated.View>
              ))
            )}
          </View>
        )}

        {/* Tab Content: System Health */}
        {activeTab === "system" && (
          <View style={{ gap: 14 }}>
            <Card tone="glow" style={{ gap: 10 }}>
              <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <H2>System Health</H2>
                  <Muted>Real-time infrastructure diagnostics for database, cache, and auth.</Muted>
                </View>
                <Pressable
                  onPress={() => systemHealthQuery.refetch()}
                  style={{
                    backgroundColor: colors.primary,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: radius.md,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <MaterialCommunityIcons name="refresh" size={16} color="#fff" />
                  <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>Refresh</Text>
                </Pressable>
              </Row>

              <Row style={{ gap: 8, marginTop: 8 }}>
                <View style={{ flex: 1, backgroundColor: colors.surface, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase" }}>Database</Text>
                  <Text style={{ fontSize: 16, fontWeight: "800", color: systemHealthQuery.data?.database.status === "operational" ? colors.primary : colors.accent }}>
                    {systemHealthQuery.data?.database.status.toUpperCase() ?? "—"}
                  </Text>
                  {systemHealthQuery.data?.database.latencyMs != null && (
                    <Muted style={{ fontSize: 10, marginTop: 2 }}>{systemHealthQuery.data.database.latencyMs}ms latency</Muted>
                  )}
                </View>

                <View style={{ flex: 1, backgroundColor: colors.surface, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase" }}>Redis Cache</Text>
                  <Text style={{ fontSize: 16, fontWeight: "800", color: systemHealthQuery.data?.redis.status === "operational" ? colors.primary : colors.accent }}>
                    {systemHealthQuery.data?.redis.status.toUpperCase() ?? "—"}
                  </Text>
                  {systemHealthQuery.data?.redis.latencyMs != null && (
                    <Muted style={{ fontSize: 10, marginTop: 2 }}>{systemHealthQuery.data.redis.latencyMs}ms latency</Muted>
                  )}
                </View>

                <View style={{ flex: 1, backgroundColor: colors.surface, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase" }}>Auth Service</Text>
                  <Text style={{ fontSize: 16, fontWeight: "800", color: systemHealthQuery.data?.auth.status === "operational" ? colors.primary : colors.accent }}>
                    {systemHealthQuery.data?.auth.status.toUpperCase() ?? "—"}
                  </Text>
                  <Muted style={{ fontSize: 10, marginTop: 2 }}>{systemHealthQuery.data?.auth.failuresLast5Min ?? 0} failures (5m)</Muted>
                </View>
              </Row>

              <Card style={{ gap: 10 }}>
                <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase" }}>Memory Usage</Text>
                    <Text style={{ fontSize: 16, fontWeight: "800", color: colors.text }}>
                      {systemHealthQuery.data?.memory.heapUsedMB?.toFixed(1) ?? 0} MB / {systemHealthQuery.data?.memory.heapTotalMB?.toFixed(1) ?? 0} MB
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted }}>
                    Uptime: {Math.floor((systemHealthQuery.data?.uptimeSeconds ?? 0) / 60)} min
                  </Text>
                </Row>
                <View style={{ height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: "hidden" }}>
                  <View
                    style={{
                      width: systemHealthQuery.data?.memory.heapTotalMB
                        ? `${Math.min(100, (systemHealthQuery.data.memory.heapUsedMB / systemHealthQuery.data.memory.heapTotalMB) * 100)}%`
                        : "0%",
                      height: "100%",
                      backgroundColor: colors.primary,
                    }}
                  />
                </View>
              </Card>

              {systemHealthQuery.data?.database.error && (
                <Card tone="accent" style={{ gap: 6 }}>
                  <Text style={{ color: colors.text, fontSize: 13 }}>DB Error: {systemHealthQuery.data.database.error}</Text>
                </Card>
              )}

              <Button
                title={clearCacheMutation.isPending ? "Clearing…" : "Clear Cache"}
                variant="secondary"
                icon="trash-can-outline"
                onPress={() =>
                  clearCacheMutation.mutate({ target: "dashboard", reason: "Manual cache clear from admin console" })
                }
                disabled={clearCacheMutation.isPending}
                loading={clearCacheMutation.isPending}
              />
            </Card>

            {systemHealthQuery.isLoading ? (
              <Skeleton height={120} />
            ) : systemHealthQuery.isError ? (
              <ErrorState detail={(systemHealthQuery.error as Error).message} onRetry={() => systemHealthQuery.refetch()} />
            ) : null}
          </View>
        )}

        {/* Tab Content: Analytics */}
        {activeTab === "analytics" && (
          <View style={{ gap: 14 }}>
            <Card tone="glow" style={{ gap: 10 }}>
              <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <H2>Platform Analytics</H2>
                  <Muted>30-day engagement and growth metrics across the SkillBridge platform.</Muted>
                </View>
                <Pressable
                  onPress={() => analyticsQuery.refetch()}
                  style={{
                    backgroundColor: colors.primary,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: radius.md,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <MaterialCommunityIcons name="refresh" size={16} color="#fff" />
                  <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>Refresh</Text>
                </Pressable>
              </Row>

              <Row style={{ gap: 8 }}>
                <View style={{ flex: 1, backgroundColor: colors.surface, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase" }}>Total Users</Text>
                  <Text style={{ fontSize: 20, fontWeight: "800", color: colors.text }}>{analyticsQuery.data?.totalUsers ?? 0}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: colors.surface, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase" }}>New Today</Text>
                  <Text style={{ fontSize: 20, fontWeight: "800", color: colors.primary }}>{analyticsQuery.data?.newUsersToday ?? 0}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: colors.surface, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase" }}>DAU</Text>
                  <Text style={{ fontSize: 20, fontWeight: "800", color: colors.accent }}>{analyticsQuery.data?.dauCount ?? 0}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: colors.surface, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase" }}>MAU</Text>
                  <Text style={{ fontSize: 20, fontWeight: "800", color: colors.text }}>{analyticsQuery.data?.mauCount ?? 0}</Text>
                </View>
              </Row>

              <Row style={{ gap: 8, marginTop: 10 }}>
                <View style={{ flex: 1, backgroundColor: colors.surface, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase" }}>Total Rooms</Text>
                  <Text style={{ fontSize: 20, fontWeight: "800", color: colors.text }}>{analyticsQuery.data?.totalRooms ?? 0}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: colors.surface, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase" }}>Active Rooms</Text>
                  <Text style={{ fontSize: 20, fontWeight: "800", color: colors.primary }}>{analyticsQuery.data?.activeRooms ?? 0}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: colors.surface, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase" }}>Completed Sessions</Text>
                  <Text style={{ fontSize: 20, fontWeight: "800", color: colors.accent }}>{analyticsQuery.data?.completedSessions ?? 0}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: colors.surface, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase" }}>Connections</Text>
                  <Text style={{ fontSize: 20, fontWeight: "800", color: colors.text }}>{analyticsQuery.data?.acceptedConnectionRequests ?? 0}</Text>
                </View>
              </Row>
            </Card>

            {analyticsQuery.isLoading ? (
              <Skeleton height={200} />
            ) : analyticsQuery.isError ? (
              <ErrorState detail={(analyticsQuery.error as Error).message} onRetry={() => analyticsQuery.refetch()} />
            ) : null}
          </View>
        )}

        {/* Tab Content: Rooms */}
        {activeTab === "rooms" && (
          <View style={{ gap: 12 }}>
            <TextInput
              style={[styles.searchInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              placeholder="Search rooms by title or topic..."
              placeholderTextColor={colors.muted}
              value={roomSearch}
              onChangeText={setRoomSearch}
            />

            {roomsQuery.isLoading ? (
              <View style={{ gap: 10 }}>
                <Skeleton height={90} />
                <Skeleton height={90} />
              </View>
            ) : (roomsQuery.data?.rooms.length ?? 0) === 0 ? (
              <Empty title="No Rooms Found" detail="Try a different search keyword." />
            ) : (
              roomsQuery.data?.rooms.map((room, idx) => (
                <Animated.View key={room.id} entering={FadeInUp.delay(idx * 60).springify()}>
                  <Card style={{ gap: 8 }}>
                    <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.userName, { color: colors.text }]}>{room.title}</Text>
                        <Muted style={{ fontSize: 12 }}>{room.topic ?? "No topic set"} · {room.visibility}</Muted>
                      </View>
                      <Pill tone={room.status === "active" ? "primary" : "default"}>
                        {room.status.toUpperCase()}
                      </Pill>
                    </Row>

                    <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={{ fontSize: 12, color: colors.muted }}>
                        Members: {room.member_count ?? 0} · Created: {new Date(room.created_at).toLocaleDateString()}
                      </Text>
                      <View style={{ flexDirection: "row", gap: 6 }}>
                        <Pressable
                          style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border }}
                        >
                          <Text style={{ fontSize: 10, fontWeight: "700", color: colors.muted }}>View</Text>
                        </Pressable>
                      </View>
                    </Row>
                  </Card>
                </Animated.View>
              ))
            )}
          </View>
        )}

        {/* Tab Content: Audit Logs */}
        {activeTab === "audit" && (
          <View style={{ gap: 12 }}>
            <TextInput
              style={[styles.searchInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              placeholder="Filter by action (e.g. admin.cache.clear)..."
              placeholderTextColor={colors.muted}
              value={auditActionFilter}
              onChangeText={setAuditActionFilter}
            />

            {auditLogsQuery.isLoading ? (
              <View style={{ gap: 10 }}>
                <Skeleton height={80} />
                <Skeleton height={80} />
              </View>
            ) : (auditLogsQuery.data?.logs.length ?? 0) === 0 ? (
              <Empty title="No Audit Logs" detail="No admin actions recorded yet." />
            ) : (
              auditLogsQuery.data?.logs.map((log, idx) => (
                <Animated.View key={log.id} entering={FadeInUp.delay(idx * 60).springify()}>
                  <Card style={{ gap: 6 }}>
                    <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={[styles.userName, { color: colors.text, fontSize: 13 }]}>{log.action}</Text>
                      <Muted style={{ fontSize: 10 }}>{log.target_type}</Muted>
                    </Row>
                    <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <Muted style={{ fontSize: 11 }}>
                        Actor: {log.actor_id.slice(0, 8)}... · Target: {log.target_id?.slice(0, 8) ?? "—"}
                      </Muted>
                      <Muted style={{ fontSize: 10, color: colors.muted }}>
                        {new Date(log.created_at).toLocaleString()}
                      </Muted>
                    </Row>
                  </Card>
                </Animated.View>
              ))
            )}
          </View>
        )}

        {/* Tab Content: Clubs */}
        {activeTab === "clubs" && (
          <View style={{ gap: 12 }}>
            <TextInput
              style={[styles.searchInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              placeholder="Search clubs by name..."
              placeholderTextColor={colors.muted}
              value={clubSearch}
              onChangeText={setClubSearch}
            />

            {clubsQuery.isLoading ? (
              <View style={{ gap: 10 }}>
                <Skeleton height={90} />
                <Skeleton height={90} />
              </View>
            ) : (clubsQuery.data?.items.length ?? 0) === 0 ? (
              <Empty title="No Clubs Found" detail="Try a different search keyword." />
            ) : (
              clubsQuery.data?.items.map((club, idx) => (
                <Animated.View key={club.id} entering={FadeInUp.delay(idx * 60).springify()}>
                  <Card style={{ gap: 8 }}>
                    <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.userName, { color: colors.text }]}>{club.name}</Text>
                        <Muted style={{ fontSize: 12 }}>
                          {club.category ?? "General"} · {club.membersCount} members
                        </Muted>
                      </View>
                      <Pill tone="primary">{club.lead?.username ? "@" + club.lead.username : "No Lead"}</Pill>
                    </Row>

                    <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={{ fontSize: 12, color: colors.muted }}>
                        Created: {new Date(club.created_at).toLocaleDateString()}
                      </Text>
                      <View style={{ flexDirection: "row", gap: 6 }}>
                        <Pressable
                          style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border }}
                        >
                          <Text style={{ fontSize: 10, fontWeight: "700", color: colors.muted }}>View</Text>
                        </Pressable>
                      </View>
                    </Row>
                  </Card>
                </Animated.View>
              ))
            )}
          </View>
        )}

        {/* Tab Content: API Keys */}
        {activeTab === "apiKeys" && (
          <View style={{ gap: 14 }}>
            {/* LiveKit Free Tier Info Card */}
            <Card tone="glow" style={{ gap: 10 }}>
              <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <H2>LiveKit Free Tier</H2>
                  <Muted>LiveKit Cloud free tier includes 10,000 streaming minutes per month. Usage beyond that is billed at standard rates.</Muted>
                </View>
                <Pressable
                  onPress={() => apiKeysQuery.refetch()}
                  style={{
                    backgroundColor: colors.primary,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: radius.md,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <MaterialCommunityIcons name="refresh" size={16} color="#fff" />
                  <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>Refresh</Text>
                </Pressable>
              </Row>

              <Row style={{ gap: 8, marginTop: 8 }}>
                <View style={{ flex: 1, backgroundColor: colors.surface, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase" }}>Free Monthly Minutes</Text>
                  <Text style={{ fontSize: 22, fontWeight: "800", color: colors.primary }}>{apiKeysQuery.data?.livekitFreeTier.freeMonthlyMinutes?.toLocaleString() ?? 10000}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: colors.surface, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase" }}>Active LiveKit Keys</Text>
                  <Text style={{ fontSize: 22, fontWeight: "800", color: colors.text }}>
                    {(apiKeysQuery.data?.apiKeys.filter((k) => k.service === "livekit" && k.isActive).length ?? 0)}
                  </Text>
                </View>
              </Row>

              <Muted style={{ fontSize: 12, color: colors.muted, marginTop: 6 }}>
                {apiKeysQuery.data?.livekitFreeTier.note}
              </Muted>
            </Card>

            {/* Service Filter */}
            <Row style={{ gap: 6 }}>
              <Pressable
                onPress={() => setApiKeyServiceFilter("all")}
                style={[
                  styles.filterChip,
                  apiKeyServiceFilter === "all" && { backgroundColor: colors.primary },
                ]}
              >
                <Text style={[styles.filterChipText, { color: apiKeyServiceFilter === "all" ? "#fff" : colors.muted }]}>
                  All Services
                </Text>
              </Pressable>
              {["livekit", "gemini", "youtube", "push", "ai", "turn", "other"].map((svc) => (
                <Pressable
                  key={svc}
                  onPress={() => setApiKeyServiceFilter(svc)}
                  style={[
                    styles.filterChip,
                    apiKeyServiceFilter === svc && { backgroundColor: colors.primary },
                  ]}
                >
                  <Text style={[styles.filterChipText, { color: apiKeyServiceFilter === svc ? "#fff" : colors.muted }]}>
                    {svc.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </Row>

            {/* Add New API Key Card */}
            <Card style={{ gap: 12 }}>
              <H2>Add New API Key</H2>
              <Muted>Add multiple API keys per service and switch the active key at any time.</Muted>

              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text, marginBottom: 2 }}>Service</Text>
                <Row style={{ gap: 8 }}>
                  {["livekit", "gemini", "youtube", "push", "ai", "turn", "other"].map((svc) => (
                    <Pressable
                      key={svc}
                      onPress={() =>
                        setNewApiKey((prev) => ({ ...prev, service: svc as any, monthlyLimit: svc === "livekit" ? "10000" : "1000" }))
                      }
                      style={[
                        styles.serviceChip,
                        newApiKey.service === svc && { backgroundColor: colors.primary, borderColor: colors.primary },
                      ]}
                    >
                      <Text style={[
                        styles.serviceChipText,
                        { color: newApiKey.service === svc ? "#fff" : colors.muted },
                      ]}>
                        {svc.toUpperCase()}
                      </Text>
                    </Pressable>
                  ))}
                </Row>
              </View>

              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text, marginBottom: 2 }}>Key Name</Text>
                <AppTextField
                  label="Key Name"
                  placeholder="e.g. LiveKit Production Key"
                  value={newApiKey.keyName}
                  onChangeText={(t) => setNewApiKey((prev) => ({ ...prev, keyName: t }))}
                />
              </View>

              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text, marginBottom: 2 }}>API Key</Text>
                <AppTextField
                  label="API Key"
                  placeholder="sk_live_..."
                  value={newApiKey.apiKey}
                  onChangeText={(t) => setNewApiKey((prev) => ({ ...prev, apiKey: t }))}
                  secureTextEntry
                />
              </View>

              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text, marginBottom: 2 }}>API Secret (optional)</Text>
                <AppTextField
                  label="API Secret (optional)"
                  placeholder="Secret key if required"
                  value={newApiKey.apiSecret}
                  onChangeText={(t) => setNewApiKey((prev) => ({ ...prev, apiSecret: t }))}
                  secureTextEntry
                />
              </View>

              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text, marginBottom: 2 }}>Base URL (optional)</Text>
                <AppTextField
                  label="Base URL (optional)"
                  placeholder="https://api.example.com"
                  value={newApiKey.baseUrl}
                  onChangeText={(t) => setNewApiKey((prev) => ({ ...prev, baseUrl: t }))}
                />
              </View>

              <Row style={{ gap: 10 }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text, marginBottom: 2 }}>Monthly Limit</Text>
                  <AppTextField
                    label="Monthly Limit"
                    placeholder="10000"
                    keyboardType="numeric"
                    value={newApiKey.monthlyLimit}
                    onChangeText={(t) => setNewApiKey((prev) => ({ ...prev, monthlyLimit: t }))}
                  />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text, marginBottom: 2 }}>Enabled</Text>
                  <Pressable
                    style={[
                      styles.toggleSwitch,
                      newApiKey.isEnabled && { backgroundColor: colors.primary },
                    ]}
                    onPress={() => setNewApiKey((prev) => ({ ...prev, isEnabled: !prev.isEnabled }))}
                  >
                    <Text style={[
                      styles.toggleSwitchText,
                      { color: newApiKey.isEnabled ? "#fff" : colors.muted },
                    ]}>
                      {newApiKey.isEnabled ? "ON" : "OFF"}
                    </Text>
                  </Pressable>
                </View>
              </Row>

              <Button
                title={createApiKeyMutation.isPending ? "Adding…" : "Add API Key"}
                variant="primary"
                icon="key-outline"
                onPress={() => createApiKeyMutation.mutate()}
                disabled={
                  createApiKeyMutation.isPending ||
                  !newApiKey.keyName.trim() ||
                  !newApiKey.apiKey.trim() ||
                  !newApiKey.monthlyLimit.trim()
                }
                loading={createApiKeyMutation.isPending}
              />
            </Card>

            {/* API Keys List */}
            <View style={{ gap: 4 }}>
              {apiKeysQuery.isLoading ? (
                <View style={{ gap: 10 }}>
                  <Skeleton height={120} />
                  <Skeleton height={120} />
                </View>
              ) : apiKeysQuery.isError ? (
                <ErrorState detail={(apiKeysQuery.error as Error).message} onRetry={() => apiKeysQuery.refetch()} />
              ) : (apiKeysQuery.data?.apiKeys.length ?? 0) === 0 ? (
                <Empty
                  title="No API Keys"
                  detail="Add your first API key to manage service credentials and limits."
                />
              ) : (
                apiKeysQuery.data?.apiKeys.map((key, idx) => (
                  <Animated.View key={key.id} entering={FadeInUp.delay(idx * 60).springify()}>
                    <Card style={{ gap: 10 }}>
                      <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                        <View style={{ flex: 1, gap: 4 }}>
                          <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                            <Text style={[styles.userName, { color: colors.text }]}>{key.keyName}</Text>
                            <Pill
                              tone={
                                key.isActive ? "success" : key.isEnabled ? "default" : "danger"
                              }
                            >
                              {key.isActive ? "Active" : key.isEnabled ? "Inactive" : "Disabled"}
                            </Pill>
                          </Row>
                          <Muted style={{ fontSize: 12 }}>
                            {key.service.toUpperCase()} · {key.maskedKey}
                            {key.apiSecretSet ? " · Secret set" : ""}
                            {key.baseUrl ? ` · ${key.baseUrl}` : ""}
                          </Muted>
                        </View>
                        <View style={{ flexDirection: "row", gap: 6 }}>
                          {key.isActive ? (
                            <Pressable
                              style={{
                                paddingHorizontal: 8,
                                paddingVertical: 4,
                                borderRadius: radius.sm,
                                borderWidth: 1,
                                borderColor: colors.primary,
                              }}
                            >
                              <Text style={{ fontSize: 10, fontWeight: "700", color: colors.primary }}>
                                Active
                              </Text>
                            </Pressable>
                          ) : (
                            <Pressable
                              onPress={() => switchApiKeyMutation.mutate(key.id)}
                              disabled={switchApiKeyMutation.isPending}
                              style={{
                                paddingHorizontal: 8,
                                paddingVertical: 4,
                                borderRadius: radius.sm,
                                borderWidth: 1,
                                borderColor: colors.accent,
                              }}
                            >
                              <Text style={{ fontSize: 10, fontWeight: "700", color: colors.accent }}>
                                Switch
                              </Text>
                            </Pressable>
                          )}
                          <Pressable
                            onPress={() => {
                              setEditingKeyId(key.id);
                              setEditApiKeyData({
                                keyName: key.keyName,
                                monthlyLimit: key.monthlyLimit.toString(),
                                isEnabled: key.isEnabled,
                              });
                            }}
                            style={{
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                              borderRadius: radius.sm,
                              borderWidth: 1,
                              borderColor: colors.border,
                            }}
                          >
                            <Text style={{ fontSize: 10, fontWeight: "700", color: colors.muted }}>
                              Edit
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => {
                              Alert.alert("Delete API Key", `Are you sure you want to delete "${key.keyName}"?`, [
                                { text: "Cancel", style: "cancel" },
                                { text: "Delete", style: "destructive", onPress: () => deleteApiKeyMutation.mutate(key.id) },
                              ]);
                            }}
                            style={{ paddingHorizontal: 8, paddingVertical: 4 }}
                          >
                            <MaterialCommunityIcons name="trash-can-outline" size={16} color="#EF4444" />
                          </Pressable>
                        </View>
                      </Row>

                      {/* Usage Bar */}
                      <View style={{ gap: 6 }}>
                        <Row style={{ justifyContent: "space-between" }}>
                          <Text style={{ fontSize: 11, color: colors.muted }}>
                            Usage: {key.currentUsage.toLocaleString()} / {key.monthlyLimit.toLocaleString()}
                          </Text>
                          <Text style={{ fontSize: 11, fontWeight: "700", color: colors.text }}>
                            {key.usagePercent}%
                          </Text>
                        </Row>
                        <View style={{ height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: "hidden" }}>
                          <View
                            style={{
                              width: `${Math.min(100, key.usagePercent)}%`,
                              height: "100%",
                              backgroundColor:
                                key.usagePercent > 90 ? "#EF4444" : key.usagePercent > 70 ? colors.accent : colors.primary,
                            }}
                          />
                        </View>
                      </View>

                      {/* Edit Inline (when editing) */}
                      {editingKeyId === key.id && editApiKeyData && (
                        <View style={{ gap: 8, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
                          <View style={{ gap: 8 }}>
                            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text, marginBottom: 2 }}>Key Name</Text>
                            <AppTextField
                              label="Key Name"
                              value={editApiKeyData.keyName}
                              onChangeText={(t: string) =>
                                setEditApiKeyData((prev) => (prev ? { ...prev, keyName: t } : null))
                              }
                            />
                          </View>
                          <Row style={{ gap: 10 }}>
                            <View style={{ flex: 1, gap: 4 }}>
                              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text, marginBottom: 2 }}>
                                Monthly Limit
                              </Text>
                              <AppTextField
                                label="Monthly Limit"
                                keyboardType="numeric"
                                value={editApiKeyData.monthlyLimit}
                                onChangeText={(t: string) =>
                                  setEditApiKeyData((prev) => (prev ? { ...prev, monthlyLimit: t } : null))
                                }
                              />
                            </View>
                            <View style={{ flex: 1, gap: 4 }}>
                              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text, marginBottom: 2 }}>
                                Enabled
                              </Text>
                              <Pressable
                                style={[
                                  styles.toggleSwitch,
                                  editApiKeyData.isEnabled && { backgroundColor: colors.primary },
                                ]}
                                onPress={() =>
                                  setEditApiKeyData((prev) =>
                                    prev ? { ...prev, isEnabled: !prev.isEnabled } : null
                                  )
                                }
                              >
                                <Text style={[
                                  styles.toggleSwitchText,
                                  { color: editApiKeyData.isEnabled ? "#fff" : colors.muted },
                                ]}>
                                  {editApiKeyData.isEnabled ? "ON" : "OFF"}
                                </Text>
                              </Pressable>
                            </View>
                          </Row>
                          <Row style={{ gap: 8, marginTop: 8 }}>
                            <View style={{ flex: 1 }}>
                              <Button
                                title="Save"
                                variant="primary"
                                onPress={() => {
                                  if (!editingKeyId || !editApiKeyData) return;
                                  updateApiKeyMutation.mutate({
                                    id: editingKeyId,
                                    updates: {
                                      keyName: editApiKeyData.keyName.trim(),
                                      monthlyLimit: parseInt(editApiKeyData.monthlyLimit, 10) || 1000,
                                      isEnabled: editApiKeyData.isEnabled,
                                    },
                                  });
                                }}
                                disabled={updateApiKeyMutation.isPending}
                                loading={updateApiKeyMutation.isPending}
                              />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Button
                                title="Cancel"
                                variant="secondary"
                                onPress={() => {
                                  setEditingKeyId(null);
                                  setEditApiKeyData(null);
                                }}
                              />
                            </View>
                          </Row>
                        </View>
                      )}
                    </Card>
                  </Animated.View>
                ))
              )}
            </View>
          </View>
        )}

      </View>

      {/* Modal: Clear Cache */}
      <Modal
        visible={false}
        animationType="none"
        onRequestClose={() => {}}
      >
        <View style={{ flex: 1 }} />
      </Modal>

      {/* Modal: Add R2 Bucket Storage Pool */}
      <Modal
        visible={poolModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPoolModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <Row style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border, justifyContent: "space-between", alignItems: "center" }}>
            <View>
              <H2 style={{ fontSize: 18 }}>Add Cloudflare R2 Bucket</H2>
              <Muted style={{ fontSize: 12 }}>Expand storage pool with automatic rollover</Muted>
            </View>
            <Pressable onPress={() => setPoolModalVisible(false)} hitSlop={8}>
              <MaterialCommunityIcons name="close" size={22} color={colors.text} />
            </Pressable>
          </Row>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
            <View style={{ gap: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text }}>Pool Identifier *</Text>
              <TextInput
                placeholder="e.g. primary-r2-vault or secondary-backup"
                placeholderTextColor={colors.muted}
                value={newPoolName}
                onChangeText={setNewPoolName}
                style={[styles.searchInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              />
            </View>

            <View style={{ gap: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text }}>R2 Bucket Name *</Text>
              <TextInput
                placeholder="e.g. skillbridge-media-pool-2"
                placeholderTextColor={colors.muted}
                value={newBucketName}
                onChangeText={setNewBucketName}
                style={[styles.searchInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              />
            </View>

            <View style={{ gap: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text }}>Cloudflare Account ID *</Text>
              <TextInput
                placeholder="32-character hexadecimal account ID"
                placeholderTextColor={colors.muted}
                value={newAccountId}
                onChangeText={setNewAccountId}
                style={[styles.searchInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              />
            </View>

            <View style={{ gap: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text }}>Public Custom / r2.dev Domain *</Text>
              <TextInput
                placeholder="e.g. https://pub-xxx.r2.dev or https://media.yourdomain.com"
                placeholderTextColor={colors.muted}
                value={newPublicDomain}
                onChangeText={setNewPublicDomain}
                style={[styles.searchInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              />
            </View>

            <View style={{ gap: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text }}>Access Key ID *</Text>
              <TextInput
                placeholder="Cloudflare R2 API Token Access Key"
                placeholderTextColor={colors.muted}
                value={newAccessKeyId}
                onChangeText={setNewAccessKeyId}
                secureTextEntry
                style={[styles.searchInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              />
            </View>

            <View style={{ gap: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text }}>Secret Access Key *</Text>
              <TextInput
                placeholder="Cloudflare R2 API Token Secret"
                placeholderTextColor={colors.muted}
                value={newSecretAccessKey}
                onChangeText={setNewSecretAccessKey}
                secureTextEntry
                style={[styles.searchInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              />
            </View>

            <Row style={{ gap: 10 }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text }}>Max Capacity (GB)</Text>
                <TextInput
                  placeholder="10"
                  placeholderTextColor={colors.muted}
                  value={newMaxCapacityGb}
                  onChangeText={setNewMaxCapacityGb}
                  keyboardType="numeric"
                  style={[styles.searchInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                />
              </View>

              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text }}>Priority</Text>
                <TextInput
                  placeholder="10"
                  placeholderTextColor={colors.muted}
                  value={newPriority}
                  onChangeText={setNewPriority}
                  keyboardType="numeric"
                  style={[styles.searchInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                />
              </View>
            </Row>

            <Row style={{ gap: 10, marginTop: 10 }}>
              <View style={{ flex: 1 }}>
                <Button
                  title={testingConnection ? "Testing..." : "Test Connectivity"}
                  variant="secondary"
                  icon="check-network-outline"
                  onPress={testConnectionMutation}
                  disabled={testingConnection}
                  loading={testingConnection}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Button
                  title="Mount Pool"
                  variant="primary"
                  icon="cloud-upload"
                  onPress={() => createPoolMutation.mutate()}
                  disabled={createPoolMutation.isPending || !newPoolName.trim() || !newBucketName.trim()}
                  loading={createPoolMutation.isPending}
                />
              </View>
            </Row>
          </ScrollView>
        </View>
      </Modal>
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
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "#666666",
    alignItems: "center",
    justifyContent: "center",
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#666666",
  },
  serviceChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "#666666",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 60,
  },
  serviceChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#666666",
  },
  toggleSwitch: {
    width: 44,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#666666",
  },
  toggleSwitchText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#ffffff",
  },
});
