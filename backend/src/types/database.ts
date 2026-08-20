export interface ProfileRow {
  id: string;
  full_name: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
  university: string | null;
  department: string | null;
  batch: string | null;
  roles: string[];
  reputation: number;
  profile_visibility: "public" | "connections" | "private";
  account_status: "active" | "suspended" | "banned" | "deactivated";
  created_at: string;
  updated_at: string;
}

export interface SkillRow {
  id: string;
  name: string;
  category: string;
}

export interface UserSkillWithSkill {
  kind: "known" | "wanted" | "research";
  proficiency: number;
  skills: {
    name: string;
    category?: string;
  };
}

export interface RoomRow {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  topic: string;
  visibility: "public" | "private" | "invite_only";
  mode: "online" | "offline" | "hybrid";
  capacity: number;
  tags: string[];
  rules: string;
  campus_location: string | null;
  status: "open" | "scheduled" | "live" | "completed" | "cancelled";
  created_at: string;
}

export interface ConversationMemberWithConv {
  conversation_id: string;
  last_read_at: string | null;
  last_read_message_id: string | null;
  conversations: {
    id: string;
    title: string | null;
    kind: "dm" | "group" | "room";
    updated_at: string;
  };
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  client_message_id?: string | null;
  reply_to_message_id?: string | null;
  created_at: string;
  edited_at?: string | null;
  soft_deleted?: boolean;
}
