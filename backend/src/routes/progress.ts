import { Router } from "express";
import { admin } from "../lib/db.js";
import { wrap } from "../middleware/error.js";

export const progress = Router();

// GET /api/v1/progress/summary - Aggregated learning & growth progress
progress.get(
  "/summary",
  wrap(async (req, res) => {
    const userId = req.userId!;

    // 1. Fetch user profile and reputation
    const { data: profile } = await admin
      .from("profiles")
      .select("id, full_name, username, reputation_score, profile_completion_percent")
      .eq("id", userId)
      .single();

    // 2. Fetch goals statistics
    const { data: allGoals } = await admin
      .from("learning_goals")
      .select("id, status, progress_percent, weekly_target_minutes, created_at, completed_at")
      .eq("user_id", userId)
      .is("deleted_at", null);

    const goalsTotal = (allGoals || []).length;
    const goalsActive = (allGoals || []).filter((g) => g.status === "active").length;
    const goalsCompleted = (allGoals || []).filter((g) => g.status === "completed").length;
    const avgGoalProgress = goalsTotal > 0
      ? Math.round((allGoals || []).reduce((acc, g) => acc + (g.progress_percent || 0), 0) / goalsTotal)
      : 0;

    // 3. Completed milestones count
    const { data: milestones } = await admin
      .from("goal_milestones")
      .select("id, is_completed, is_verified, completed_at")
      .eq("user_id", userId);

    const milestonesTotal = (milestones || []).length;
    const milestonesCompleted = (milestones || []).filter((m) => m.is_completed).length;

    // 4. Completed study blocks
    const { data: studyBlocks } = await admin
      .from("study_plan_blocks")
      .select("duration_minutes, completed_at, start_time")
      .eq("user_id", userId)
      .eq("is_completed", true);

    const studyMinutes = (studyBlocks || []).reduce((acc, b) => acc + (b.duration_minutes || 0), 0);

    // 5. Tutoring & Sessions
    const { data: completedBookings } = await admin
      .from("session_bookings")
      .select("learner_id, tutor_id, duration_minutes, status")
      .or(`learner_id.eq.${userId},tutor_id.eq.${userId}`)
      .eq("status", "completed");

    const sessionsTaught = (completedBookings || []).filter((b) => b.tutor_id === userId).length;
    const sessionsAttended = (completedBookings || []).filter((b) => b.learner_id === userId).length;
    const bookingMinutes = (completedBookings || []).reduce((acc, b) => acc + (b.duration_minutes || 0), 0);

    const totalLearningMinutes = studyMinutes + bookingMinutes;

    // 6. Earned achievements
    const { data: achievements } = await admin
      .from("user_achievements")
      .select("id, issued_at")
      .eq("user_id", userId)
      .eq("is_revoked", false);

    // 7. Recent 28-day daily activity distribution
    const now = new Date();
    const past28Days = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);

    const { data: recentEvents } = await admin
      .from("user_activity_events")
      .select("created_at, event_type")
      .eq("user_id", userId)
      .gte("created_at", past28Days.toISOString());

    const dailyActivityCount: Record<string, number> = {};
    (recentEvents || []).forEach((ev) => {
      const dateKey = ev.created_at ? ev.created_at.slice(0, 10) : "";
      if (dateKey) {
        dailyActivityCount[dateKey] = (dailyActivityCount[dateKey] || 0) + 1;
      }
    });

    // Calculate current streak
    let streak = 0;
    let checkDate = new Date();
    for (let i = 0; i < 60; i++) {
      const dateKey = checkDate.toISOString().slice(0, 10);
      if (dailyActivityCount[dateKey] && dailyActivityCount[dateKey] > 0) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else if (i === 0) {
        // Today may not have events yet; check yesterday
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    res.json({
      profile: {
        id: profile?.id,
        full_name: profile?.full_name,
        username: profile?.username,
        reputation_score: profile?.reputation_score || 0,
      },
      stats: {
        total_learning_minutes: totalLearningMinutes,
        study_block_minutes: studyMinutes,
        booking_minutes: bookingMinutes,
        goals_total: goalsTotal,
        goals_active: goalsActive,
        goals_completed: goalsCompleted,
        avg_goal_progress: avgGoalProgress,
        milestones_total: milestonesTotal,
        milestones_completed: milestonesCompleted,
        sessions_taught: sessionsTaught,
        sessions_attended: sessionsAttended,
        achievements_count: (achievements || []).length,
        current_streak_days: streak,
      },
      activity_heatmap: dailyActivityCount,
    });
  }),
);

// GET /api/v1/progress/skill/:skillId - Skill specific breakdown
progress.get(
  "/skill/:skillId",
  wrap(async (req, res) => {
    const userId = req.userId!;
    const { skillId } = req.params;

    const { data: skill, error: sErr } = await admin
      .from("skills")
      .select("*")
      .eq("id", skillId)
      .single();

    if (sErr) throw sErr;

    // User goals on this skill
    const { data: goals } = await admin
      .from("learning_goals")
      .select("*, milestones:goal_milestones(*)")
      .eq("user_id", userId)
      .eq("skill_id", skillId)
      .is("deleted_at", null);

    // Bookings related to this skill
    const { data: bookings } = await admin
      .from("session_bookings")
      .select("*, tutor:profiles!session_bookings_tutor_id_fkey(id, full_name), learner:profiles!session_bookings_learner_id_fkey(id, full_name)")
      .eq("skill_id", skillId)
      .or(`learner_id.eq.${userId},tutor_id.eq.${userId}`);

    // Study blocks on this skill
    const { data: blocks } = await admin
      .from("study_plan_blocks")
      .select("*")
      .eq("user_id", userId)
      .eq("skill_id", skillId);

    const totalMinutes = (blocks || [])
      .filter((b) => b.is_completed)
      .reduce((acc, curr) => acc + (curr.duration_minutes || 0), 0);

    res.json({
      skill,
      goals: goals ?? [],
      bookings: bookings ?? [],
      study_blocks: blocks ?? [],
      total_minutes_studied: totalMinutes,
    });
  }),
);
