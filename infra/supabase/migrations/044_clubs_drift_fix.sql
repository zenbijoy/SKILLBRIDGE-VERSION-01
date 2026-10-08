-- =============================================================================
-- Migration 044: Club Platform Drift & Event Integration Fix
-- Consolidated schema guarantees for Clubs, Events, and Calendar Integration
-- =============================================================================

-- ── 1. Ensure clubs columns and constraints ─────────────────────────────────
ALTER TABLE clubs 
  ADD COLUMN IF NOT EXISTS tagline text,
  ADD COLUMN IF NOT EXISTS banner_url text,
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'General',
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS founded_year integer,
  ADD COLUMN IF NOT EXISTS social_links jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS membership_type text DEFAULT 'open' CHECK (membership_type IN ('open', 'application', 'invite_only')),
  ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mission text,
  ADD COLUMN IF NOT EXISTS vision text,
  ADD COLUMN IF NOT EXISTS activities_summary text,
  ADD COLUMN IF NOT EXISTS room_id uuid REFERENCES rooms(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clubs_category ON clubs(category);
CREATE INDEX IF NOT EXISTS idx_clubs_university ON clubs(university);
CREATE INDEX IF NOT EXISTS idx_clubs_verified ON clubs(verified);

-- ── 2. Ensure club_members role hierarchy ────────────────────────────────────
ALTER TABLE club_members 
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS team_id uuid,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

ALTER TABLE club_members DROP CONSTRAINT IF EXISTS club_members_role_check;
ALTER TABLE club_members ADD CONSTRAINT club_members_role_check 
  CHECK (role IN ('owner', 'admin', 'president', 'vice_president', 'secretary', 'treasurer', 'executive', 'team_lead', 'moderator', 'member'));

-- ── 3. Ensure events columns and status check ────────────────────────────────
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS poster_url text,
  ADD COLUMN IF NOT EXISTS venue_type text DEFAULT 'offline' CHECK (venue_type IN ('offline', 'online', 'hybrid')),
  ADD COLUMN IF NOT EXISTS speakers jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS agenda jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS attendance_code text,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_status_check;
ALTER TABLE events ADD CONSTRAINT events_status_check 
  CHECK (status IN ('draft', 'published', 'open', 'closed', 'completed', 'cancelled', 'scheduled'));

-- ── 4. Club Follows ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS club_follows (
  club_id       uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id, user_id)
);

ALTER TABLE club_follows ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'club_follows' AND policyname = 'Anyone can view club followers count') THEN
    CREATE POLICY "Anyone can view club followers count" ON club_follows FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'club_follows' AND policyname = 'Users can follow/unfollow clubs') THEN
    CREATE POLICY "Users can follow/unfollow clubs" ON club_follows FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_club_follows_user ON club_follows(user_id);

-- ── 5. Club Posts & Feeds ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS club_posts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id         uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  author_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type            text NOT NULL DEFAULT 'discussion' 
                  CHECK (type IN ('announcement', 'discussion', 'question', 'achievement', 'project_update', 'event_update', 'resource')),
  title           text,
  content         text NOT NULL,
  media_urls      text[] DEFAULT ARRAY[]::text[],
  is_pinned       boolean NOT NULL DEFAULT false,
  likes_count     integer NOT NULL DEFAULT 0,
  comments_count  integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE club_posts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'club_posts' AND policyname = 'Public can view club posts') THEN
    CREATE POLICY "Public can view club posts" ON club_posts FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'club_posts' AND policyname = 'Club members can insert posts') THEN
    CREATE POLICY "Club members can insert posts" ON club_posts FOR INSERT
      WITH CHECK (
        EXISTS (SELECT 1 FROM club_members cm WHERE cm.club_id = club_posts.club_id AND cm.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM clubs c WHERE c.id = club_posts.club_id AND c.created_by = auth.uid())
      );
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_club_posts_club ON club_posts(club_id, is_pinned DESC, created_at DESC);

-- ── 6. Club Post Likes & Comments ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS club_post_likes (
  post_id     uuid NOT NULL REFERENCES club_posts(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

ALTER TABLE club_post_likes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'club_post_likes' AND policyname = 'Anyone can view likes') THEN
    CREATE POLICY "Anyone can view likes" ON club_post_likes FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'club_post_likes' AND policyname = 'Authenticated users can toggle likes') THEN
    CREATE POLICY "Authenticated users can toggle likes" ON club_post_likes FOR ALL
      USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS club_post_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     uuid NOT NULL REFERENCES club_posts(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE club_post_comments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'club_post_comments' AND policyname = 'Anyone can view comments') THEN
    CREATE POLICY "Anyone can view comments" ON club_post_comments FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'club_post_comments' AND policyname = 'Authenticated users can comment') THEN
    CREATE POLICY "Authenticated users can comment" ON club_post_comments FOR INSERT
      WITH CHECK (auth.uid() = author_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_club_post_comments_post ON club_post_comments(post_id, created_at ASC);

-- ── 7. Club Teams ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS club_teams (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id       uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text,
  lead_id       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE club_teams ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'club_teams' AND policyname = 'Anyone can view club teams') THEN
    CREATE POLICY "Anyone can view club teams" ON club_teams FOR SELECT USING (true);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_club_teams_club ON club_teams(club_id);

-- ── 8. Club Recruitments & Applications ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS club_recruitments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id               uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  title                 text NOT NULL,
  description           text NOT NULL DEFAULT '',
  open_positions        text[] NOT NULL DEFAULT ARRAY[]::text[],
  required_skills       text[] NOT NULL DEFAULT ARRAY[]::text[],
  eligible_departments  text[] NOT NULL DEFAULT ARRAY[]::text[],
  eligible_semesters    text[] NOT NULL DEFAULT ARRAY[]::text[],
  deadline              timestamptz NOT NULL,
  stages                text[] NOT NULL DEFAULT ARRAY['Applied', 'Shortlisted', 'Interview', 'Selected', 'Rejected']::text[],
  form_schema           jsonb NOT NULL DEFAULT '[]'::jsonb,
  status                text NOT NULL DEFAULT 'open' CHECK (status IN ('draft', 'open', 'closed')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE club_recruitments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'club_recruitments' AND policyname = 'Anyone can view open recruitments') THEN
    CREATE POLICY "Anyone can view open recruitments" ON club_recruitments FOR SELECT USING (true);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_club_recruitments_club ON club_recruitments(club_id, status);

CREATE TABLE IF NOT EXISTS club_applications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id           uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  recruitment_id    uuid REFERENCES club_recruitments(id) ON DELETE SET NULL,
  user_id           uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  applied_position  text,
  answers           jsonb NOT NULL DEFAULT '{}'::jsonb,
  resume_url        text,
  portfolio_url     text,
  statement         text,
  status            text NOT NULL DEFAULT 'applied' 
                    CHECK (status IN ('applied', 'shortlisted', 'interview', 'selected', 'rejected', 'withdrawn')),
  review_notes      text,
  reviewed_by       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, recruitment_id, user_id)
);

ALTER TABLE club_applications ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'club_applications' AND policyname = 'Applicants can view their own application') THEN
    CREATE POLICY "Applicants can view their own application" ON club_applications FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'club_applications' AND policyname = 'Users can submit applications') THEN
    CREATE POLICY "Users can submit applications" ON club_applications FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_club_applications_user ON club_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_club_applications_recruitment ON club_applications(recruitment_id, status);

-- ── 9. Club Projects & Tasks ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS club_projects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id         uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  team_id         uuid REFERENCES club_teams(id) ON DELETE SET NULL,
  title           text NOT NULL,
  description     text NOT NULL DEFAULT '',
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('idea', 'planning', 'active', 'completed', 'archived')),
  start_date      date DEFAULT CURRENT_DATE,
  deadline        date,
  lead_id         uuid REFERENCES profiles(id) ON DELETE SET NULL,
  cover_url       text,
  repository_url  text,
  demo_url        text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE club_projects ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'club_projects' AND policyname = 'Anyone can view club projects') THEN
    CREATE POLICY "Anyone can view club projects" ON club_projects FOR SELECT USING (true);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_club_projects_club ON club_projects(club_id, status);

CREATE TABLE IF NOT EXISTS club_project_tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES club_projects(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text,
  assigned_to   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  priority      text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status        text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'completed')),
  due_date      date,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE club_project_tasks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'club_project_tasks' AND policyname = 'Club members can view project tasks') THEN
    CREATE POLICY "Club members can view project tasks" ON club_project_tasks FOR SELECT USING (true);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_club_project_tasks ON club_project_tasks(project_id, status);

-- ── 10. Club Resources & Achievements ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS club_resources (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id         uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  project_id      uuid REFERENCES club_projects(id) ON DELETE SET NULL,
  uploader_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title           text NOT NULL,
  description     text,
  url             text NOT NULL,
  storage_path    text,
  file_size       integer,
  file_type       text DEFAULT 'document',
  category        text DEFAULT 'General',
  permission      text NOT NULL DEFAULT 'public' CHECK (permission IN ('public', 'followers', 'members', 'team')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE club_resources ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'club_resources' AND policyname = 'View resources based on permission') THEN
    CREATE POLICY "View resources based on permission" ON club_resources FOR SELECT USING (true);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_club_resources_club ON club_resources(club_id, category);

CREATE TABLE IF NOT EXISTS club_achievements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id       uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text NOT NULL DEFAULT '',
  date          date NOT NULL DEFAULT CURRENT_DATE,
  image_url     text,
  link_url      text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE club_achievements ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'club_achievements' AND policyname = 'Anyone can view club achievements') THEN
    CREATE POLICY "Anyone can view club achievements" ON club_achievements FOR SELECT USING (true);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_club_achievements_club ON club_achievements(club_id);

-- ── 11. Club Event Attendance ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS club_event_attendance (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  checked_in_at     timestamptz NOT NULL DEFAULT now(),
  checkin_method    text NOT NULL DEFAULT 'qr_scan' CHECK (checkin_method IN ('qr_scan', 'manual', 'link')),
  verified_by       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE (event_id, user_id)
);

ALTER TABLE club_event_attendance ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'club_event_attendance' AND policyname = 'Attendees and admins can view attendance') THEN
    CREATE POLICY "Attendees and admins can view attendance" ON club_event_attendance FOR SELECT USING (true);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_club_event_attendance ON club_event_attendance(event_id);

-- ── 12. Club Audit Logs ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS club_audit_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id         uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  actor_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action          text NOT NULL,
  target_entity   text,
  target_id       uuid,
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE club_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_club_audit_logs_club ON club_audit_logs(club_id, created_at DESC);

-- ── 13. Academic Calendar Integration ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS academic_calendar_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  routine_entry_id  uuid,
  title             text NOT NULL,
  event_type        text NOT NULL CHECK (event_type IN ('CLASS', 'LAB', 'QUIZ', 'ASSIGNMENT', 'EXAM', 'PRESENTATION', 'PROJECT', 'DEADLINE', 'PERSONAL_TASK', 'HOLIDAY', 'OTHER')),
  course_code       text,
  course_title      text,
  description       text,
  location          text,
  instructor        text,
  date              date NOT NULL,
  start_time        text NOT NULL,
  end_time          text,
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
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'academic_calendar_events' AND policyname = 'Users manage own calendar events') THEN
    CREATE POLICY "Users manage own calendar events" ON academic_calendar_events FOR ALL
      USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_academic_events_user_date ON academic_calendar_events(user_id, date, start_time);
