import type { Profile } from "@/types";

export type PostType =
  | "standard"
  | "text_art"
  | "question"
  | "poll"
  | "achievement"
  | "announcement"
  | "study_note"
  | "event"
  | "opportunity"
  | "project"
  | "code"
  | "quote"
  | "resource"
  | "gallery"
  | "video"
  | "document"
  | "youtube";

export type PostVisibility =
  | "public"
  | "university"
  | "department"
  | "section"
  | "club"
  | "connections"
  | "only_me";

export type ReactionType =
  | "like"
  | "love"
  | "insightful"
  | "celebrate"
  | "curious"
  | "sad";

export interface PostAppearance {
  theme?:
    | "default"
    | "midnight"
    | "ocean"
    | "aurora"
    | "sunset"
    | "lavender"
    | "mint"
    | "coral"
    | "gold"
    | "sky"
    | "minimal"
    | "academic"
    | "tech";
  backgroundType?: "solid" | "gradient" | "mesh" | "glass" | "pattern";
  backgroundValue?: string;
  textColor?: string;
  alignment?: "left" | "center" | "right";
}

export interface ContentBlock {
  type: "paragraph" | "heading" | "quote" | "code" | "list" | "formula" | "divider";
  content?: string;
  level?: number;
  language?: string;
  ordered?: boolean;
  items?: string[];
}

export interface PostPollOption {
  id: string;
  poll_id?: string;
  option_text: string;
  image_url?: string | null;
  display_order?: number;
  votes_count: number;
}

export interface PostPoll {
  id: string;
  post_id?: string;
  question: string;
  is_multiple: boolean;
  is_anonymous: boolean;
  expires_at?: string | null;
  total_votes: number;
  options: PostPollOption[];
  user_voted_options?: string[];
  has_voted?: boolean;
}

export interface PostEventMetadata {
  title: string;
  description?: string;
  date: string;
  start_time: string;
  end_time?: string;
  location: string;
  is_online: boolean;
  meeting_url?: string;
  cover_image?: string;
  organizer?: string;
  registration_url?: string;
  max_participants?: number;
}

export interface PostOpportunityMetadata {
  title: string;
  organization: string;
  type: "internship" | "scholarship" | "job" | "competition" | "hackathon" | "workshop" | "research";
  deadline?: string;
  location: string;
  is_remote: boolean;
  link?: string;
  tags?: string[];
}

export interface PostAchievementMetadata {
  badge?: string;
  title: string;
  skill_name?: string;
  certificate_url?: string;
  date?: string;
  link?: string;
}

export interface PostQuestionMetadata {
  topic?: string;
  allow_answers: boolean;
  is_resolved?: boolean;
  accepted_answer_id?: string | null;
}

export interface PostStudyNoteMetadata {
  subject: string;
  key_ideas: string[];
  references?: string;
  topic_tags?: string[];
}

export interface PostCodeMetadata {
  language: string;
  code: string;
  title?: string;
}

export interface PostQuoteMetadata {
  quote: string;
  author: string;
  source?: string;
}

export interface LinkMetadata {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  site_name: string | null;
}

export interface PostMention {
  id: string;
  username: string;
  full_name: string;
  avatar_url?: string | null;
}

export interface PostAttachment {
  id: string;
  url: string;
  media_type?: "image" | "video" | "document" | "youtube" | "resource_link";
  mime_type?: string;
  file_size_bytes?: number;
  thumbnail_url?: string | null;
  sort_order?: number;
  metadata?: Record<string, unknown>;
}

export interface SocialPost {
  id: string;
  author_id: string | null;
  author: Profile;
  body: string;
  post_type: PostType;
  appearance?: PostAppearance;
  structured_content?: { blocks: ContentBlock[] };
  type_metadata?: {
    event?: PostEventMetadata;
    opportunity?: PostOpportunityMetadata;
    achievement?: PostAchievementMetadata;
    question?: PostQuestionMetadata;
    study_note?: PostStudyNoteMetadata;
    code?: PostCodeMetadata;
    quote?: PostQuoteMetadata;
    link_preview?: LinkMetadata;
    [key: string]: unknown;
  };
  visibility: PostVisibility;
  club_id?: string | null;
  department?: string | null;
  section?: string | null;
  is_anonymous: boolean;
  anonymous_handle?: string | null;
  media_urls: string[];
  attachments?: PostAttachment[];
  youtube?: {
    videoId: string;
    title: string;
    thumbnailUrl: string;
    durationSeconds?: number | null;
  };
  poll?: PostPoll | null;
  mentions?: PostMention[];
  hashtags?: string[];
  likes_count: number;
  comments_count: number;
  shares_count: number;
  saves_count: number;
  pinned: boolean;
  is_edited?: boolean;
  edited_at?: string | null;
  is_saved?: boolean;
  my_reaction?: ReactionType | null;
  created_at: string;
  updated_at?: string;
}

export interface PostComment {
  id: string;
  post_id: string;
  author_id: string | null;
  author: Profile;
  body: string;
  parent_id?: string | null;
  media_url?: string | null;
  likes_count?: number;
  is_anonymous: boolean;
  anonymous_handle?: string | null;
  my_reaction?: string | null;
  created_at: string;
  replies?: PostComment[];
}

export interface PostDraft {
  id?: string;
  post_type: PostType;
  title?: string | null;
  body: string;
  appearance?: PostAppearance;
  structured_content?: { blocks: ContentBlock[] };
  type_metadata?: Record<string, unknown>;
  attachments?: Array<{ url: string; mediaObjectId?: string; mimeType?: string }>;
  visibility: PostVisibility;
  is_anonymous: boolean;
  poll?: {
    question: string;
    options: string[];
    is_multiple: boolean;
    is_anonymous: boolean;
  };
  updated_at?: string;
}
