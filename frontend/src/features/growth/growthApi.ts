import { api, qs } from "@/lib/api";

// --- GOALS TYPES & API ---
export interface GoalMilestone {
  id: string;
  goal_id: string;
  user_id: string;
  title: string;
  description?: string | null;
  target_date?: string | null;
  weight: number;
  is_completed: boolean;
  is_verified: boolean;
  completed_at?: string | null;
  position: number;
}

export interface LearningGoal {
  id: string;
  user_id: string;
  skill_id?: string | null;
  title: string;
  description?: string | null;
  goal_type: "learn" | "teach" | "verify" | "research" | "project";
  status: "draft" | "active" | "completed" | "archived" | "paused";
  start_date: string;
  target_date: string;
  weekly_target_minutes: number;
  preferred_study_modes: string[];
  priority: "low" | "medium" | "high" | "urgent";
  visibility: "private" | "connections" | "public";
  progress_percent: number;
  created_at: string;
  updated_at: string;
  skill?: { id: string; name: string } | null;
  milestones?: GoalMilestone[];
}

export async function fetchGoals(status?: string): Promise<LearningGoal[]> {
  const query = status ? `?${qs({ status })}` : "";
  const res = await api<{ goals: LearningGoal[] }>(`/goals${query}`);
  return res.goals ?? [];
}

export async function fetchGoal(id: string): Promise<LearningGoal> {
  const res = await api<{ goal: LearningGoal }>(`/goals/${id}`);
  return res.goal;
}

export async function createGoal(payload: {
  title: string;
  description?: string;
  skill_id?: string | null;
  goal_type?: string;
  start_date?: string;
  target_date: string;
  weekly_target_minutes?: number;
  preferred_study_modes?: string[];
  priority?: string;
  visibility?: string;
  milestones: { title: string; weight: number; description?: string; target_date?: string }[];
}): Promise<LearningGoal> {
  const res = await api<{ goal: LearningGoal }>("/goals", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res.goal;
}

export async function updateGoal(id: string, payload: Partial<LearningGoal>): Promise<LearningGoal> {
  const res = await api<{ goal: LearningGoal }>(`/goals/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return res.goal;
}

export async function deleteGoal(id: string): Promise<void> {
  await api(`/goals/${id}`, { method: "DELETE" });
}

export async function activateGoal(id: string): Promise<{ success: boolean; status: string }> {
  return api(`/goals/${id}/activate`, { method: "POST" });
}

export async function completeMilestone(goalId: string, milestoneId: string): Promise<{ success: boolean; progress_percent: number; goal_completed: boolean }> {
  return api(`/goals/${goalId}/milestones/${milestoneId}/complete`, { method: "POST" });
}

export async function addMilestone(goalId: string, payload: { title: string; weight: number; description?: string; target_date?: string }): Promise<GoalMilestone> {
  const res = await api<{ milestone: GoalMilestone }>(`/goals/${goalId}/milestones`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res.milestone;
}

export async function deleteMilestone(goalId: string, milestoneId: string): Promise<void> {
  await api(`/goals/${goalId}/milestones/${milestoneId}`, { method: "DELETE" });
}

// --- STUDY PLANNER TYPES & API ---
export interface PlannerPreferences {
  user_id: string;
  preferred_days: number[];
  preferred_daily_minutes: number;
  preferred_modes: string[];
  quiet_hours_start: string;
  quiet_hours_end: string;
  auto_reschedule: boolean;
  timezone: string;
}

export interface StudyPlanBlock {
  id: string;
  user_id: string;
  goal_id?: string | null;
  skill_id?: string | null;
  title: string;
  description?: string | null;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  study_mode: "online" | "offline" | "hybrid";
  is_completed: boolean;
  is_skipped: boolean;
  is_custom: boolean;
  goal?: { id: string; title: string } | null;
  skill?: { id: string; name: string } | null;
}

export async function fetchPlannerPreferences(): Promise<PlannerPreferences> {
  const res = await api<{ preferences: PlannerPreferences }>("/planner/preferences");
  return res.preferences;
}

export async function updatePlannerPreferences(payload: Partial<PlannerPreferences>): Promise<PlannerPreferences> {
  const res = await api<{ preferences: PlannerPreferences }>("/planner/preferences", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return res.preferences;
}

export async function fetchPlannerWeek(startDate?: string): Promise<{
  start_date: string;
  end_date: string;
  blocks: StudyPlanBlock[];
  bookings: any[];
  active_goals: any[];
}> {
  const query = startDate ? `?${qs({ start_date: startDate })}` : "";
  return api(`/planner/week${query}`);
}

export async function generatePlannerSchedule(startDate?: string): Promise<{
  success: boolean;
  generated_count: number;
  blocks: StudyPlanBlock[];
}> {
  return api("/planner/generate", {
    method: "POST",
    body: JSON.stringify({ start_date: startDate }),
  });
}

export async function createStudyBlock(payload: {
  title: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  study_mode?: string;
  description?: string;
  goal_id?: string | null;
  skill_id?: string | null;
}): Promise<StudyPlanBlock> {
  const res = await api<{ block: StudyPlanBlock }>("/planner/blocks", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res.block;
}

export async function completeStudyBlock(id: string): Promise<StudyPlanBlock> {
  const res = await api<{ block: StudyPlanBlock }>(`/planner/blocks/${id}/complete`, { method: "POST" });
  return res.block;
}

export async function skipStudyBlock(id: string): Promise<StudyPlanBlock> {
  const res = await api<{ block: StudyPlanBlock }>(`/planner/blocks/${id}/skip`, { method: "POST" });
  return res.block;
}

export async function deleteStudyBlock(id: string): Promise<void> {
  await api(`/planner/blocks/${id}`, { method: "DELETE" });
}

// --- CALENDAR TYPES & API ---
export interface AgendaItem {
  id: string;
  entity_id: string;
  entity_type: "booking" | "study_block" | "event" | "room_session";
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  mode: string;
  status: string;
  meta?: any;
}

export interface CalendarReminder {
  id: string;
  entity_type: string;
  entity_id: string;
  reminder_time: string;
  is_dismissed: boolean;
  is_snoozed: boolean;
}

export async function fetchCalendarAgenda(startDate?: string, endDate?: string): Promise<AgendaItem[]> {
  const query = qs({ start_date: startDate, end_date: endDate });
  const res = await api<{ agenda: AgendaItem[] }>(`/calendar/agenda${query ? `?${query}` : ""}`);
  return res.agenda ?? [];
}

export async function fetchDayView(date: string): Promise<{
  date: string;
  items: any[];
  conflicts: any[];
  has_conflicts: boolean;
}> {
  return api(`/calendar/day/${date}`);
}

export async function fetchReminders(): Promise<CalendarReminder[]> {
  const res = await api<{ reminders: CalendarReminder[] }>("/calendar/reminders");
  return res.reminders ?? [];
}

export async function dismissReminder(id: string): Promise<void> {
  await api(`/calendar/reminders/${id}/dismiss`, { method: "POST" });
}

export async function snoozeReminder(id: string, minutes: number = 15): Promise<void> {
  await api(`/calendar/reminders/${id}/snooze`, {
    method: "POST",
    body: JSON.stringify({ minutes }),
  });
}

// --- TUTOR AVAILABILITY & BOOKINGS TYPES & API ---
export interface TutorSlot {
  tutor_id: string;
  date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  mode: "online" | "offline" | "hybrid";
  offline_location?: string | null;
}

export interface SessionBooking {
  id: string;
  learner_id: string;
  tutor_id: string;
  skill_id?: string | null;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  mode: "online" | "offline" | "hybrid";
  offline_location?: string | null;
  status: "requested" | "accepted" | "confirmed" | "completed" | "declined" | "cancelled";
  learner_note?: string | null;
  tutor_note?: string | null;
  cancellation_reason?: string | null;
  created_at: string;
  skill?: { id: string; name: string } | null;
  tutor?: { id: string; full_name: string; username?: string; avatar_url?: string } | null;
  learner?: { id: string; full_name: string; username?: string; avatar_url?: string } | null;
  history?: any[];
}

export interface TutorAvailabilityRule {
  id?: string;
  tutor_id?: string;
  day_of_week: number;
  start_time_utc: string;
  end_time_utc: string;
  slot_duration_minutes: number;
  buffer_minutes: number;
  mode: "online" | "offline" | "hybrid";
  offline_location?: string | null;
  is_active: boolean;
}

export interface TutorAvailabilityException {
  id?: string;
  tutor_id?: string;
  exception_date: string;
  start_time_utc?: string | null;
  end_time_utc?: string | null;
  is_blackout: boolean;
  reason?: string | null;
}

export async function fetchTutorAvailability(tutorId: string, startDate?: string, days?: number): Promise<TutorSlot[]> {
  const query = qs({ start_date: startDate, days });
  const res = await api<{ slots: TutorSlot[] }>(`/bookings/tutor/${tutorId}/availability${query ? `?${query}` : ""}`);
  return res.slots ?? [];
}

export async function fetchMyBookings(role: "all" | "learner" | "tutor" = "all", status?: string): Promise<SessionBooking[]> {
  const query = qs({ role, status });
  const res = await api<{ bookings: SessionBooking[] }>(`/bookings/my${query ? `?${query}` : ""}`);
  return res.bookings ?? [];
}

export async function fetchBooking(id: string): Promise<SessionBooking> {
  const res = await api<{ booking: SessionBooking }>(`/bookings/${id}`);
  return res.booking;
}

export async function requestBooking(payload: {
  tutor_id: string;
  skill_id?: string | null;
  start_time: string;
  end_time: string;
  mode: string;
  offline_location?: string;
  learner_note?: string;
}): Promise<{ booking_id: string; status: string }> {
  return api("/bookings", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateBookingStatus(id: string, payload: {
  status: "accepted" | "confirmed" | "declined" | "cancelled";
  note?: string;
  reason?: string;
}): Promise<{ success: boolean; from_status: string; to_status: string }> {
  return api(`/bookings/${id}/status`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function completeBooking(id: string): Promise<{ success: boolean; status: string }> {
  return api(`/bookings/${id}/complete`, { method: "POST" });
}

export async function fetchTutorRules(): Promise<{ rules: TutorAvailabilityRule[]; exceptions: TutorAvailabilityException[] }> {
  return api("/bookings/tutor/rules");
}

export async function saveTutorRules(rules: TutorAvailabilityRule[]): Promise<{ rules: TutorAvailabilityRule[] }> {
  return api("/bookings/tutor/rules", {
    method: "POST",
    body: JSON.stringify(rules),
  });
}

export async function addTutorException(exception: TutorAvailabilityException): Promise<TutorAvailabilityException> {
  const res = await api<{ exception: TutorAvailabilityException }>("/bookings/tutor/exceptions", {
    method: "POST",
    body: JSON.stringify(exception),
  });
  return res.exception;
}

export async function deleteTutorException(id: string): Promise<void> {
  await api(`/bookings/tutor/exceptions/${id}`, { method: "DELETE" });
}

// --- SAVED & COLLECTIONS TYPES & API ---
export interface SavedCollection {
  id: string;
  user_id: string;
  name: string;
  description?: string | null;
  color: string;
  icon: string;
  item_count?: number;
  created_at: string;
}

export interface SavedItem {
  id: string;
  user_id: string;
  entity_type: string;
  entity_id: string;
  collection_id?: string | null;
  note?: string | null;
  tags: string[];
  created_at: string;
  title: string;
  subtitle?: string;
  is_tombstone?: boolean;
  collection?: SavedCollection | null;
  details?: any;
}

export async function fetchSavedCollections(): Promise<{
  collections: SavedCollection[];
  unorganized_count: number;
  total_count: number;
}> {
  return api("/saved/collections");
}

export async function createSavedCollection(payload: { name: string; description?: string; color?: string; icon?: string }): Promise<SavedCollection> {
  const res = await api<{ collection: SavedCollection }>("/saved/collections", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res.collection;
}

export async function updateSavedCollection(id: string, payload: Partial<SavedCollection>): Promise<SavedCollection> {
  const res = await api<{ collection: SavedCollection }>(`/saved/collections/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return res.collection;
}

export async function deleteSavedCollection(id: string): Promise<void> {
  await api(`/saved/collections/${id}`, { method: "DELETE" });
}

export async function fetchSavedItems(collectionId?: string, entityType?: string): Promise<SavedItem[]> {
  const query = qs({ collection_id: collectionId, entity_type: entityType });
  const res = await api<{ items: SavedItem[] }>(`/saved${query ? `?${query}` : ""}`);
  return res.items ?? [];
}

export async function saveItem(payload: {
  entity_type: string;
  entity_id: string;
  collection_id?: string | null;
  note?: string;
  tags?: string[];
}): Promise<SavedItem> {
  const res = await api<{ item: SavedItem }>("/saved", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res.item;
}

export async function removeSavedItem(id: string): Promise<void> {
  await api(`/saved/${id}`, { method: "DELETE" });
}

export async function moveItemCollection(id: string, collectionId: string | null, note?: string): Promise<SavedItem> {
  const res = await api<{ item: SavedItem }>(`/saved/${id}/collection`, {
    method: "PUT",
    body: JSON.stringify({ collection_id: collectionId, note }),
  });
  return res.item;
}

// --- CHALLENGES & QUESTS TYPES & API ---
export interface Challenge {
  id: string;
  title: string;
  description: string;
  challenge_type: string;
  target_activity_type: string;
  target_count: number;
  points_reward: number;
  badge_reward?: string | null;
  start_at: string;
  end_at: string;
  is_active: boolean;
  progress?: {
    current_count: number;
    status: "active" | "completed_unclaimed" | "claimed";
    completed_at?: string | null;
    claimed_at?: string | null;
  };
}

export async function fetchChallenges(): Promise<Challenge[]> {
  const res = await api<{ challenges: Challenge[] }>("/challenges");
  return res.challenges ?? [];
}

export async function fetchChallenge(id: string): Promise<Challenge> {
  const res = await api<{ challenge: Challenge }>(`/challenges/${id}`);
  return res.challenge;
}

export async function claimChallengeReward(id: string): Promise<{ success: boolean; status: string; points_awarded: number }> {
  return api(`/challenges/${id}/claim`, { method: "POST" });
}

// --- ACHIEVEMENTS & PROOF TYPES & API ---
export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
  category: string;
  icon: string;
  criteria_description: string;
  points_reward: number;
  is_earned?: boolean;
  earned_details?: {
    id: string;
    verification_code: string;
    is_public: boolean;
    issued_at: string;
  } | null;
}

export interface VerifiedCertificate {
  verification_code: string;
  issued_at: string;
  is_public: boolean;
  recipient: {
    id: string;
    full_name: string;
    username: string;
    avatar_url?: string;
    campus?: string;
  };
  achievement: {
    id: string;
    title: string;
    description: string;
    category: string;
    icon: string;
    criteria_description: string;
    points_reward: number;
  };
}

export async function fetchAchievements(): Promise<{
  achievements: AchievementDefinition[];
  earned_count: number;
  total_points_earned: number;
}> {
  return api("/achievements");
}

export async function fetchAchievement(id: string): Promise<AchievementDefinition> {
  const res = await api<{ achievement: AchievementDefinition }>(`/achievements/${id}`);
  return res.achievement;
}

export async function verifyCertificate(code: string): Promise<{
  verified: boolean;
  status: "valid" | "revoked";
  certificate?: VerifiedCertificate;
  revocation_reason?: string;
}> {
  return api(`/achievements/verify/${encodeURIComponent(code)}`);
}

export async function toggleAchievementVisibility(id: string, isPublic: boolean): Promise<void> {
  await api(`/achievements/user/${id}/visibility`, {
    method: "PUT",
    body: JSON.stringify({ is_public: isPublic }),
  });
}

// --- PROGRESS & ACTIVITY TYPES & API ---
export interface ActivityEvent {
  id: string;
  user_id: string;
  event_type: string;
  event_title: string;
  metadata: Record<string, any>;
  is_verified: boolean;
  created_at: string;
}

export interface ProgressSummary {
  profile: {
    id: string;
    full_name: string;
    username: string;
    reputation_score: number;
  };
  stats: {
    total_learning_minutes: number;
    study_block_minutes: number;
    booking_minutes: number;
    goals_total: number;
    goals_active: number;
    goals_completed: number;
    avg_goal_progress: number;
    milestones_total: number;
    milestones_completed: number;
    sessions_taught: number;
    sessions_attended: number;
    achievements_count: number;
    current_streak_days: number;
  };
  activity_heatmap: Record<string, number>;
}

export async function fetchActivityTimeline(limit: number = 30, offset: number = 0, eventType?: string): Promise<{
  events: ActivityEvent[];
  total_count: number;
}> {
  const query = qs({ limit, offset, event_type: eventType });
  return api(`/activity?${query}`);
}

export async function fetchProgressSummary(): Promise<ProgressSummary> {
  return api("/progress/summary");
}

export async function fetchSkillProgress(skillId: string): Promise<any> {
  return api(`/progress/skill/${skillId}`);
}
