export type AccountStatus = "active" | "deactivated" | "suspended" | "banned";
export type ReportStatus = "open" | "reviewing" | "resolved" | "dismissed";

export interface AdminProfile {
  id: string;
  full_name: string;
  username?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  university?: string | null;
  department?: string | null;
  batch?: string | null;
  roles: string[];
  reputation: number;
  account_status: AccountStatus;
  created_at: string;
  updated_at?: string;
}

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalRooms: number;
  activeSessions: number;
  totalReports: number;
  pendingReports: number;
  recentActivity: Array<{
    id: string;
    action: string;
    targetType?: string | null;
    targetId?: string | null;
    timestamp: string;
  }>;
}

export interface AdminReport {
  id: string;
  reporter_id: string;
  target_type: "user" | "message" | "room" | "event" | "resource";
  target_id: string;
  target_user_id?: string | null;
  reason: string;
  details?: string | null;
  status: ReportStatus;
  action?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
}

export interface AuditLog {
  id: number | string;
  actor_id?: string | null;
  action: string;
  target_type: string;
  target_id?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface UserDetail {
  profile: AdminProfile;
  skills: Array<{
    kind: string;
    proficiency: number;
    verified: boolean;
    skill?: { id: string; name: string; category: string } | null;
  }>;
  rooms: Array<{
    role: string;
    joined_at: string;
    room?: { id: string; title: string; status: string; visibility: string; topic?: string | null } | null;
  }>;
  sessions: Array<{
    status?: string | null;
    attendance_status?: string | null;
    session?: { id: string; starts_at: string; ends_at?: string | null; status: string; mode: string; room_id: string } | null;
  }>;
  activity: AuditLog[];
}

export interface SystemInfo {
  environment: string;
  api: { status: string; port: number; startedAt: string; uptimeSeconds: number };
  database: { status: string };
  capabilities: { redis: boolean; livekit: boolean; push: boolean; ai: boolean };
  runtimePolicy: {
    maxRoomCapacity: number;
    maintenanceMode: boolean;
    globalRateLimitPerMinute: number;
  };
}

export interface SystemHealthData {
  timestamp: string;
  server: {
    uptimeSeconds: number;
    startedAt: string;
    isRecentRestart: boolean;
    nodeVersion: string;
    environment: string;
  };
  memory: {
    rssMB: number;
    heapTotalMB: number;
    heapUsedMB: number;
    externalMB: number;
  };
  rateLimit: {
    globalLimitPerMinute: number;
  };
  services: {
    database: {
      status: "operational" | "degraded" | "unconfigured";
      latencyMs: number | null;
      error: string | null;
    };
    redis: {
      status: "operational" | "degraded" | "disabled";
      latencyMs: number | null;
      metrics: {
        status: string;
        configured: boolean;
      };
    };
    auth: {
      status: "operational" | "degraded";
      failuresLast5Min: number;
      failuresPerMinute: number;
      isAuthDegraded: boolean;
    };
    socketio: {
      status: string;
    };
    push: {
      status: "configured" | "unconfigured";
    };
    livekit: {
      status: "configured" | "unconfigured";
    };
    ai: {
      status: "configured" | "unconfigured";
    };
  };
  issues: string[];
  healthy: boolean;
}

