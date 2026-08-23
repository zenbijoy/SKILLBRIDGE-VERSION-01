-- 018_learning_growth_hub.sql
-- Learning & Growth Hub: Personal Goals, Study Planner, Calendar, Booking, Saved Collections, Challenges, Achievements, and Activity Analytics.

BEGIN;

-- 1. LEARNING GOALS & MILESTONES
CREATE TABLE IF NOT EXISTS public.learning_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  skill_id uuid REFERENCES public.skills(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  goal_type text NOT NULL DEFAULT 'learn'
    CHECK (goal_type IN ('learn', 'teach', 'verify', 'research', 'project')),
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  target_date date NOT NULL,
  weekly_target_minutes integer NOT NULL DEFAULT 120
    CHECK (weekly_target_minutes >= 15 AND weekly_target_minutes <= 2400),
  preferred_study_modes text[] NOT NULL DEFAULT ARRAY['online', 'offline', 'hybrid']::text[],
  priority text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  visibility text NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'connections', 'public')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'completed', 'abandoned')),
  progress_percent integer NOT NULL DEFAULT 0
    CHECK (progress_percent >= 0 AND progress_percent <= 100),
  reflection text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT learning_goals_dates_valid CHECK (target_date >= start_date)
);

CREATE TABLE IF NOT EXISTS public.goal_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL REFERENCES public.learning_goals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  weight integer NOT NULL CHECK (weight >= 1 AND weight <= 100),
  order_index integer NOT NULL DEFAULT 0,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  is_verified boolean NOT NULL DEFAULT false,
  verified_activity_type text,
  verified_activity_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. STUDY PLANNER PREFERENCES & BLOCKS
CREATE TABLE IF NOT EXISTS public.study_planner_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  preferred_days integer[] NOT NULL DEFAULT ARRAY[1, 2, 3, 4, 5]::integer[],
  preferred_daily_minutes integer NOT NULL DEFAULT 60
    CHECK (preferred_daily_minutes >= 15 AND preferred_daily_minutes <= 720),
  preferred_modes text[] NOT NULL DEFAULT ARRAY['online', 'hybrid']::text[],
  quiet_hours_start text NOT NULL DEFAULT '22:00',
  quiet_hours_end text NOT NULL DEFAULT '07:00',
  auto_reschedule boolean NOT NULL DEFAULT true,
  timezone text NOT NULL DEFAULT 'Asia/Dhaka',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.study_plan_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  goal_id uuid REFERENCES public.learning_goals(id) ON DELETE SET NULL,
  skill_id uuid REFERENCES public.skills(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  duration_minutes integer NOT NULL
    CHECK (duration_minutes >= 15 AND duration_minutes <= 480),
  study_mode text NOT NULL DEFAULT 'online'
    CHECK (study_mode IN ('online', 'offline', 'hybrid')),
  reason text,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  is_skipped boolean NOT NULL DEFAULT false,
  is_custom boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT study_plan_blocks_time_valid CHECK (end_time > start_time)
);

-- 3. CALENDAR REMINDERS
CREATE TABLE IF NOT EXISTS public.calendar_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entity_type text NOT NULL
    CHECK (entity_type IN ('room_session', 'booking', 'event', 'club_event', 'research_deadline', 'goal_milestone', 'study_block')),
  entity_id uuid NOT NULL,
  reminder_time timestamptz NOT NULL,
  is_dismissed boolean NOT NULL DEFAULT false,
  is_snoozed boolean NOT NULL DEFAULT false,
  snooze_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. TUTOR AVAILABILITY & SESSION BOOKINGS
CREATE TABLE IF NOT EXISTS public.tutor_availability_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time_utc text NOT NULL,
  end_time_utc text NOT NULL,
  slot_duration_minutes integer NOT NULL DEFAULT 60
    CHECK (slot_duration_minutes IN (30, 45, 60, 90, 120)),
  buffer_minutes integer NOT NULL DEFAULT 15
    CHECK (buffer_minutes >= 0 AND buffer_minutes <= 60),
  mode text NOT NULL DEFAULT 'online'
    CHECK (mode IN ('online', 'offline', 'hybrid')),
  offline_location text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tutor_availability_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  exception_date date NOT NULL,
  start_time_utc text,
  end_time_utc text,
  is_blackout boolean NOT NULL DEFAULT true,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.session_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tutor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  skill_id uuid REFERENCES public.skills(id) ON DELETE SET NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  duration_minutes integer NOT NULL
    CHECK (duration_minutes >= 15 AND duration_minutes <= 240),
  mode text NOT NULL DEFAULT 'online'
    CHECK (mode IN ('online', 'offline', 'hybrid')),
  offline_location text,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'accepted', 'confirmed', 'completed', 'declined', 'cancelled', 'expired', 'reschedule_requested')),
  learner_note text,
  tutor_note text,
  cancellation_reason text,
  idempotency_key text UNIQUE,
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT session_bookings_time_valid CHECK (end_time > start_time),
  CONSTRAINT session_bookings_parties_distinct CHECK (learner_id <> tutor_id)
);

CREATE TABLE IF NOT EXISTS public.booking_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.session_bookings(id) ON DELETE CASCADE,
  from_status text NOT NULL,
  to_status text NOT NULL,
  changed_by_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. SAVED COLLECTIONS & ITEMS ENHANCEMENT
CREATE TABLE IF NOT EXISTS public.saved_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  color text NOT NULL DEFAULT '#2563EB',
  icon text NOT NULL DEFAULT 'bookmark',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure saved_items has collection_id, note, and tags
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'saved_items' AND column_name = 'collection_id') THEN
    ALTER TABLE public.saved_items ADD COLUMN collection_id uuid REFERENCES public.saved_collections(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'saved_items' AND column_name = 'note') THEN
    ALTER TABLE public.saved_items ADD COLUMN note text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'saved_items' AND column_name = 'tags') THEN
    ALTER TABLE public.saved_items ADD COLUMN tags text[] NOT NULL DEFAULT ARRAY[]::text[];
  END IF;
END;
$$;

-- 6. CHALLENGES & QUESTS
CREATE TABLE IF NOT EXISTS public.challenge_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  challenge_type text NOT NULL DEFAULT 'weekly'
    CHECK (challenge_type IN ('daily', 'weekly', 'campus', 'skill', 'room', 'event', 'research', 'tutor', 'learner', 'onboarding')),
  target_activity_type text NOT NULL,
  target_count integer NOT NULL DEFAULT 1 CHECK (target_count >= 1),
  points_reward integer NOT NULL DEFAULT 25 CHECK (points_reward >= 0 AND points_reward <= 1000),
  badge_reward text,
  start_at timestamptz NOT NULL DEFAULT now(),
  end_at timestamptz NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  target_roles text[] NOT NULL DEFAULT ARRAY['student', 'tutor', 'peer_tutor', 'club_admin', 'researcher']::text[],
  target_campuses text[],
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT challenge_definitions_dates_valid CHECK (end_at > start_at)
);

CREATE TABLE IF NOT EXISTS public.challenge_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  challenge_id uuid NOT NULL REFERENCES public.challenge_definitions(id) ON DELETE CASCADE,
  current_count integer NOT NULL DEFAULT 0 CHECK (current_count >= 0),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('upcoming', 'active', 'completed_unclaimed', 'claimed', 'expired', 'revoked')),
  completed_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, challenge_id)
);

-- 7. ACHIEVEMENTS & VERIFICATION
CREATE TABLE IF NOT EXISTS public.achievement_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL DEFAULT 'skill'
    CHECK (category IN ('skill', 'goal', 'tutoring', 'learning', 'research', 'challenge', 'community')),
  icon text NOT NULL DEFAULT 'trophy',
  criteria_description text NOT NULL,
  points_reward integer NOT NULL DEFAULT 50 CHECK (points_reward >= 0 AND points_reward <= 2000),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Upgrade legacy achievements table if present
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'achievements') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'achievements' AND column_name = 'category') THEN
      ALTER TABLE public.achievements ADD COLUMN category text NOT NULL DEFAULT 'skill';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'achievements' AND column_name = 'criteria_description') THEN
      ALTER TABLE public.achievements ADD COLUMN criteria_description text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'achievements' AND column_name = 'points_reward') THEN
      ALTER TABLE public.achievements ADD COLUMN points_reward integer NOT NULL DEFAULT 50;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'achievements' AND column_name = 'is_active') THEN
      ALTER TABLE public.achievements ADD COLUMN is_active boolean NOT NULL DEFAULT true;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'achievements' AND column_name = 'updated_at') THEN
      ALTER TABLE public.achievements ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
    END IF;
  END IF;
END;
$$;

-- Upgrade legacy user_achievements table
CREATE TABLE IF NOT EXISTS public.user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  achievement_id uuid NOT NULL,
  verification_code text NOT NULL UNIQUE,
  is_public boolean NOT NULL DEFAULT true,
  is_revoked boolean NOT NULL DEFAULT false,
  revocation_reason text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_id)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_achievements' AND column_name = 'verification_code') THEN
    ALTER TABLE public.user_achievements ADD COLUMN verification_code text;
    UPDATE public.user_achievements SET verification_code = 'SB-ACH-' || upper(substr(md5(random()::text || user_id::text), 1, 8)) || '-' || upper(substr(md5(achievement_id::text), 1, 8)) WHERE verification_code IS NULL;
    ALTER TABLE public.user_achievements ALTER COLUMN verification_code SET NOT NULL;
    ALTER TABLE public.user_achievements ADD CONSTRAINT uq_user_achievements_verification_code UNIQUE (verification_code);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_achievements' AND column_name = 'is_public') THEN
    ALTER TABLE public.user_achievements ADD COLUMN is_public boolean NOT NULL DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_achievements' AND column_name = 'is_revoked') THEN
    ALTER TABLE public.user_achievements ADD COLUMN is_revoked boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_achievements' AND column_name = 'revocation_reason') THEN
    ALTER TABLE public.user_achievements ADD COLUMN revocation_reason text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_achievements' AND column_name = 'issued_at') THEN
    ALTER TABLE public.user_achievements ADD COLUMN issued_at timestamptz NOT NULL DEFAULT now();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_achievements' AND column_name = 'created_at') THEN
    ALTER TABLE public.user_achievements ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_achievements' AND column_name = 'id') THEN
    ALTER TABLE public.user_achievements ADD COLUMN id uuid DEFAULT gen_random_uuid();
  END IF;
END;
$$;

-- 8. USER ACTIVITY EVENTS
CREATE TABLE IF NOT EXISTS public.user_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN ('goal_milestone', 'study_session', 'room_join', 'session_taught', 'session_attended', 'quiz_completed', 'skill_verified', 'research_update', 'booking_completed', 'achievement_earned', 'challenge_claimed')),
  event_title text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_verified boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_learning_goals_user ON public.learning_goals(user_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_goal_milestones_goal ON public.goal_milestones(goal_id, order_index);
CREATE INDEX IF NOT EXISTS idx_study_plan_blocks_user_time ON public.study_plan_blocks(user_id, start_time);
CREATE INDEX IF NOT EXISTS idx_calendar_reminders_user_time ON public.calendar_reminders(user_id, reminder_time) WHERE NOT is_dismissed;
CREATE INDEX IF NOT EXISTS idx_tutor_avail_rules_tutor ON public.tutor_availability_rules(tutor_id, day_of_week) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_session_bookings_learner ON public.session_bookings(learner_id, start_time);
CREATE INDEX IF NOT EXISTS idx_session_bookings_tutor ON public.session_bookings(tutor_id, start_time);
CREATE INDEX IF NOT EXISTS idx_session_bookings_active_slots ON public.session_bookings(tutor_id, start_time, end_time) WHERE status IN ('requested', 'accepted', 'confirmed');
CREATE INDEX IF NOT EXISTS idx_saved_collections_user ON public.saved_collections(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_items_collection ON public.saved_items(collection_id);
CREATE INDEX IF NOT EXISTS idx_challenge_defs_active ON public.challenge_definitions(is_active, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_challenge_progress_user ON public.challenge_progress(user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON public.user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_code ON public.user_achievements(verification_code);
CREATE INDEX IF NOT EXISTS idx_user_activity_events_user ON public.user_activity_events(user_id, created_at DESC);

-- ENABLE ROW LEVEL SECURITY
ALTER TABLE public.learning_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_planner_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_plan_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_availability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_availability_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievement_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_events ENABLE ROW LEVEL SECURITY;

-- DROP EXISTING POLICIES IF PRESENT
DO $$
BEGIN
  -- Goals
  DROP POLICY IF EXISTS "Users can manage their own goals" ON public.learning_goals;
  DROP POLICY IF EXISTS "Public and connections can view permitted goals" ON public.learning_goals;
  DROP POLICY IF EXISTS "Users can manage milestones for their goals" ON public.goal_milestones;
  
  -- Planner & Calendar
  DROP POLICY IF EXISTS "Users can manage their planner preferences" ON public.study_planner_preferences;
  DROP POLICY IF EXISTS "Users can manage their study plan blocks" ON public.study_plan_blocks;
  DROP POLICY IF EXISTS "Users can manage their calendar reminders" ON public.calendar_reminders;

  -- Availability & Booking
  DROP POLICY IF EXISTS "Tutors can manage their availability rules" ON public.tutor_availability_rules;
  DROP POLICY IF EXISTS "Anyone can view active tutor availability" ON public.tutor_availability_rules;
  DROP POLICY IF EXISTS "Tutors can manage availability exceptions" ON public.tutor_availability_exceptions;
  DROP POLICY IF EXISTS "Anyone can view tutor availability exceptions" ON public.tutor_availability_exceptions;
  DROP POLICY IF EXISTS "Participants can view and manage their bookings" ON public.session_bookings;
  DROP POLICY IF EXISTS "Participants can view booking status history" ON public.booking_status_history;

  -- Saved Collections
  DROP POLICY IF EXISTS "Users can manage their saved collections" ON public.saved_collections;

  -- Challenges & Achievements
  DROP POLICY IF EXISTS "Anyone can view active challenge definitions" ON public.challenge_definitions;
  DROP POLICY IF EXISTS "Admins can manage challenge definitions" ON public.challenge_definitions;
  DROP POLICY IF EXISTS "Users can view and update their challenge progress" ON public.challenge_progress;
  DROP POLICY IF EXISTS "Anyone can view achievement definitions" ON public.achievement_definitions;
  DROP POLICY IF EXISTS "Admins can manage achievement definitions" ON public.achievement_definitions;
  DROP POLICY IF EXISTS "Users can view their own achievements and public ones" ON public.user_achievements;
  DROP POLICY IF EXISTS "Users can manage their own achievement visibility" ON public.user_achievements;
  DROP POLICY IF EXISTS "user_achievements_read" ON public.user_achievements;

  -- Activity Events
  DROP POLICY IF EXISTS "Users can view their own activity events" ON public.user_activity_events;
END;
$$;

-- RLS POLICIES
CREATE POLICY "Users can manage their own goals"
  ON public.learning_goals FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Public and connections can view permitted goals"
  ON public.learning_goals FOR SELECT
  USING (
    visibility = 'public'
    OR (visibility = 'connections' AND EXISTS (
      SELECT 1 FROM public.connections
      WHERE (user_a = auth.uid() AND user_b = user_id)
         OR (user_b = auth.uid() AND user_a = user_id)
    ))
  );

CREATE POLICY "Users can manage milestones for their goals"
  ON public.goal_milestones FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their planner preferences"
  ON public.study_planner_preferences FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their study plan blocks"
  ON public.study_plan_blocks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their calendar reminders"
  ON public.calendar_reminders FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Tutors can manage their availability rules"
  ON public.tutor_availability_rules FOR ALL
  USING (auth.uid() = tutor_id)
  WITH CHECK (auth.uid() = tutor_id);

CREATE POLICY "Anyone can view active tutor availability"
  ON public.tutor_availability_rules FOR SELECT
  USING (is_active = true);

CREATE POLICY "Tutors can manage availability exceptions"
  ON public.tutor_availability_exceptions FOR ALL
  USING (auth.uid() = tutor_id)
  WITH CHECK (auth.uid() = tutor_id);

CREATE POLICY "Anyone can view tutor availability exceptions"
  ON public.tutor_availability_exceptions FOR SELECT
  USING (true);

CREATE POLICY "Participants can view and manage their bookings"
  ON public.session_bookings FOR ALL
  USING (auth.uid() = learner_id OR auth.uid() = tutor_id)
  WITH CHECK (auth.uid() = learner_id OR auth.uid() = tutor_id);

CREATE POLICY "Participants can view booking status history"
  ON public.booking_status_history FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.session_bookings b
    WHERE b.id = booking_id AND (b.learner_id = auth.uid() OR b.tutor_id = auth.uid())
  ));

CREATE POLICY "Users can manage their saved collections"
  ON public.saved_collections FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Anyone can view active challenge definitions"
  ON public.challenge_definitions FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage challenge definitions"
  ON public.challenge_definitions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND 'admin' = ANY(p.roles)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND 'admin' = ANY(p.roles)
  ));

CREATE POLICY "Users can view and update their challenge progress"
  ON public.challenge_progress FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Anyone can view achievement definitions"
  ON public.achievement_definitions FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage achievement definitions"
  ON public.achievement_definitions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND 'admin' = ANY(p.roles)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND 'admin' = ANY(p.roles)
  ));

CREATE POLICY "Users can view their own achievements and public ones"
  ON public.user_achievements FOR SELECT
  USING (auth.uid() = user_id OR is_public = true);

CREATE POLICY "Users can manage their own achievement visibility"
  ON public.user_achievements FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own activity events"
  ON public.user_activity_events FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================================
-- ATOMIC STORED PROCEDURES (SECURITY DEFINER, FIXED SEARCH PATH)
-- ============================================================================

-- 1. ACTIVATE LEARNING GOAL ATOMIC
CREATE OR REPLACE FUNCTION public.activate_learning_goal_atomic(
  p_goal_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_goal record;
  v_total_weight integer;
BEGIN
  SELECT * INTO v_goal
  FROM public.learning_goals
  WHERE id = p_goal_id AND user_id = p_user_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Goal not found or unauthorized' USING ERRCODE = 'P0002';
  END IF;

  IF v_goal.status = 'active' THEN
    RETURN jsonb_build_object('success', true, 'status', 'active', 'message', 'Goal is already active');
  END IF;

  IF v_goal.target_date < v_goal.start_date THEN
    RAISE EXCEPTION 'Target date cannot precede start date' USING ERRCODE = '22000';
  END IF;

  SELECT coalesce(sum(weight), 0) INTO v_total_weight
  FROM public.goal_milestones
  WHERE goal_id = p_goal_id;

  IF v_total_weight <> 100 THEN
    RAISE EXCEPTION 'Total milestone weight must equal exactly 100 before activating (current: %)', v_total_weight USING ERRCODE = '22000';
  END IF;

  UPDATE public.learning_goals
  SET status = 'active', updated_at = now()
  WHERE id = p_goal_id;

  INSERT INTO public.user_activity_events (user_id, event_type, event_title, metadata, is_verified)
  VALUES (p_user_id, 'goal_milestone', 'Activated Goal: ' || v_goal.title, jsonb_build_object('goal_id', p_goal_id), true);

  RETURN jsonb_build_object('success', true, 'status', 'active');
END;
$$;

-- 2. COMPLETE GOAL MILESTONE ATOMIC
CREATE OR REPLACE FUNCTION public.complete_goal_milestone_atomic(
  p_milestone_id uuid,
  p_user_id uuid,
  p_verified_type text DEFAULT NULL,
  p_verified_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_milestone record;
  v_goal record;
  v_total_progress integer;
  v_reward_points integer := 50;
  v_reward_idempotency text;
BEGIN
  SELECT * INTO v_milestone
  FROM public.goal_milestones
  WHERE id = p_milestone_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Milestone not found or unauthorized' USING ERRCODE = 'P0002';
  END IF;

  IF v_milestone.is_completed THEN
    RETURN jsonb_build_object('success', true, 'is_completed', true, 'already_completed', true);
  END IF;

  UPDATE public.goal_milestones
  SET is_completed = true,
      completed_at = now(),
      is_verified = (p_verified_type IS NOT NULL),
      verified_activity_type = p_verified_type,
      verified_activity_id = p_verified_id,
      updated_at = now()
  WHERE id = p_milestone_id;

  -- Recalculate goal progress
  SELECT coalesce(sum(weight), 0) INTO v_total_progress
  FROM public.goal_milestones
  WHERE goal_id = v_milestone.goal_id AND is_completed = true;

  v_total_progress := least(100, v_total_progress);

  SELECT * INTO v_goal
  FROM public.learning_goals
  WHERE id = v_milestone.goal_id;

  IF v_total_progress >= 100 AND v_goal.status <> 'completed' THEN
    UPDATE public.learning_goals
    SET progress_percent = 100,
        status = 'completed',
        completed_at = now(),
        updated_at = now()
    WHERE id = v_milestone.goal_id;

    -- Award idempotent reputation reward
    v_reward_idempotency := 'goal_completion:' || v_milestone.goal_id::text;
    INSERT INTO public.points_ledger (user_id, points, action, reference_id, created_at)
    VALUES (p_user_id, v_reward_points, v_reward_idempotency, v_milestone.goal_id, now())
    ON CONFLICT (action) DO NOTHING;

    -- Aggregate reputation to profile
    UPDATE public.profiles
    SET reputation_score = (
      SELECT coalesce(sum(points), 0) FROM public.points_ledger WHERE user_id = p_user_id
    )
    WHERE id = p_user_id;

    INSERT INTO public.user_activity_events (user_id, event_type, event_title, metadata, is_verified)
    VALUES (p_user_id, 'goal_milestone', 'Completed Goal: ' || v_goal.title, jsonb_build_object('goal_id', v_goal.id, 'points', v_reward_points), true);
  ELSE
    UPDATE public.learning_goals
    SET progress_percent = v_total_progress,
        updated_at = now()
    WHERE id = v_milestone.goal_id;

    INSERT INTO public.user_activity_events (user_id, event_type, event_title, metadata, is_verified)
    VALUES (p_user_id, 'goal_milestone', 'Completed Milestone: ' || v_milestone.title, jsonb_build_object('goal_id', v_milestone.goal_id, 'milestone_id', p_milestone_id), p_verified_type IS NOT NULL);
  END IF;

  RETURN jsonb_build_object('success', true, 'progress_percent', v_total_progress, 'goal_completed', (v_total_progress >= 100));
END;
$$;

-- 3. REQUEST SESSION BOOKING ATOMIC
CREATE OR REPLACE FUNCTION public.request_session_booking_atomic(
  p_learner_id uuid,
  p_tutor_id uuid,
  p_skill_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_mode text,
  p_note text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_booking record;
  v_booking_id uuid;
  v_duration integer;
  v_conflict_count integer;
  v_tutor_status text;
BEGIN
  IF p_learner_id = p_tutor_id THEN
    RAISE EXCEPTION 'Cannot book a session with yourself' USING ERRCODE = '22000';
  END IF;

  IF p_end_time <= p_start_time THEN
    RAISE EXCEPTION 'End time must be after start time' USING ERRCODE = '22000';
  END IF;

  -- Check if tutor exists
  SELECT id INTO v_tutor_status
  FROM public.profiles
  WHERE id = p_tutor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tutor profile not found' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing_booking
    FROM public.session_bookings
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN jsonb_build_object('booking_id', v_existing_booking.id, 'status', v_existing_booking.status, 'idempotent', true);
    END IF;
  END IF;

  -- Concurrency check: prevent double booking using table lock on session_bookings for overlapping active bookings
  PERFORM pg_advisory_xact_lock(hashtext('booking_' || p_tutor_id::text));

  SELECT count(*) INTO v_conflict_count
  FROM public.session_bookings
  WHERE tutor_id = p_tutor_id
    AND status IN ('requested', 'accepted', 'confirmed')
    AND tstzrange(start_time, end_time) && tstzrange(p_start_time, p_end_time);

  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION 'The tutor has a conflicting booking during this requested time window' USING ERRCODE = '23505';
  END IF;

  v_duration := EXTRACT(EPOCH FROM (p_end_time - p_start_time)) / 60;

  INSERT INTO public.session_bookings (
    learner_id, tutor_id, skill_id, start_time, end_time, duration_minutes,
    mode, status, learner_note, idempotency_key, created_at, updated_at
  )
  VALUES (
    p_learner_id, p_tutor_id, p_skill_id, p_start_time, p_end_time, v_duration,
    p_mode, 'requested', p_note, p_idempotency_key, now(), now()
  )
  RETURNING id INTO v_booking_id;

  INSERT INTO public.booking_status_history (booking_id, from_status, to_status, changed_by_user_id, note)
  VALUES (v_booking_id, 'none', 'requested', p_learner_id, p_note);

  RETURN jsonb_build_object('booking_id', v_booking_id, 'status', 'requested');
END;
$$;

-- 4. UPDATE BOOKING STATUS ATOMIC
CREATE OR REPLACE FUNCTION public.update_booking_status_atomic(
  p_booking_id uuid,
  p_user_id uuid,
  p_new_status text,
  p_note text DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking record;
BEGIN
  SELECT * INTO v_booking
  FROM public.session_bookings
  WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_user_id <> v_booking.learner_id AND p_user_id <> v_booking.tutor_id THEN
    RAISE EXCEPTION 'Unauthorized to modify this booking' USING ERRCODE = '42501';
  END IF;

  -- State machine validation
  IF p_new_status = 'accepted' AND p_user_id <> v_booking.tutor_id THEN
    RAISE EXCEPTION 'Only the tutor can accept a booking request' USING ERRCODE = '42501';
  END IF;

  IF p_new_status = 'declined' AND p_user_id <> v_booking.tutor_id THEN
    RAISE EXCEPTION 'Only the tutor can decline a booking request' USING ERRCODE = '42501';
  END IF;

  IF v_booking.status IN ('completed', 'declined', 'cancelled', 'expired') THEN
    RAISE EXCEPTION 'Cannot transition booking from terminal state %', v_booking.status USING ERRCODE = '22000';
  END IF;

  UPDATE public.session_bookings
  SET status = p_new_status,
      tutor_note = CASE WHEN p_user_id = v_booking.tutor_id AND p_note IS NOT NULL THEN p_note ELSE tutor_note END,
      cancellation_reason = CASE WHEN p_new_status IN ('declined', 'cancelled') THEN coalesce(p_reason, p_note) ELSE cancellation_reason END,
      updated_at = now()
  WHERE id = p_booking_id;

  INSERT INTO public.booking_status_history (booking_id, from_status, to_status, changed_by_user_id, note)
  VALUES (p_booking_id, v_booking.status, p_new_status, p_user_id, coalesce(p_reason, p_note));

  RETURN jsonb_build_object('success', true, 'from_status', v_booking.status, 'to_status', p_new_status);
END;
$$;

-- 5. COMPLETE BOOKING ATOMIC
CREATE OR REPLACE FUNCTION public.complete_booking_atomic(
  p_booking_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking record;
  v_tutor_reward integer := 30;
  v_learner_reward integer := 15;
  v_tutor_key text;
  v_learner_key text;
BEGIN
  SELECT * INTO v_booking
  FROM public.session_bookings
  WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_user_id <> v_booking.tutor_id AND p_user_id <> v_booking.learner_id THEN
    RAISE EXCEPTION 'Unauthorized to complete this booking' USING ERRCODE = '42501';
  END IF;

  IF v_booking.status = 'completed' THEN
    RETURN jsonb_build_object('success', true, 'status', 'completed', 'already_completed', true);
  END IF;

  IF v_booking.status NOT IN ('accepted', 'confirmed') THEN
    RAISE EXCEPTION 'Cannot complete booking in % status', v_booking.status USING ERRCODE = '22000';
  END IF;

  UPDATE public.session_bookings
  SET status = 'completed', updated_at = now()
  WHERE id = p_booking_id;

  INSERT INTO public.booking_status_history (booking_id, from_status, to_status, changed_by_user_id, note)
  VALUES (p_booking_id, v_booking.status, 'completed', p_user_id, 'Session marked completed');

  -- Tutor reward
  v_tutor_key := 'booking_taught:' || p_booking_id::text;
  INSERT INTO public.points_ledger (user_id, points, action, reference_id, created_at)
  VALUES (v_booking.tutor_id, v_tutor_reward, v_tutor_key, p_booking_id, now())
  ON CONFLICT (action) DO NOTHING;

  -- Learner reward
  v_learner_key := 'booking_attended:' || p_booking_id::text;
  INSERT INTO public.points_ledger (user_id, points, action, reference_id, created_at)
  VALUES (v_booking.learner_id, v_learner_reward, v_learner_key, p_booking_id, now())
  ON CONFLICT (action) DO NOTHING;

  -- Update profiles reputation scores
  UPDATE public.profiles
  SET reputation_score = (SELECT coalesce(sum(points), 0) FROM public.points_ledger WHERE user_id = v_booking.tutor_id)
  WHERE id = v_booking.tutor_id;

  UPDATE public.profiles
  SET reputation_score = (SELECT coalesce(sum(points), 0) FROM public.points_ledger WHERE user_id = v_booking.learner_id)
  WHERE id = v_booking.learner_id;

  -- Log activity
  INSERT INTO public.user_activity_events (user_id, event_type, event_title, metadata, is_verified)
  VALUES 
    (v_booking.tutor_id, 'booking_completed', 'Completed Tutoring Session', jsonb_build_object('booking_id', p_booking_id, 'duration', v_booking.duration_minutes), true),
    (v_booking.learner_id, 'booking_completed', 'Completed Learning Session', jsonb_build_object('booking_id', p_booking_id, 'duration', v_booking.duration_minutes), true);

  RETURN jsonb_build_object('success', true, 'status', 'completed');
END;
$$;

-- 6. CLAIM CHALLENGE REWARD ATOMIC
CREATE OR REPLACE FUNCTION public.claim_challenge_reward_atomic(
  p_challenge_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge record;
  v_progress record;
  v_action_key text;
BEGIN
  SELECT * INTO v_challenge
  FROM public.challenge_definitions
  WHERE id = p_challenge_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Challenge definition not found or inactive' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_progress
  FROM public.challenge_progress
  WHERE challenge_id = p_challenge_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No challenge progress found for user' USING ERRCODE = 'P0002';
  END IF;

  IF v_progress.status = 'claimed' THEN
    RETURN jsonb_build_object('success', true, 'status', 'claimed', 'already_claimed', true);
  END IF;

  IF v_progress.current_count < v_challenge.target_count THEN
    RAISE EXCEPTION 'Challenge requirements not yet met (current: %, required: %)', v_progress.current_count, v_challenge.target_count USING ERRCODE = '22000';
  END IF;

  UPDATE public.challenge_progress
  SET status = 'claimed', claimed_at = now(), updated_at = now()
  WHERE challenge_id = p_challenge_id AND user_id = p_user_id;

  v_action_key := 'challenge_claim:' || p_challenge_id::text || ':' || p_user_id::text;
  INSERT INTO public.points_ledger (user_id, points, action, reference_id, created_at)
  VALUES (p_user_id, v_challenge.points_reward, v_action_key, p_challenge_id, now())
  ON CONFLICT (action) DO NOTHING;

  UPDATE public.profiles
  SET reputation_score = (SELECT coalesce(sum(points), 0) FROM public.points_ledger WHERE user_id = p_user_id)
  WHERE id = p_user_id;

  INSERT INTO public.user_activity_events (user_id, event_type, event_title, metadata, is_verified)
  VALUES (p_user_id, 'challenge_claimed', 'Completed Challenge: ' || v_challenge.title, jsonb_build_object('challenge_id', p_challenge_id, 'points', v_challenge.points_reward), true);

  RETURN jsonb_build_object('success', true, 'status', 'claimed', 'points_awarded', v_challenge.points_reward);
END;
$$;

-- 7. ISSUE ACHIEVEMENT ATOMIC
CREATE OR REPLACE FUNCTION public.issue_achievement_atomic(
  p_user_id uuid,
  p_achievement_id uuid,
  p_issued_by uuid,
  p_is_public boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_achievement record;
  v_existing record;
  v_code text;
  v_action_key text;
BEGIN
  SELECT * INTO v_achievement
  FROM public.achievement_definitions
  WHERE id = p_achievement_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Achievement definition not found or inactive' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_existing
  FROM public.user_achievements
  WHERE user_id = p_user_id AND achievement_id = p_achievement_id;

  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'id', v_existing.id, 'verification_code', v_existing.verification_code, 'already_issued', true);
  END IF;

  -- Generate non-guessable verification code
  v_code := 'SB-ACH-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)) || '-' || upper(substr(md5(random()::text || p_user_id::text), 1, 8));

  INSERT INTO public.user_achievements (
    user_id, achievement_id, verification_code, is_public, issued_at, created_at
  )
  VALUES (
    p_user_id, p_achievement_id, v_code, p_is_public, now(), now()
  );

  v_action_key := 'achievement_issued:' || p_achievement_id::text || ':' || p_user_id::text;
  IF v_achievement.points_reward > 0 THEN
    INSERT INTO public.points_ledger (user_id, points, action, reference_id, created_at)
    VALUES (p_user_id, v_achievement.points_reward, v_action_key, p_achievement_id, now())
    ON CONFLICT (action) DO NOTHING;

    UPDATE public.profiles
    SET reputation_score = (SELECT coalesce(sum(points), 0) FROM public.points_ledger WHERE user_id = p_user_id)
    WHERE id = p_user_id;
  END IF;

  INSERT INTO public.user_activity_events (user_id, event_type, event_title, metadata, is_verified)
  VALUES (p_user_id, 'achievement_earned', 'Earned Achievement: ' || v_achievement.title, jsonb_build_object('achievement_id', p_achievement_id, 'verification_code', v_code), true);

  RETURN jsonb_build_object('success', true, 'verification_code', v_code, 'points_reward', v_achievement.points_reward);
END;
$$;

-- REVOKE EXECUTE ON RPCs FROM PUBLIC / ANON
REVOKE EXECUTE ON FUNCTION public.activate_learning_goal_atomic(uuid, uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.complete_goal_milestone_atomic(uuid, uuid, text, uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.request_session_booking_atomic(uuid, uuid, uuid, timestamptz, timestamptz, text, text, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.update_booking_status_atomic(uuid, uuid, text, text, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.complete_booking_atomic(uuid, uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.claim_challenge_reward_atomic(uuid, uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.issue_achievement_atomic(uuid, uuid, uuid, boolean) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.activate_learning_goal_atomic(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_goal_milestone_atomic(uuid, uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_session_booking_atomic(uuid, uuid, uuid, timestamptz, timestamptz, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_booking_status_atomic(uuid, uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_booking_atomic(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_challenge_reward_atomic(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.issue_achievement_atomic(uuid, uuid, uuid, boolean) TO service_role;

COMMIT;
