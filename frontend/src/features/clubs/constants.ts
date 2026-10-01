import type { ClubCategory, ClubPostType, ClubRole, ProjectStatus } from "./types";

export const CLUB_CATEGORIES: {
  id: ClubCategory;
  key: ClubCategory;
  label: string;
  icon: string;
  color: string;
  bgLight: string;
  bgDark: string;
}[] = [
  {
    id: "Technology",
    key: "Technology",
    label: "Technology & Code",
    icon: "laptop",
    color: "#2563EB",
    bgLight: "#EFF6FF",
    bgDark: "#1E293B",
  },
  {
    id: "Academic",
    key: "Academic",
    label: "Academic & Science",
    icon: "school-outline",
    color: "#059669",
    bgLight: "#ECFDF5",
    bgDark: "#064E3B",
  },
  {
    id: "Creative",
    key: "Creative",
    label: "Creative & Arts",
    icon: "color-palette-outline",
    color: "#7C3AED",
    bgLight: "#F5F3FF",
    bgDark: "#2E1065",
  },
  {
    id: "Career",
    key: "Career",
    label: "Career & Leadership",
    icon: "briefcase-outline",
    color: "#EA580C",
    bgLight: "#FFF7ED",
    bgDark: "#431407",
  },
  {
    id: "Social",
    key: "Social",
    label: "Social & Community",
    icon: "people-outline",
    color: "#0891B2",
    bgLight: "#ECFEFF",
    bgDark: "#164E63",
  },
  {
    id: "Sports",
    key: "Sports",
    label: "Sports & Athletics",
    icon: "trophy-outline",
    color: "#D97706",
    bgLight: "#FFFBEB",
    bgDark: "#451A03",
  },
  {
    id: "General",
    key: "General",
    label: "General Clubs",
    icon: "compass-outline",
    color: "#4B5563",
    bgLight: "#F3F4F6",
    bgDark: "#1F2937",
  },
];

export const POST_TYPE_CONFIG: Record<
  ClubPostType,
  { label: string; icon: string; color: string; bgLight: string; bgDark: string }
> = {
  announcement: {
    label: "Announcement",
    icon: "bullhorn-outline",
    color: "#DC2626",
    bgLight: "#FEF2F2",
    bgDark: "#450A0A",
  },
  discussion: {
    label: "Discussion",
    icon: "comment-text-multiple-outline",
    color: "#2563EB",
    bgLight: "#EFF6FF",
    bgDark: "#1E293B",
  },
  question: {
    label: "Question",
    icon: "help-circle-outline",
    color: "#EA580C",
    bgLight: "#FFF7ED",
    bgDark: "#431407",
  },
  achievement: {
    label: "Achievement",
    icon: "star-circle-outline",
    color: "#F59E0B",
    bgLight: "#FFFBEB",
    bgDark: "#451A03",
  },
  project_update: {
    label: "Project",
    icon: "rocket-launch-outline",
    color: "#7C3AED",
    bgLight: "#F5F3FF",
    bgDark: "#2E1065",
  },
  event_update: {
    label: "Event",
    icon: "calendar-star",
    color: "#059669",
    bgLight: "#ECFDF5",
    bgDark: "#064E3B",
  },
  resource: {
    label: "Resource",
    icon: "file-document-outline",
    color: "#0891B2",
    bgLight: "#ECFEFF",
    bgDark: "#164E63",
  },
};

export const ROLE_CONFIG: Record<
  ClubRole,
  { label: string; color: string; bgLight: string; bgDark: string; isLeadership: boolean }
> = {
  owner: {
    label: "Founder",
    color: "#7C3AED",
    bgLight: "#F5F3FF",
    bgDark: "#2E1065",
    isLeadership: true,
  },
  president: {
    label: "President",
    color: "#2563EB",
    bgLight: "#EFF6FF",
    bgDark: "#1E293B",
    isLeadership: true,
  },
  vice_president: {
    label: "Vice President",
    color: "#0284C7",
    bgLight: "#F0F9FF",
    bgDark: "#0C4A6E",
    isLeadership: true,
  },
  admin: {
    label: "Admin",
    color: "#4F46E5",
    bgLight: "#EEF2FF",
    bgDark: "#1E1B4B",
    isLeadership: true,
  },
  secretary: {
    label: "Secretary",
    color: "#059669",
    bgLight: "#ECFDF5",
    bgDark: "#064E3B",
    isLeadership: true,
  },
  treasurer: {
    label: "Treasurer",
    color: "#D97706",
    bgLight: "#FFFBEB",
    bgDark: "#451A03",
    isLeadership: true,
  },
  executive: {
    label: "Executive",
    color: "#0891B2",
    bgLight: "#ECFEFF",
    bgDark: "#164E63",
    isLeadership: true,
  },
  team_lead: {
    label: "Team Lead",
    color: "#EA580C",
    bgLight: "#FFF7ED",
    bgDark: "#431407",
    isLeadership: true,
  },
  moderator: {
    label: "Moderator",
    color: "#4B5563",
    bgLight: "#F3F4F6",
    bgDark: "#1F2937",
    isLeadership: false,
  },
  member: {
    label: "Member",
    color: "#6B7280",
    bgLight: "#F9FAFB",
    bgDark: "#111827",
    isLeadership: false,
  },
};

export const PROJECT_STATUS_CONFIG: Record<
  ProjectStatus,
  { label: string; color: string; bg: string }
> = {
  idea: { label: "Idea", color: "#6B7280", bg: "#F3F4F6" },
  planning: { label: "Planning", color: "#0284C7", bg: "#E0F2FE" },
  active: { label: "In Progress", color: "#059669", bg: "#D1FAE5" },
  completed: { label: "Completed", color: "#7C3AED", bg: "#EDE9FE" },
  archived: { label: "Archived", color: "#9CA3AF", bg: "#F3F4F6" },
};

export const RECRUITMENT_STAGES = [
  "applied",
  "shortlisted",
  "interview",
  "selected",
  "rejected",
] as const;

export const APPLICATION_STATUS_LABELS: Record<string, string> = {
  applied: "Applied",
  shortlisted: "Shortlisted",
  interview: "Interview",
  selected: "Selected / Offered",
  rejected: "Declined",
  withdrawn: "Withdrawn",
};

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  idea: "Idea",
  planning: "Planning",
  active: "In Progress",
  completed: "Completed",
  archived: "Archived",
};

export const CLUB_ROLES: { id: ClubRole; label: string }[] = [
  { id: "owner", label: "Owner / Founder" },
  { id: "president", label: "President" },
  { id: "vice_president", label: "Vice President" },
  { id: "admin", label: "Administrator" },
  { id: "secretary", label: "Secretary" },
  { id: "treasurer", label: "Treasurer" },
  { id: "executive", label: "Executive Member" },
  { id: "team_lead", label: "Team Lead" },
  { id: "moderator", label: "Moderator" },
  { id: "member", label: "Member" },
];
