import { MaterialCommunityIcons } from "@expo/vector-icons";

export type RoleTier = "owner" | "admin" | "teacher" | "moderator" | "member" | "guest";

export interface RoleConfigItem {
  id: RoleTier;
  name: string;
  badgeLabel: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  level: number;
  color: string;
  bgColor: string;
  desc: string;
  capabilities: string[];
}

export const ROLE_HIERARCHY: Record<RoleTier, number> = {
  owner: 5,
  admin: 4,
  teacher: 4,
  moderator: 3,
  member: 2,
  guest: 1,
};

export const ROLE_CONFIGS: Record<RoleTier, RoleConfigItem> = {
  owner: {
    id: "owner",
    name: "Room Owner",
    badgeLabel: "OWNER",
    icon: "crown",
    level: 5,
    color: "#F59E0B",
    bgColor: "rgba(245, 158, 11, 0.14)",
    desc: "Complete sovereignty. Can edit room settings, appoint admins and teachers, transfer sovereignty, or archive room.",
    capabilities: [
      "Launch live audio/video classroom anytime",
      "Assign and revoke any member role",
      "Transfer room sovereignty to any member",
      "Manage attendance, roll call, and CSV exports",
      "Admit or decline knocking visitors",
      "Pin important formulas and broadcast notices",
    ],
  },
  admin: {
    id: "admin",
    name: "Room Admin",
    badgeLabel: "ADMIN",
    icon: "shield-crown",
    level: 4,
    color: "#6366F1",
    bgColor: "rgba(99, 102, 241, 0.14)",
    desc: "Co-manager of room operations. Can appoint teachers, configure modules, moderate chat, and admit students from lobby.",
    capabilities: [
      "Launch live audio/video classroom",
      "Appoint and manage teachers, moderators, and students",
      "Review and admit knock lobby requests",
      "Moderate classroom and remove disruptive members",
      "Manage attendance and export student records",
      "Broadcast official room announcements",
    ],
  },
  teacher: {
    id: "teacher",
    name: "Teacher / Instructor",
    badgeLabel: "TEACHER",
    icon: "school",
    level: 4,
    color: "#3B82F6",
    bgColor: "rgba(59, 130, 246, 0.14)",
    desc: "Academic leader. Can launch live classes, take roll call, answer doubt questions, schedule lectures, and manage attendance.",
    capabilities: [
      "Launch live audio and video lecture sessions",
      "Schedule upcoming classroom events and syllabus",
      "Take interactive live roll call and mark attendance",
      "Answer, highlight, and accept student doubt questions",
      "Receive 1:1 direct audio/video calls from students",
      "Admit students knocking at the classroom lobby",
    ],
  },
  moderator: {
    id: "moderator",
    name: "Teaching Assistant / Mod",
    badgeLabel: "MODERATOR",
    icon: "shield-account",
    level: 3,
    color: "#8B5CF6",
    bgColor: "rgba(139, 92, 246, 0.14)",
    desc: "Classroom order and assistance. Helps teachers review reports, mute disruptive users, and pin lecture notes.",
    capabilities: [
      "Review knocking students in the lobby",
      "Mute disruptive participants in room chat",
      "Pin essential formulas, files, and cheat sheets",
      "Assist teacher in fielding questions",
    ],
  },
  member: {
    id: "member",
    name: "Enrolled Student",
    badgeLabel: "STUDENT",
    icon: "account-school",
    level: 2,
    color: "#10B981",
    bgColor: "rgba(16, 185, 129, 0.14)",
    desc: "Active student. Can join live lectures when teacher starts, ask questions, submit assignments, and call teachers.",
    capabilities: [
      "Join live audio/video session when teacher begins",
      "Request immediate live help or sessions from teachers",
      "Make direct 1:1 voice or video calls to room teachers",
      "Submit questions and participate in class Q&A",
      "Use in-room Pomodoro study timer and scratchpad",
    ],
  },
  guest: {
    id: "guest",
    name: "Guest Auditor",
    badgeLabel: "GUEST",
    icon: "eye-outline",
    level: 1,
    color: "#64748B",
    bgColor: "rgba(100, 116, 139, 0.14)",
    desc: "Auditor access. Can browse room public materials and announcements in read-only mode.",
    capabilities: [
      "Browse public syllabus and course materials",
      "Read announcements in read-only mode",
    ],
  },
};

export const PERMISSIONS_MATRIX_LIST = [
  {
    key: "start_live",
    title: "Start Live Video & Audio Class",
    icon: "video-vintage" as const,
    roles: ["owner", "admin", "teacher"] as RoleTier[],
  },
  {
    key: "schedule_class",
    title: "Schedule Classroom Sessions",
    icon: "calendar-clock" as const,
    roles: ["owner", "admin", "teacher"] as RoleTier[],
  },
  {
    key: "direct_call_target",
    title: "Receive Direct 1:1 Student Calls",
    icon: "phone-incoming" as const,
    roles: ["owner", "admin", "teacher"] as RoleTier[],
  },
  {
    key: "roll_call",
    title: "Live Roll Call & Attendance Tracking",
    icon: "clipboard-check-outline" as const,
    roles: ["owner", "admin", "teacher"] as RoleTier[],
  },
  {
    key: "manage_doubts",
    title: "Resolve & Answer Student Doubts",
    icon: "frequently-asked-questions" as const,
    roles: ["owner", "admin", "teacher"] as RoleTier[],
  },
  {
    key: "knock_approvals",
    title: "Review & Admit Lobby Knock Requests",
    icon: "door-sliding-lock" as const,
    roles: ["owner", "admin", "teacher", "moderator"] as RoleTier[],
  },
  {
    key: "broadcast_notice",
    title: "Dispatch Official Announcements",
    icon: "bullhorn" as const,
    roles: ["owner", "admin", "teacher", "moderator"] as RoleTier[],
  },
  {
    key: "pin_content",
    title: "Pin Lecture Notes & Materials",
    icon: "pin" as const,
    roles: ["owner", "admin", "teacher", "moderator"] as RoleTier[],
  },
  {
    key: "manage_roles",
    title: "Promote / Appoint Teachers & Staff",
    icon: "shield-crown" as const,
    roles: ["owner", "admin"] as RoleTier[],
  },
  {
    key: "transfer_owner",
    title: "Transfer Sovereignty & Ownership",
    icon: "crown" as const,
    roles: ["owner"] as RoleTier[],
  },
  {
    key: "request_session",
    title: "Request Live Class / Instant Help",
    icon: "hand-wave" as const,
    roles: ["member", "guest"] as RoleTier[],
  },
];

/**
 * Checks if actor has sufficient rank to manage target member
 */
export function canActorManageTargetRole(
  actorRole: RoleTier | string | null | undefined,
  isOwner: boolean,
  targetCurrentRole: RoleTier | string | null | undefined,
  newRole?: RoleTier,
): { allowed: boolean; reason?: string } {
  if (isOwner) {
    if (newRole === "owner") return { allowed: true };
    return { allowed: true };
  }

  const actorLevel = ROLE_HIERARCHY[(actorRole as RoleTier) || "member"] || 0;
  if (actorLevel < 4) {
    return { allowed: false, reason: "Only room admins or owner can manage member roles." };
  }

  const targetLevel = ROLE_HIERARCHY[(targetCurrentRole as RoleTier) || "member"] || 0;
  if (targetLevel >= actorLevel) {
    return { allowed: false, reason: "You cannot modify a member with equal or higher rank." };
  }

  if (newRole) {
    const newRoleLevel = ROLE_HIERARCHY[newRole] || 0;
    if (newRoleLevel >= actorLevel) {
      return { allowed: false, reason: "You cannot promote a member to your rank or higher." };
    }
  }

  return { allowed: true };
}

/**
 * Returns list of roles this actor is authorized to assign
 */
export function getAssignableRolesForActor(
  actorRole: RoleTier | string | null | undefined,
  isOwner: boolean,
): RoleTier[] {
  if (isOwner) {
    return ["admin", "teacher", "moderator", "member", "guest"];
  }
  const actorLevel = ROLE_HIERARCHY[(actorRole as RoleTier) || "member"] || 0;
  if (actorLevel >= 4) {
    // Admin can assign teachers, moderators, members, guests
    return ["teacher", "moderator", "member", "guest"];
  }
  return [];
}
