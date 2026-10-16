/**
 * Pure, framework-free helpers for the "Ask Doubt" (Academic Help) feature.
 *
 * These live in their own module so the list/detail screens stay lean and so the
 * filtering / status / formatting logic can be unit-tested without rendering
 * React Native components.
 */

export type HelpUrgency = "normal" | "today" | "exam_soon";

export type HelpStatus = "all" | "open" | "answered" | "resolved";

export type PillTone = "default" | "primary" | "warning" | "danger" | "success" | "accent" | "info";

export type HelpQuestionSummary = {
  id: string;
  roomId: string;
  roomTitle: string;
  title: string;
  body: string;
  isResolved: boolean;
  upvotesCount: number;
  createdAt: string;
  answersCount: number;
  hasAcceptedAnswer: boolean;
  subject?: string | null;
  topic?: string | null;
  urgency: HelpUrgency;
  author: {
    id: string;
    full_name: string;
    username: string;
    avatar_url?: string;
  };
};

export type UrgencyMeta = {
  label: string;
  tone: PillTone;
  icon: string;
};

const URGENCY_META: Record<HelpUrgency, UrgencyMeta> = {
  normal: { label: "Normal", tone: "default", icon: "clock-outline" },
  today: { label: "Due Today", tone: "warning", icon: "alert-circle-outline" },
  exam_soon: { label: "Exam Soon", tone: "danger", icon: "fire" },
};

/** Resolve display metadata (label + pill tone + icon) for an urgency level. */
export function getUrgencyMeta(urgency?: string): UrgencyMeta {
  if (urgency === "today" || urgency === "exam_soon") return URGENCY_META[urgency];
  return URGENCY_META.normal;
}

/**
 * A question counts as "resolved" once an answer is accepted OR the backend has
 * flagged it resolved; otherwise "answered" if it has any replies; else "open".
 */
export function deriveStatus(
  q: Pick<HelpQuestionSummary, "isResolved" | "hasAcceptedAnswer" | "answersCount">,
): "open" | "answered" | "resolved" {
  if (q.isResolved || q.hasAcceptedAnswer) return "resolved";
  if (q.answersCount > 0) return "answered";
  return "open";
}

/** Case-insensitive search across the user-facing text fields of a question. */
export function matchesSearch(q: HelpQuestionSummary, needle: string): boolean {
  const n = needle.trim().toLowerCase();
  if (!n) return true;
  return (
    q.title?.toLowerCase().includes(n) ||
    q.body?.toLowerCase().includes(n) ||
    q.subject?.toLowerCase().includes(n) ||
    q.topic?.toLowerCase().includes(n) ||
    q.roomTitle?.toLowerCase().includes(n)
  );
}

export type FilterOptions = {
  status?: HelpStatus;
  onlyMine?: boolean;
  userId?: string | null;
  search?: string;
};

/**
 * Apply status + ownership + free-text filters to a question list. Pure so it can
 * be reused by both the screen (for the visible list) and unit tests.
 */
export function filterQuestions(
  questions: HelpQuestionSummary[],
  { status = "all", onlyMine = false, userId, search = "" }: FilterOptions = {},
): HelpQuestionSummary[] {
  return questions.filter((q) => {
    if (onlyMine && userId && q.author?.id !== userId) return false;

    const st = deriveStatus(q);
    if (status === "resolved" && st !== "resolved") return false;
    if (status === "answered" && st === "open") return false;
    if (status === "open" && st !== "open") return false;

    return matchesSearch(q, search);
  });
}

export type QuestionSummaryStats = {
  total: number;
  open: number;
  answered: number;
  resolved: number;
};

/** Aggregate counts used by the list header stat chips. */
export function summarizeQuestions(questions: HelpQuestionSummary[]): QuestionSummaryStats {
  const stats: QuestionSummaryStats = { total: questions.length, open: 0, answered: 0, resolved: 0 };
  for (const q of questions) {
    stats[deriveStatus(q)] += 1;
  }
  return stats;
}

/**
 * Compact relative timestamp: "just now", "5m ago", "3h ago", "2d ago", or an
 * absolute date for anything older than a week. Returns "" for invalid input.
 */
export function formatRelativeTime(iso?: string, now: number = Date.now()): string {
  if (!iso) return "";
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "";

  const diff = Math.max(0, now - ts);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Short display label for a room, guarding against missing titles. */
export function roomLabel(roomTitle?: string | null): string {
  return roomTitle?.trim() || "Study Space";
}
