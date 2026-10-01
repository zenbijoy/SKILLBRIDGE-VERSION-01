export type ClubCategory =
  | "Technology"
  | "Academic"
  | "Creative"
  | "Career"
  | "Social"
  | "Sports"
  | "General";

export type ClubMembershipType = "open" | "application" | "invite_only";

export type ClubRole =
  | "owner"
  | "admin"
  | "president"
  | "vice_president"
  | "secretary"
  | "treasurer"
  | "executive"
  | "team_lead"
  | "moderator"
  | "member";

export type ClubPostType =
  | "announcement"
  | "discussion"
  | "question"
  | "achievement"
  | "project_update"
  | "event_update"
  | "resource";

export type ApplicationStatus =
  | "applied"
  | "shortlisted"
  | "interview"
  | "selected"
  | "rejected"
  | "withdrawn";

export type ProjectStatus = "idea" | "planning" | "active" | "completed" | "archived";

export interface ClubItem {
  id: string;
  name: string;
  tagline?: string | null;
  description?: string;
  university?: string;
  department?: string | null;
  category?: string;
  verified?: boolean;
  logo_url?: string | null;
  banner_url?: string | null;
  room_id?: string;
  membership_type?: ClubMembershipType;
  member_count?: number;
  follower_count?: number;
  is_member?: boolean;
  is_following?: boolean;
  my_role?: ClubRole | null;
  recommendation_reason?: string;
  next_event?: {
    id: string;
    title: string;
    starts_at: string;
  } | null;
}

export interface ClubDetail extends ClubItem {
  founded_year?: number | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  social_links?: Record<string, string>;
  mission?: string | null;
  vision?: string | null;
  activities_summary?: string | null;
  my_title?: string | null;
  latest_announcement?: {
    id: string;
    title?: string | null;
    content: string;
    created_at: string;
    is_pinned: boolean;
  } | null;
  members?: ClubMember[];
  events?: ClubEvent[];
  projects?: ClubProject[];
}

export interface ClubMember {
  user_id: string;
  role: ClubRole;
  title?: string | null;
  joined_at: string;
  is_active?: boolean;
  profiles?: {
    id: string;
    full_name: string;
    username: string;
    avatar_url?: string | null;
    department?: string | null;
    bio?: string | null;
  };
}

export interface ClubPost {
  id: string;
  club_id: string;
  author_id: string;
  type: ClubPostType;
  title?: string | null;
  content: string;
  media_urls?: string[];
  is_pinned: boolean;
  likes_count: number;
  comments_count: number;
  is_liked?: boolean;
  created_at: string;
  updated_at?: string;
  author?: {
    id: string;
    full_name: string;
    username: string;
    avatar_url?: string | null;
    department?: string | null;
  };
}

export interface ClubPostComment {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author?: {
    id: string;
    full_name: string;
    username: string;
    avatar_url?: string | null;
  };
}

export interface ClubEvent {
  id: string;
  club_id: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at?: string | null;
  location?: string;
  online_url?: string | null;
  venue_type?: "offline" | "online" | "hybrid";
  capacity?: number | null;
  poster_url?: string | null;
  attendance_code?: string | null;
  is_registered?: boolean;
  speakers?: Array<{ name: string; title: string; avatar?: string }>;
  agenda?: Array<{ time: string; activity: string }>;
  tags?: string[];
  status?: string;
}

export interface ClubRecruitment {
  id: string;
  club_id: string;
  title: string;
  description: string;
  open_positions: string[];
  required_skills: string[];
  eligible_departments: string[];
  eligible_semesters?: string[];
  deadline: string;
  stages?: string[];
  status: "open" | "closed" | "draft";
  form_schema?: any[];
  my_application?: {
    recruitment_id: string;
    status: ApplicationStatus;
    applied_position: string;
    created_at: string;
  } | null;
}

export interface ClubApplication {
  id: string;
  club_id: string;
  recruitment_id?: string;
  user_id: string;
  applied_position: string;
  statement?: string | null;
  resume_url?: string | null;
  portfolio_url?: string | null;
  answers?: Record<string, any>;
  status: ApplicationStatus;
  review_notes?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  applicant?: {
    id: string;
    full_name: string;
    username: string;
    avatar_url?: string | null;
    department?: string | null;
    bio?: string | null;
  };
}

export interface ClubTeam {
  id: string;
  club_id: string;
  name: string;
  description?: string | null;
  lead_id?: string | null;
  lead?: {
    id: string;
    full_name: string;
    username: string;
    avatar_url?: string | null;
  } | null;
}

export interface ClubProject {
  id: string;
  club_id: string;
  team_id?: string | null;
  title: string;
  description: string;
  status: ProjectStatus;
  start_date?: string;
  deadline?: string | null;
  lead_id?: string | null;
  cover_url?: string | null;
  repository_url?: string | null;
  demo_url?: string | null;
  lead?: {
    id: string;
    full_name: string;
    username: string;
    avatar_url?: string | null;
  } | null;
  team?: {
    id: string;
    name: string;
  } | null;
}

export interface ClubProjectTask {
  id: string;
  project_id: string;
  title: string;
  description?: string | null;
  assigned_to?: string | null;
  priority: "low" | "medium" | "high";
  status: "todo" | "in_progress" | "completed";
  due_date?: string | null;
  assignee?: {
    id: string;
    full_name: string;
    username: string;
    avatar_url?: string | null;
  } | null;
}

export interface ClubResource {
  id: string;
  club_id: string;
  project_id?: string | null;
  uploader_id: string;
  title: string;
  description?: string | null;
  url: string;
  storage_path?: string | null;
  file_size?: number | null;
  file_type: string;
  category: string;
  permission: "public" | "followers" | "members" | "team";
  created_at: string;
  uploader?: {
    id: string;
    full_name: string;
    username: string;
  };
}

export interface ClubAchievement {
  id: string;
  club_id: string;
  title: string;
  description: string;
  date: string;
  image_url?: string | null;
  link_url?: string | null;
}

export interface ClubAnalytics {
  memberCount: number;
  followerCount: number;
  pendingApplicationsCount: number;
  activeProjectsCount: number;
  totalEventsCount: number;
  totalPostsCount: number;
}
