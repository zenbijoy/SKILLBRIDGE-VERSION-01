-- =============================================================================
-- SkillBridge Modern Club Platform Suite Migration
-- =============================================================================

-- ── 1. Enhance existing clubs table ──────────────────────────────────────────
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
  ADD COLUMN IF NOT EXISTS activities_summary text;

-- Index on clubs category & university
CREATE INDEX IF NOT EXISTS idx_clubs_category ON clubs(category);
CREATE INDEX IF NOT EXISTS idx_clubs_university ON clubs(university);
CREATE INDEX IF NOT EXISTS idx_clubs_verified ON clubs(verified);

-- ── 2. Enhance existing club_members table ───────────────────────────────────
ALTER TABLE club_members 
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS team_id uuid,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Adjust role check if needed or allow expanded role titles
ALTER TABLE club_members DROP CONSTRAINT IF EXISTS club_members_role_check;
ALTER TABLE club_members ADD CONSTRAINT club_members_role_check 
  CHECK (role IN ('owner', 'admin', 'president', 'vice_president', 'secretary', 'treasurer', 'executive', 'team_lead', 'moderator', 'member'));

-- ── 3. Enhance existing events table for clubs ───────────────────────────────
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS poster_url text,
  ADD COLUMN IF NOT EXISTS venue_type text DEFAULT 'offline' CHECK (venue_type IN ('offline', 'online', 'hybrid')),
  ADD COLUMN IF NOT EXISTS speakers jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS agenda jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS attendance_code text;

-- ── 4. Club Follows (separate from membership) ───────────────────────────────
CREATE TABLE IF NOT EXISTS club_follows (
  club_id       uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id, user_id)
);

ALTER TABLE club_follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view club followers count" ON club_follows FOR SELECT USING (true);
CREATE POLICY "Users can follow/unfollow clubs" ON club_follows FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_club_follows_user ON club_follows(user_id);

-- ── 5. Club Community Feed Posts ─────────────────────────────────────────────
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
CREATE POLICY "Public can view club posts" ON club_posts FOR SELECT USING (true);
CREATE POLICY "Club members can insert posts" ON club_posts FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM club_members cm WHERE cm.club_id = club_posts.club_id AND cm.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM clubs c WHERE c.id = club_posts.club_id AND c.created_by = auth.uid())
  );
CREATE POLICY "Authors or admins can update/delete posts" ON club_posts FOR ALL
  USING (
    author_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM club_members cm 
      WHERE cm.club_id = club_posts.club_id 
        AND cm.user_id = auth.uid() 
        AND cm.role IN ('owner', 'admin', 'president', 'moderator')
    )
  );

CREATE INDEX IF NOT EXISTS idx_club_posts_club ON club_posts(club_id, is_pinned DESC, created_at DESC);

-- ── 6. Club Post Likes & Comments ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS club_post_likes (
  post_id     uuid NOT NULL REFERENCES club_posts(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

ALTER TABLE club_post_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view likes" ON club_post_likes FOR SELECT USING (true);
CREATE POLICY "Authenticated users can toggle likes" ON club_post_likes FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS club_post_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     uuid NOT NULL REFERENCES club_posts(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE club_post_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view comments" ON club_post_comments FOR SELECT USING (true);
CREATE POLICY "Authenticated users can comment" ON club_post_comments FOR INSERT
  WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Comment authors can delete comments" ON club_post_comments FOR DELETE
  USING (author_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_club_post_comments_post ON club_post_comments(post_id, created_at ASC);

-- ── 7. Club Teams ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS club_teams (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id       uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text,
  lead_id       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE club_teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view club teams" ON club_teams FOR SELECT USING (true);
CREATE POLICY "Admins can manage club teams" ON club_teams FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM club_members cm 
      WHERE cm.club_id = club_teams.club_id 
        AND cm.user_id = auth.uid() 
        AND cm.role IN ('owner', 'admin', 'president', 'vice_president')
    )
  );

CREATE INDEX IF NOT EXISTS idx_club_teams_club ON club_teams(club_id);

-- ── 8. Club Recruitment Campaigns ────────────────────────────────────────────
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
CREATE POLICY "Anyone can view open recruitments" ON club_recruitments FOR SELECT USING (true);
CREATE POLICY "Club admins can manage recruitments" ON club_recruitments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM club_members cm 
      WHERE cm.club_id = club_recruitments.club_id 
        AND cm.user_id = auth.uid() 
        AND cm.role IN ('owner', 'admin', 'president', 'vice_president')
    )
  );

CREATE INDEX IF NOT EXISTS idx_club_recruitments_club ON club_recruitments(club_id, status);

-- ── 9. Club Applications (Recruitment & Membership) ──────────────────────────
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
CREATE POLICY "Applicants can view their own application" ON club_applications FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Club admins can view and manage all applications" ON club_applications FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM club_members cm 
      WHERE cm.club_id = club_applications.club_id 
        AND cm.user_id = auth.uid() 
        AND cm.role IN ('owner', 'admin', 'president', 'vice_president', 'moderator')
    )
  );
CREATE POLICY "Users can submit applications" ON club_applications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_club_applications_user ON club_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_club_applications_recruitment ON club_applications(recruitment_id, status);

-- ── 10. Club Projects ────────────────────────────────────────────────────────
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
CREATE POLICY "Anyone can view club projects" ON club_projects FOR SELECT USING (true);
CREATE POLICY "Club admins or project leads can manage projects" ON club_projects FOR ALL
  USING (
    lead_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM club_members cm 
      WHERE cm.club_id = club_projects.club_id 
        AND cm.user_id = auth.uid() 
        AND cm.role IN ('owner', 'admin', 'president', 'team_lead')
    )
  );

CREATE INDEX IF NOT EXISTS idx_club_projects_club ON club_projects(club_id, status);

-- ── 11. Club Project Tasks ───────────────────────────────────────────────────
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
CREATE POLICY "Club members can view project tasks" ON club_project_tasks FOR SELECT USING (true);
CREATE POLICY "Project members can manage tasks" ON club_project_tasks FOR ALL
  USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_club_project_tasks ON club_project_tasks(project_id, status);

-- ── 12. Club Resources & Documents ───────────────────────────────────────────
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
CREATE POLICY "View resources based on permission" ON club_resources FOR SELECT
  USING (
    permission = 'public'
    OR (permission IN ('followers', 'public') AND EXISTS (SELECT 1 FROM club_follows cf WHERE cf.club_id = club_resources.club_id AND cf.user_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM club_members cm WHERE cm.club_id = club_resources.club_id AND cm.user_id = auth.uid())
  );
CREATE POLICY "Club members can upload resources" ON club_resources FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM club_members cm WHERE cm.club_id = club_resources.club_id AND cm.user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_club_resources_club ON club_resources(club_id, category);

-- ── 13. Club Achievements ────────────────────────────────────────────────────
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
CREATE POLICY "Anyone can view club achievements" ON club_achievements FOR SELECT USING (true);
CREATE POLICY "Club admins can manage achievements" ON club_achievements FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM club_members cm 
      WHERE cm.club_id = club_achievements.club_id 
        AND cm.user_id = auth.uid() 
        AND cm.role IN ('owner', 'admin', 'president', 'vice_president')
    )
  );

CREATE INDEX IF NOT EXISTS idx_club_achievements_club ON club_achievements(club_id);

-- ── 14. Club Event Attendance (QR code verification) ─────────────────────────
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
CREATE POLICY "Attendees and admins can view attendance" ON club_event_attendance FOR SELECT
  USING (
    user_id = auth.uid() 
    OR EXISTS (
      SELECT 1 FROM events e 
      JOIN club_members cm ON cm.club_id = e.club_id 
      WHERE e.id = club_event_attendance.event_id 
        AND cm.user_id = auth.uid() 
        AND cm.role IN ('owner', 'admin', 'president', 'moderator')
    )
  );
CREATE POLICY "Users can check in to events" ON club_event_attendance FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_club_event_attendance ON club_event_attendance(event_id);

-- ── 15. Club Polls & Votes ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS club_polls (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id         uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  creator_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  question        text NOT NULL,
  options         jsonb NOT NULL DEFAULT '[]'::jsonb, -- array of strings
  is_anonymous    boolean NOT NULL DEFAULT false,
  expires_at      timestamptz,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE club_polls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Club members can view polls" ON club_polls FOR SELECT USING (true);
CREATE POLICY "Club leaders can create polls" ON club_polls FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM club_members cm WHERE cm.club_id = club_polls.club_id AND cm.user_id = auth.uid())
  );

CREATE TABLE IF NOT EXISTS club_poll_votes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id       uuid NOT NULL REFERENCES club_polls(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  option_index  integer NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (poll_id, user_id)
);

ALTER TABLE club_poll_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view poll votes counts" ON club_poll_votes FOR SELECT USING (true);
CREATE POLICY "Club members can vote once" ON club_poll_votes FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ── 16. Club Audit Logs ──────────────────────────────────────────────────────
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
CREATE POLICY "Club admins can view audit logs" ON club_audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM club_members cm 
      WHERE cm.club_id = club_audit_logs.club_id 
        AND cm.user_id = auth.uid() 
        AND cm.role IN ('owner', 'admin', 'president')
    )
  );

CREATE INDEX IF NOT EXISTS idx_club_audit_logs_club ON club_audit_logs(club_id, created_at DESC);
