import { admin } from "../lib/db.js";
import { logger } from "../lib/logger.js";

export interface DayTrack {
  day: string;
  date: string;
  is_active: boolean;
  is_today: boolean;
  minutes: number;
}

export interface FeatureUsageItem {
  key: "rooms" | "quizzes" | "tutoring" | "self_study" | "doubts";
  title: string;
  minutes: number;
  count: number;
  icon: string;
  color: string;
  detail: string;
}

export interface StreakAnalytics {
  current_streak_days: number;
  longest_streak_days: number;
  total_active_days: number;
  total_learning_minutes: number;
  weekly_track: DayTrack[];
  features_usage: FeatureUsageItem[];
  recent_activities: Array<{
    id: string;
    event_type: string;
    event_title: string;
    created_at: string;
    metadata?: Record<string, any>;
  }>;
}

/**
 * Calculates continuous consecutive streaks from a set of YYYY-MM-DD date strings.
 */
export function computeStreaksFromDates(dateStrings: string[], baseDate: Date = new Date()): {
  currentStreak: number;
  longestStreak: number;
  totalActiveDays: number;
} {
  const uniqueDates = Array.from(new Set(dateStrings.filter(Boolean))).sort();
  const dateSet = new Set(uniqueDates);
  const totalActiveDays = dateSet.size;

  if (totalActiveDays === 0) {
    return { currentStreak: 0, longestStreak: 0, totalActiveDays: 0 };
  }

  // 1. Calculate current streak backwards from today (or yesterday if today not yet logged)
  let currentStreak = 0;
  const cursor = new Date(baseDate);
  const todayKey = cursor.toISOString().slice(0, 10);

  // If today is active, start counting from today
  if (dateSet.has(todayKey)) {
    while (true) {
      const key = cursor.toISOString().slice(0, 10);
      if (dateSet.has(key)) {
        currentStreak++;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }
  } else {
    // If today is not active yet, check yesterday to preserve ongoing streak
    cursor.setDate(cursor.getDate() - 1);
    const yesterdayKey = cursor.toISOString().slice(0, 10);
    if (dateSet.has(yesterdayKey)) {
      while (true) {
        const key = cursor.toISOString().slice(0, 10);
        if (dateSet.has(key)) {
          currentStreak++;
          cursor.setDate(cursor.getDate() - 1);
        } else {
          break;
        }
      }
    }
  }

  // 2. Calculate longest streak across history
  let longestStreak = 0;
  let runningStreak = 0;
  let previousDate: Date | null = null;

  for (const dateStr of uniqueDates) {
    const current = new Date(dateStr + "T00:00:00Z");
    if (!previousDate) {
      runningStreak = 1;
    } else {
      const diffMs = current.getTime() - previousDate.getTime();
      const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
      if (diffDays === 1) {
        runningStreak++;
      } else if (diffDays > 1) {
        runningStreak = 1;
      }
    }
    previousDate = current;
    if (runningStreak > longestStreak) {
      longestStreak = runningStreak;
    }
  }

  if (currentStreak > longestStreak) {
    longestStreak = currentStreak;
  }

  return { currentStreak, longestStreak, totalActiveDays };
}

/**
 * Ensures today's active check-in is persisted in user_activity_events.
 */
export async function recordDailyCheckin(userId: string): Promise<void> {
  try {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const { data: existing } = await admin
      .from("user_activity_events")
      .select("id")
      .eq("user_id", userId)
      .gte("created_at", todayStart.toISOString())
      .limit(1)
      .maybeSingle();

    if (!existing?.id) {
      await admin.from("user_activity_events").insert({
        user_id: userId,
        event_type: "study_session",
        event_title: "Campus Daily Check-in",
        metadata: { source: "app_streak" },
        is_verified: true,
      });
    }
  } catch (err) {
    logger.warn({ err, userId }, "Failed to auto-record daily check-in");
  }
}

/**
 * Returns comprehensive streak and usage breakdown for a user.
 */
export async function getStreakAnalytics(userId: string): Promise<StreakAnalytics> {
  // 1. Auto-checkin today
  await recordDailyCheckin(userId);

  // 2. Fetch past 60 days across all learning activities
  const past60Days = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const past60Iso = past60Days.toISOString();

  const [
    activityQ,
    quizQ,
    livekitQ,
    tutoringQ,
    blocksQ,
    questionsQ,
  ] = await Promise.all([
    // User activity events
    admin
      .from("user_activity_events")
      .select("id, event_type, event_title, created_at, metadata")
      .eq("user_id", userId)
      .gte("created_at", past60Iso)
      .order("created_at", { ascending: false })
      .limit(50),

    // Quiz attempts
    admin
      .from("quiz_attempts")
      .select("id, elapsed_seconds, score, passed, created_at")
      .eq("user_id", userId)
      .gte("created_at", past60Iso),

    // LiveKit room attendance
    admin
      .from("livekit_attendance")
      .select("id, duration_seconds, joined_at")
      .eq("user_id", userId)
      .gte("joined_at", past60Iso),

    // Peer tutoring sessions
    admin
      .from("session_bookings")
      .select("id, duration_minutes, status, created_at")
      .or(`learner_id.eq.${userId},tutor_id.eq.${userId}`)
      .eq("status", "completed")
      .gte("created_at", past60Iso),

    // Focus study blocks
    admin
      .from("study_plan_blocks")
      .select("id, duration_minutes, completed_at")
      .eq("user_id", userId)
      .eq("is_completed", true)
      .gte("completed_at", past60Iso),

    // Doubts / Questions
    admin
      .from("room_questions")
      .select("id, created_at")
      .eq("user_id", userId)
      .gte("created_at", past60Iso),
  ]);

  // Aggregate all unique active dates
  const activeDates: string[] = [];
  const dateMinutes: Record<string, number> = {};

  const recordDate = (isoString?: string | null, minutes: number = 5) => {
    if (!isoString) return;
    const dateKey = isoString.slice(0, 10);
    if (!dateKey) return;
    activeDates.push(dateKey);
    dateMinutes[dateKey] = (dateMinutes[dateKey] || 0) + Math.max(1, Math.round(minutes));
  };

  (activityQ.data || []).forEach((ev) => recordDate(ev.created_at, 5));
  (quizQ.data || []).forEach((q) => recordDate(q.created_at, (q.elapsed_seconds || 120) / 60));
  (livekitQ.data || []).forEach((lk) => recordDate(lk.joined_at, (lk.duration_seconds || 300) / 60));
  (tutoringQ.data || []).forEach((t) => recordDate(t.created_at, t.duration_minutes || 30));
  (blocksQ.data || []).forEach((b) => recordDate(b.completed_at, b.duration_minutes || 25));
  (questionsQ.data || []).forEach((d) => recordDate(d.created_at, 10));

  // Compute streaks
  const { currentStreak, longestStreak, totalActiveDays } = computeStreaksFromDates(activeDates);

  // Generate 7-day weekly tracker (Monday through Sunday)
  const now = new Date();
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weeklyTrack: DayTrack[] = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateKey = d.toISOString().slice(0, 10);
    const isToday = i === 0;
    const isActive = Boolean(dateMinutes[dateKey] && dateMinutes[dateKey] > 0);

    weeklyTrack.push({
      day: dayNames[d.getDay()] ?? "Mon",
      date: dateKey,
      is_active: isActive,
      is_today: isToday,
      minutes: dateMinutes[dateKey] || 0,
    });
  }

  // Calculate detailed feature time & counts ("কি ইউজ করেছি, কোনটায় কতক্ষণ ছিলাম")
  const roomMins = Math.round(
    (livekitQ.data || []).reduce((acc, lk) => acc + (lk.duration_seconds || 0), 0) / 60,
  );
  const roomCount = (livekitQ.data || []).length;

  const quizMins = Math.round(
    (quizQ.data || []).reduce((acc, q) => acc + (q.elapsed_seconds || 0), 0) / 60,
  );
  const quizCount = (quizQ.data || []).length;
  const quizPassed = (quizQ.data || []).filter((q) => q.passed).length;

  const tutorMins = (tutoringQ.data || []).reduce((acc, t) => acc + (t.duration_minutes || 0), 0);
  const tutorCount = (tutoringQ.data || []).length;

  const studyBlockMins = (blocksQ.data || []).reduce((acc, b) => acc + (b.duration_minutes || 0), 0);
  const studyBlockCount = (blocksQ.data || []).length;

  const doubtCount = (questionsQ.data || []).length;

  const totalLearningMinutes = roomMins + quizMins + tutorMins + studyBlockMins;

  const featuresUsage: FeatureUsageItem[] = [
    {
      key: "rooms",
      title: "Live Study Rooms",
      minutes: roomMins,
      count: roomCount,
      icon: "door-open",
      color: "#3B82F6",
      detail: `${roomCount} session${roomCount === 1 ? "" : "s"} joined`,
    },
    {
      key: "quizzes",
      title: "Skill Quizzes & Tests",
      minutes: quizMins,
      count: quizCount,
      icon: "lightbulb-check-outline",
      color: "#10B981",
      detail: `${quizPassed} passed / ${quizCount} taken`,
    },
    {
      key: "tutoring",
      title: "Peer Tutoring & Calls",
      minutes: tutorMins,
      count: tutorCount,
      icon: "account-voice",
      color: "#8B5CF6",
      detail: `${tutorCount} completed booking${tutorCount === 1 ? "" : "s"}`,
    },
    {
      key: "self_study",
      title: "Focus & Study Blocks",
      minutes: studyBlockMins,
      count: studyBlockCount,
      icon: "clock-check-outline",
      color: "#F59E0B",
      detail: `${studyBlockCount} focus block${studyBlockCount === 1 ? "" : "s"} finished`,
    },
    {
      key: "doubts",
      title: "Academic Help & Doubts",
      minutes: doubtCount * 10,
      count: doubtCount,
      icon: "comment-question-outline",
      color: "#EC4899",
      detail: `${doubtCount} question${doubtCount === 1 ? "" : "s"} posted`,
    },
  ];

  return {
    current_streak_days: currentStreak,
    longest_streak_days: longestStreak,
    total_active_days: totalActiveDays,
    total_learning_minutes: totalLearningMinutes,
    weekly_track: weeklyTrack,
    features_usage: featuresUsage,
    recent_activities: (activityQ.data || []).slice(0, 15).map((ev) => ({
      id: ev.id,
      event_type: ev.event_type,
      event_title: ev.event_title,
      created_at: ev.created_at,
      metadata: ev.metadata,
    })),
  };
}
