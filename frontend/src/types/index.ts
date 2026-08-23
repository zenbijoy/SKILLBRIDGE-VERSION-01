export type UserRole =
  | "student"
  | "peer_tutor"
  | "club_admin"
  | "researcher"
  | "moderator"
  | "admin";

export type RoomMode = "online" | "offline" | "hybrid";

export interface Profile {
  id: string;
  full_name: string;
  username: string;
  avatar_url?: string | null;
  bio?: string | null;
  university?: string | null;
  department?: string | null;
  batch?: string | null;
  roles: UserRole[];
  reputation: number;
  profile_visibility: "public" | "connections" | "private";
  study_mode_preference?: RoomMode;
  preferred_locale?: "en" | "bn";
  onboarding_version?: number;
  onboarding_status?: "not_started" | "in_progress" | "completed" | "skipped";
  onboarding_step?: string;
  onboarding_completed?: boolean;
  onboarding_mission?: "learn" | "teach" | "both" | "research";
  onboarding_push_opt_in?: boolean;
  profile_completion_percent?: number;
  profile_missing_fields?: string[];
  guided_tour_version?: number;
  guided_tour_status?: "pending" | "in_progress" | "completed" | "skipped";
  guided_tour_last_step?: string;
  timezone?: string;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
}

export interface Skill {
  id: string;
  name: string;
  category: string;
}

export interface Room {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  topic: string;
  visibility: "public" | "private" | "invite_only";
  mode: RoomMode;
  member_count: number;
  capacity: number;
  scheduled_at?: string | null;
  campus_location?: string | null;
  tags: string[];
  status: "open" | "scheduled" | "live" | "completed" | "cancelled";
  conversation_id?: string | null;
}

export interface Session {
  id: string;
  room_id: string;
  teacher_id: string;
  starts_at: string;
  ends_at?: string | null;
  mode: RoomMode;
  meeting_url?: string | null;
  campus_location?: string | null;
  status: string;
  recording_url?: string | null;
  recording_video_id?: string | null;
  recording_provider?: "youtube" | "google_drive" | "r2" | "custom" | null;
  recording_status?: "none" | "recording" | "uploading" | "ready" | "failed" | null;
  recording_duration_seconds?: number | null;
}

export interface EventItem {
  id: string;
  club_id: string;
  title: string;
  description: string;
  starts_at: string;
  location?: string | null;
  online_url?: string | null;
  capacity?: number | null;
  application_required: boolean;
  status: string;
}

export interface Conversation {
  id: string;
  title?: string | null;
  kind: "dm" | "group" | "room";
  updated_at: string;
  unread_count?: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  edited_at?: string | null;
  attachment?: {
    url: string;
    type: string;
    name?: string;
    size?: number;
  } | null;
}

export interface DashboardWidget {
  widget_key: string;
  visible: boolean;
  order: number;
  is_required: boolean;
  title_en: string;
  title_bn: string;
}

export interface DashboardAnnouncement {
  id: string;
  title_en: string;
  title_bn: string;
  body_en: string;
  body_bn: string;
  tone: "info" | "warning" | "success" | "accent";
  action_url?: string | null;
  action_label_en?: string | null;
  action_label_bn?: string | null;
  is_dismissible: boolean;
  target_roles?: string[];
  target_campus?: string | null;
  starts_at: string;
  ends_at?: string | null;
}

export interface Dashboard {
  layout: {
    preset: "learner" | "tutor" | "researcher" | "community" | "balanced" | "custom";
    density: "compact" | "comfortable" | "spacious";
    widgets: DashboardWidget[];
  };
  featureFlags: Record<string, boolean>;
  announcements: DashboardAnnouncement[];
  profileQuest: {
    completionPercent: number;
    missingFields: string[];
    guidedTourStatus: "pending" | "in_progress" | "completed" | "skipped";
    guidedTourVersion: number;
    guidedTourLastStep: string;
  };
  urgentRooms: Room[];
  recommendedPeople: Profile[];
  upcomingSessions: Session[];
  events: EventItem[];
  researchProjects: {
    id: string;
    title: string;
    description?: string | null;
    research_areas?: string[];
    looking_for_collaborators?: boolean;
    owner_id?: string;
  }[];
  stats: {
    reputation: number;
    connections: number;
    sessionsTaught: number;
    sessionsAttended: number;
  };
}
