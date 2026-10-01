-- =============================================================================
-- SkillBridge Academic Calendar & Routine Engine Migration
-- =============================================================================

-- ── 1. Academic Profiles ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academic_profiles (
  user_id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  university        text NOT NULL DEFAULT 'RUET',
  department        text NOT NULL DEFAULT 'CSE',
  semester          text NOT NULL DEFAULT '1-1',
  section           text NOT NULL DEFAULT 'A',
  batch             text,
  academic_group    text NOT NULL DEFAULT 'RUET / CSE / 1-1 / A',
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE academic_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own academic profile"
  ON academic_profiles FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can view academic profiles for class matching"
  ON academic_profiles FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_academic_profiles_group ON academic_profiles(academic_group);

-- ── 2. Academic Routines (Versions & Shared) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS academic_routines (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title               text NOT NULL,
  university          text NOT NULL,
  department          text NOT NULL,
  semester            text NOT NULL,
  section             text NOT NULL,
  batch               text,
  academic_group      text NOT NULL,
  version             integer NOT NULL DEFAULT 1,
  is_active           boolean NOT NULL DEFAULT false,
  is_public           boolean NOT NULL DEFAULT false,
  source_type         text NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual', 'pdf_import', 'public_copy')),
  verification_status text NOT NULL DEFAULT 'ai_draft' CHECK (verification_status IN ('ai_draft', 'user_verified', 'class_shared', 'community_confirmed', 'needs_review', 'reported_issue')),
  verified_at         timestamptz,
  original_file_url   text,
  raw_metadata        jsonb NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE academic_routines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own routines"
  ON academic_routines FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view public routines matching academic groups"
  ON academic_routines FOR SELECT
  USING (is_public = true AND auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_routines_user_active ON academic_routines(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_routines_group_public ON academic_routines(academic_group, is_public);

-- ── 3. Routine Entries (Classes / Labs) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS routine_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id    uuid NOT NULL REFERENCES academic_routines(id) ON DELETE CASCADE,
  course_code   text NOT NULL,
  course_title  text NOT NULL,
  day_of_week   text NOT NULL CHECK (day_of_week IN ('Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday')),
  start_time    text NOT NULL, -- HH:MM 24h
  end_time      text NOT NULL, -- HH:MM 24h
  room          text,
  instructor    text,
  type          text NOT NULL DEFAULT 'CLASS' CHECK (type IN ('CLASS', 'LAB', 'OTHER')),
  group_name    text, -- e.g. A1, A2, or All
  confidence    text NOT NULL DEFAULT 'high' CHECK (confidence IN ('high', 'medium', 'low', 'ambiguous')),
  warnings      text[] NOT NULL DEFAULT '{}',
  is_confirmed  boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE routine_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage entries of own routines"
  ON routine_entries FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM academic_routines r
      WHERE r.id = routine_entries.routine_id AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM academic_routines r
      WHERE r.id = routine_entries.routine_id AND r.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view entries of public routines"
  ON routine_entries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM academic_routines r
      WHERE r.id = routine_entries.routine_id AND (r.user_id = auth.uid() OR r.is_public = true)
    )
  );

CREATE INDEX IF NOT EXISTS idx_routine_entries_routine_day ON routine_entries(routine_id, day_of_week, start_time);

-- ── 4. Public Routine Validations & Issue Reports ──────────────────────────────
CREATE TABLE IF NOT EXISTS routine_validations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id      uuid NOT NULL REFERENCES academic_routines(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status          text NOT NULL CHECK (status IN ('confirmed', 'reported')),
  issue_category  text CHECK (issue_category IN ('wrong_time', 'wrong_course', 'wrong_section', 'outdated', 'duplicate', 'other')),
  comment         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(routine_id, user_id)
);

ALTER TABLE routine_validations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own validations"
  ON routine_validations FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "All authenticated users can see routine validation counts"
  ON routine_validations FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_routine_validations_routine ON routine_validations(routine_id, status);

-- ── 5. User-Specific Overrides for Routine Entries ─────────────────────────────
CREATE TABLE IF NOT EXISTS user_routine_overrides (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  routine_id          uuid NOT NULL REFERENCES academic_routines(id) ON DELETE CASCADE,
  routine_entry_id    uuid NOT NULL REFERENCES routine_entries(id) ON DELETE CASCADE,
  custom_room         text,
  custom_instructor   text,
  custom_start_time   text,
  custom_end_time     text,
  custom_notes        text,
  is_hidden           boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, routine_entry_id)
);

ALTER TABLE user_routine_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own overrides"
  ON user_routine_overrides FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_overrides_lookup ON user_routine_overrides(user_id, routine_id);

-- ── 6. Academic Calendar Events & Tasks ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academic_calendar_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  routine_entry_id  uuid REFERENCES routine_entries(id) ON DELETE SET NULL,
  title             text NOT NULL,
  event_type        text NOT NULL CHECK (event_type IN ('CLASS', 'LAB', 'QUIZ', 'ASSIGNMENT', 'EXAM', 'PRESENTATION', 'PROJECT', 'DEADLINE', 'PERSONAL_TASK', 'HOLIDAY', 'OTHER')),
  course_code       text,
  course_title      text,
  description       text,
  location          text,
  instructor        text,
  date              date NOT NULL,
  start_time        text NOT NULL, -- HH:MM
  end_time          text,          -- HH:MM
  is_all_day        boolean NOT NULL DEFAULT false,
  is_completed      boolean NOT NULL DEFAULT false,
  priority          text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  is_exception      boolean NOT NULL DEFAULT false,
  exception_type    text CHECK (exception_type IN ('cancelled', 'rescheduled', 'makeup', 'extra')),
  original_date     date,
  reminder_minutes  integer[] NOT NULL DEFAULT '{60}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE academic_calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own calendar events"
  ON academic_calendar_events FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_academic_events_user_date ON academic_calendar_events(user_id, date, start_time);
CREATE INDEX IF NOT EXISTS idx_academic_events_type ON academic_calendar_events(user_id, event_type);

-- ── 7. Academic Notification Preferences ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS academic_notification_preferences (
  user_id               uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  notify_classes        boolean NOT NULL DEFAULT true,
  class_lead_minutes    integer NOT NULL DEFAULT 60,
  notify_assignments    boolean NOT NULL DEFAULT true,
  assignment_lead_hours integer NOT NULL DEFAULT 24,
  notify_exams          boolean NOT NULL DEFAULT true,
  exam_lead_hours       integer NOT NULL DEFAULT 24,
  notify_tasks          boolean NOT NULL DEFAULT true,
  task_lead_minutes     integer NOT NULL DEFAULT 30,
  smart_grouping        boolean NOT NULL DEFAULT true,
  timezone              text NOT NULL DEFAULT 'Asia/Dhaka',
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE academic_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own notification preferences"
  ON academic_notification_preferences FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 8. Academic Audit Log ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academic_audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  routine_id  uuid REFERENCES academic_routines(id) ON DELETE SET NULL,
  action      text NOT NULL,
  details     jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE academic_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own audit logs"
  ON academic_audit_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own audit logs"
  ON academic_audit_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_academic_audit_user ON academic_audit_logs(user_id, created_at DESC);
