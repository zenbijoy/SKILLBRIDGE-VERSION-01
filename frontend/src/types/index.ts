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
}
export interface Dashboard {
  urgentRooms: Room[];
  recommendedPeople: Profile[];
  upcomingSessions: Session[];
  events: EventItem[];
  stats: {
    reputation: number;
    connections: number;
    sessionsTaught: number;
    sessionsAttended: number;
  };
}
