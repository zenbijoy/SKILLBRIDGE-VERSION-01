import type { PostType, PostVisibility, ReactionType } from "./types";

export interface VisualThemePreset {
  id: string;
  name: string;
  backgroundType: "gradient" | "solid" | "glass";
  gradientColors: [string, string, ...string[]];
  textColor: string;
  accentColor: string;
  borderColor?: string;
}

export const VISUAL_THEMES: VisualThemePreset[] = [
  {
    id: "default",
    name: "Classic Clean",
    backgroundType: "solid",
    gradientColors: ["#1E293B", "#0F172A"],
    textColor: "#F8FAFC",
    accentColor: "#3B82F6",
  },
  {
    id: "midnight",
    name: "Midnight Eclipse",
    backgroundType: "gradient",
    gradientColors: ["#090D16", "#141C2E", "#1E293B"],
    textColor: "#F1F5F9",
    accentColor: "#6366F1",
    borderColor: "#312E81",
  },
  {
    id: "ocean",
    name: "Deep Ocean",
    backgroundType: "gradient",
    gradientColors: ["#0C4A6E", "#0284C7", "#0369A1"],
    textColor: "#F0F9FF",
    accentColor: "#38BDF8",
    borderColor: "#0284C7",
  },
  {
    id: "aurora",
    name: "Nordic Aurora",
    backgroundType: "gradient",
    gradientColors: ["#064E3B", "#0D9488", "#0284C7"],
    textColor: "#F0FDFA",
    accentColor: "#2DD4BF",
    borderColor: "#0F766E",
  },
  {
    id: "sunset",
    name: "Sunset Blaze",
    backgroundType: "gradient",
    gradientColors: ["#831843", "#BE123C", "#EA580C"],
    textColor: "#FFF1F2",
    accentColor: "#F43F5E",
    borderColor: "#BE123C",
  },
  {
    id: "lavender",
    name: "Royal Lavender",
    backgroundType: "gradient",
    gradientColors: ["#4C1D95", "#6D28D9", "#8B5CF6"],
    textColor: "#F5F3FF",
    accentColor: "#A78BFA",
    borderColor: "#7C3AED",
  },
  {
    id: "mint",
    name: "Fresh Mint",
    backgroundType: "gradient",
    gradientColors: ["#065F46", "#059669", "#10B981"],
    textColor: "#ECFDF5",
    accentColor: "#34D399",
    borderColor: "#047857",
  },
  {
    id: "coral",
    name: "Vibrant Coral",
    backgroundType: "gradient",
    gradientColors: ["#9A3412", "#C2410C", "#F97316"],
    textColor: "#FFF7ED",
    accentColor: "#FB923C",
    borderColor: "#EA580C",
  },
  {
    id: "gold",
    name: "Golden Prestige",
    backgroundType: "gradient",
    gradientColors: ["#78350F", "#B45309", "#D97706"],
    textColor: "#FFFBEB",
    accentColor: "#FBBF24",
    borderColor: "#D97706",
  },
  {
    id: "sky",
    name: "Azure Horizon",
    backgroundType: "gradient",
    gradientColors: ["#1E3A8A", "#2563EB", "#60A5FA"],
    textColor: "#EFF6FF",
    accentColor: "#93C5FD",
    borderColor: "#3B82F6",
  },
  {
    id: "minimal",
    name: "Monochrome Slate",
    backgroundType: "gradient",
    gradientColors: ["#18181B", "#27272A", "#3F3F46"],
    textColor: "#FAFAFA",
    accentColor: "#A1A1AA",
    borderColor: "#52525B",
  },
  {
    id: "academic",
    name: "University Classic",
    backgroundType: "gradient",
    gradientColors: ["#1B2A4A", "#2C3E6B", "#3A5080"],
    textColor: "#F8FAFC",
    accentColor: "#60A5FA",
    borderColor: "#3B82F6",
  },
  {
    id: "tech",
    name: "Cyber Matrix",
    backgroundType: "gradient",
    gradientColors: ["#022C22", "#064E3B", "#047857"],
    textColor: "#ECFDF5",
    accentColor: "#10B981",
    borderColor: "#059669",
  },
];

export interface PostTypeOption {
  type: PostType;
  label: string;
  icon: string;
  color: string;
  description: string;
  badge?: string;
}

export const POST_TYPE_OPTIONS: PostTypeOption[] = [
  {
    type: "standard",
    label: "Standard",
    icon: "text",
    color: "#3B82F6",
    description: "Share thoughts, ideas, or text updates",
  },
  {
    type: "text_art",
    label: "Card Style",
    icon: "palette-outline",
    color: "#8B5CF6",
    description: "Bold visual cards with curated gradients & large typography",
  },
  {
    type: "question",
    label: "Ask Question",
    icon: "help-circle-outline",
    color: "#F59E0B",
    description: "Get answers from university peers & top seniors",
  },
  {
    type: "poll",
    label: "Campus Poll",
    icon: "poll",
    color: "#10B981",
    description: "Create interactive voting with live stats",
  },
  {
    type: "achievement",
    label: "Achievement",
    icon: "trophy-outline",
    color: "#EAB308",
    description: "Celebrate milestones, hackathons, and certifications",
  },
  {
    type: "announcement",
    label: "Announcement",
    icon: "bullhorn-outline",
    color: "#EF4444",
    description: "Official notices, club updates, and deadlines",
  },
  {
    type: "study_note",
    label: "Study Note",
    icon: "book-open-page-variant-outline",
    color: "#06B6D4",
    description: "Educational summaries, formulas, and cheat sheets",
  },
  {
    type: "event",
    label: "Campus Event",
    icon: "calendar-star",
    color: "#EC4899",
    description: "Meetups, workshops, seminars, and contests",
  },
  {
    type: "opportunity",
    label: "Opportunity",
    icon: "briefcase-outline",
    color: "#6366F1",
    description: "Internships, research, scholarships, and jobs",
  },
  {
    type: "code",
    label: "Code Snippet",
    icon: "code-tags",
    color: "#14B8A6",
    description: "Share syntax-highlighted code with line numbers",
  },
  {
    type: "quote",
    label: "Quote",
    icon: "format-quote-close",
    color: "#84CC16",
    description: "Inspiring words and literary attributions",
  },
];

export interface ReactionConfig {
  type: ReactionType;
  label: string;
  icon: string;
  emoji: string;
  color: string;
}

export const REACTIONS: ReactionConfig[] = [
  { type: "like", label: "Like", icon: "thumb-up", emoji: "👍", color: "#3B82F6" },
  { type: "love", label: "Love", icon: "heart", emoji: "❤️", color: "#EF4444" },
  { type: "insightful", label: "Insight", icon: "lightbulb-on", emoji: "💡", color: "#F59E0B" },
  { type: "celebrate", label: "Celebrate", icon: "party-popper", emoji: "👏", color: "#10B981" },
  { type: "curious", label: "Curious", icon: "help-circle", emoji: "🤔", color: "#8B5CF6" },
  { type: "sad", label: "Support", icon: "emoticon-sad", emoji: "🥺", color: "#64748B" },
];

export interface VisibilityOption {
  value: PostVisibility;
  label: string;
  icon: string;
  description: string;
}

export const VISIBILITY_OPTIONS: VisibilityOption[] = [
  { value: "public", label: "Public", icon: "earth", description: "Visible to everyone across SkillBridge" },
  { value: "university", label: "University Only", icon: "school-outline", description: "Visible only to verified campus members" },
  { value: "department", label: "My Department", icon: "office-building-outline", description: "Visible to your department peers" },
  { value: "club", label: "Club Members", icon: "account-group-outline", description: "Visible to members of a chosen club" },
  { value: "connections", label: "Connections Only", icon: "account-multiple-outline", description: "Visible only to your connected friends" },
  { value: "only_me", label: "Only Me", icon: "lock-outline", description: "Private note visible only to you" },
];

export const CODE_LANGUAGES = [
  { label: "Python", value: "python" },
  { label: "JavaScript", value: "javascript" },
  { label: "TypeScript", value: "typescript" },
  { label: "C++", value: "cpp" },
  { label: "C", value: "c" },
  { label: "Java", value: "java" },
  { label: "Rust", value: "rust" },
  { label: "Go", value: "go" },
  { label: "SQL", value: "sql" },
  { label: "HTML/CSS", value: "html" },
];

export const OPPORTUNITY_TYPES = [
  { label: "Internship", value: "internship" },
  { label: "Scholarship", value: "scholarship" },
  { label: "Job Opportunity", value: "job" },
  { label: "Hackathon", value: "hackathon" },
  { label: "Competition", value: "competition" },
  { label: "Workshop", value: "workshop" },
  { label: "Research Position", value: "research" },
];

export const POPULAR_HASHTAGS = [
  "#RUET",
  "#ComputerScience",
  "#CompetitiveProgramming",
  "#MachineLearning",
  "#WebDev",
  "#Hackathon",
  "#ExamPreparation",
  "#CampusEvents",
  "#CareerOpportunity",
  "#Algorithm",
];
