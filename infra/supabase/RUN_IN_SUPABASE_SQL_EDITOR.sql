-- =============================================================================
-- SkillBridge Production Supabase Schema Upgrade (All Missing Modules)
-- Safe to run on top of existing database: wyqsoxkwmulhpcoslnoj
-- =============================================================================


-- =============================================================================
-- MODULE: infra/supabase/migrations/030_nextgen_notifications_ops.sql
-- =============================================================================

-- =============================================================================
-- Migration 030: Next-Gen Notifications, Moderation Operations & Audit Logs
-- 1. Extend reports.target_type for Next-Gen content (posts, comments, Q&A)
-- 2. Enhance notifications table with operational metadata & priority
-- 3. Create moderation_audit_logs with strict RLS
-- 4. Add performance indexes for unread notifications and audit queries
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. EXTEND REPORTS TARGET TYPE CONSTRAINT
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.reports'::regclass
      AND conname = 'reports_target_type_check'
  ) THEN
    ALTER TABLE public.reports DROP CONSTRAINT reports_target_type_check;
  END IF;

  ALTER TABLE public.reports
    ADD CONSTRAINT reports_target_type_check
    CHECK (target_type IN (
      'user', 'message', 'room', 'event', 'resource',
      'post', 'comment', 'question', 'answer', 'club_announcement'
    ));
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipping reports_target_type_check update: %', SQLERRM;
END $$;

-- -----------------------------------------------------------------------------
-- 2. ENHANCE NOTIFICATIONS TABLE
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'priority'
  ) THEN
    ALTER TABLE public.notifications
      ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal'
      CHECK (priority IN ('low', 'normal', 'high', 'urgent'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'entity_type'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN entity_type TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'entity_id'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN entity_id UUID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN expires_at TIMESTAMPTZ;
  END IF;
END $$;

-- Composite index for fast unread notifications lookup
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, read_at, created_at DESC);

-- -----------------------------------------------------------------------------
-- 3. MODERATION AUDIT LOGS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.moderation_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  reason TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_moderation_audit_created
  ON public.moderation_audit_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_moderation_audit_entity
  ON public.moderation_audit_logs(entity_type, entity_id);

-- -----------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS)
-- -----------------------------------------------------------------------------
ALTER TABLE public.moderation_audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'moderation_audit_read' AND tablename = 'moderation_audit_logs'
  ) THEN
    CREATE POLICY moderation_audit_read ON public.moderation_audit_logs
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND (p.roles @> ARRAY['admin']::text[] OR p.roles @> ARRAY['moderator']::text[])
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'moderation_audit_insert' AND tablename = 'moderation_audit_logs'
  ) THEN
    CREATE POLICY moderation_audit_insert ON public.moderation_audit_logs
      FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND (p.roles @> ARRAY['admin']::text[] OR p.roles @> ARRAY['moderator']::text[])
        )
      );
  END IF;
END $$;


-- =============================================================================
-- MODULE: infra/supabase/migrations/031_nextgen_media_automation.sql
-- =============================================================================

-- =============================================================================
-- Migration 031: SkillBridge Next-Gen Media Automation & YouTube Integration
-- =============================================================================
-- 1. YouTube OAuth Connections Table (Encrypted Tokens, Channel Metadata)
-- 2. Room Recordings Table Hardening (Status, Source, Session Link, Metadata)
-- 3. Campus Feed Media Attachments Table (Rich Multi-Media Pipeline)
-- 4. Background Job Queue Table (Idempotent, Retryable, Free-Tier Safe)
-- 5. Row Level Security (RLS) & Performance Indexes
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. YOUTUBE OAUTH CONNECTIONS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.youtube_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  google_account_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  channel_title TEXT NOT NULL,
  channel_thumbnail_url TEXT,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'expired', 'revoked', 'error')),
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sync_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_youtube_user_channel UNIQUE (user_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_youtube_connections_user ON public.youtube_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_youtube_connections_channel ON public.youtube_connections(channel_id);

-- -----------------------------------------------------------------------------
-- 2. HARDEN ROOM RECORDINGS TABLE
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'room_recordings' AND column_name = 'source_type'
  ) THEN
    ALTER TABLE public.room_recordings
      ADD COLUMN source_type TEXT NOT NULL DEFAULT 'manual_youtube'
      CHECK (source_type IN ('manual_youtube', 'youtube_oauth', 'livekit_egress', 'external'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'room_recordings' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.room_recordings
      ADD COLUMN status TEXT NOT NULL DEFAULT 'ready'
      CHECK (status IN ('pending', 'processing', 'ready', 'failed', 'deleted'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'room_recordings' AND column_name = 'youtube_channel_id'
  ) THEN
    ALTER TABLE public.room_recordings ADD COLUMN youtube_channel_id TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'room_recordings' AND column_name = 'youtube_connection_id'
  ) THEN
    ALTER TABLE public.room_recordings
      ADD COLUMN youtube_connection_id UUID REFERENCES public.youtube_connections(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'room_recordings' AND column_name = 'published_at'
  ) THEN
    ALTER TABLE public.room_recordings ADD COLUMN published_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'room_recordings' AND column_name = 'privacy_status'
  ) THEN
    ALTER TABLE public.room_recordings ADD COLUMN privacy_status TEXT DEFAULT 'public';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'room_recordings' AND column_name = 'provider_metadata'
  ) THEN
    ALTER TABLE public.room_recordings ADD COLUMN provider_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'room_recordings' AND column_name = 'sync_error'
  ) THEN
    ALTER TABLE public.room_recordings ADD COLUMN sync_error TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'room_recordings' AND column_name = 'last_synced_at'
  ) THEN
    ALTER TABLE public.room_recordings ADD COLUMN last_synced_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'room_recordings' AND column_name = 'room_session_id'
  ) THEN
    ALTER TABLE public.room_recordings
      ADD COLUMN room_session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_room_recordings_status ON public.room_recordings(room_id, status);
CREATE INDEX IF NOT EXISTS idx_room_recordings_session ON public.room_recordings(room_session_id);

-- -----------------------------------------------------------------------------
-- 3. CAMPUS POST MEDIA ATTACHMENTS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campus_post_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.campus_posts(id) ON DELETE CASCADE,
  media_object_id UUID REFERENCES public.media_objects(id) ON DELETE SET NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'document', 'youtube', 'resource_link')),
  media_url TEXT NOT NULL,
  thumbnail_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  alt_text TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campus_post_media_post ON public.campus_post_media(post_id, sort_order ASC);
CREATE INDEX IF NOT EXISTS idx_campus_post_media_object ON public.campus_post_media(media_object_id);

-- -----------------------------------------------------------------------------
-- 4. BACKGROUND JOBS QUEUE TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.background_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL CHECK (job_type IN ('YOUTUBE_METADATA_SYNC', 'YOUTUBE_CHANNEL_SYNC', 'RECORDING_RECONCILE', 'MEDIA_CLEANUP', 'THUMBNAIL_REFRESH')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'dead')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  run_after TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_background_jobs_queue ON public.background_jobs(status, run_after) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_background_jobs_type ON public.background_jobs(job_type, created_at DESC);

-- -----------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- -----------------------------------------------------------------------------
ALTER TABLE public.youtube_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.background_jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- YouTube Connections: Users can view and manage their own connection
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'youtube_conn_owner_select' AND tablename = 'youtube_connections'
  ) THEN
    CREATE POLICY youtube_conn_owner_select ON public.youtube_connections
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'youtube_conn_owner_all' AND tablename = 'youtube_connections'
  ) THEN
    CREATE POLICY youtube_conn_owner_all ON public.youtube_connections
      FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  -- Campus Post Media: Anyone who can see posts can see their media attachments
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'campus_post_media_read' AND tablename = 'campus_post_media'
  ) THEN
    CREATE POLICY campus_post_media_read ON public.campus_post_media
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.campus_posts p
          WHERE p.id = campus_post_media.post_id AND p.status = 'active'
        )
      );
  END IF;

  -- Background Jobs: Restricted to Admins / Operators
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'background_jobs_admin' AND tablename = 'background_jobs'
  ) THEN
    CREATE POLICY background_jobs_admin ON public.background_jobs
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.roles @> ARRAY['admin']::text[]
        )
      );
  END IF;
END $$;


-- =============================================================================
-- MODULE: infra/supabase/migrations/032_room_posts_os.sql
-- =============================================================================

-- =============================================================================
-- Migration 032: Room OS Core Content Engine
-- 1. Room Posts (Discussions, Announcements, Questions, Resources, Polls)
-- 2. Room Post Threaded Comments
-- 3. Room Post Reactions (Helpful, Insightful, etc.)
-- 4. Automatic Denormalized Count Triggers & Realtime Replication
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ROOM POSTS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.room_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('discussion', 'question', 'announcement', 'poll', 'resource', 'event', 'help', 'achievement')),
  title TEXT,
  body TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  comments_enabled BOOLEAN NOT NULL DEFAULT true,
  likes_count INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_room_posts_room_pinned ON public.room_posts(room_id, is_pinned DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_room_posts_author ON public.room_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_room_posts_status ON public.room_posts(status);

-- -----------------------------------------------------------------------------
-- 2. ROOM POST COMMENTS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.room_post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.room_posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES public.room_post_comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_room_post_comments_post ON public.room_post_comments(post_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_room_post_comments_parent ON public.room_post_comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_room_post_comments_author ON public.room_post_comments(author_id);

-- -----------------------------------------------------------------------------
-- 3. ROOM POST REACTIONS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.room_post_reactions (
  post_id UUID NOT NULL REFERENCES public.room_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL DEFAULT 'helpful',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_room_post_reactions_user ON public.room_post_reactions(user_id);

-- -----------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- -----------------------------------------------------------------------------
ALTER TABLE public.room_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_post_reactions ENABLE ROW LEVEL SECURITY;

-- Room Posts Read Policy:
-- Allowed if room is public or user is an active member
DO $$ BEGIN
  DROP POLICY IF EXISTS room_posts_select_policy ON public.room_posts;
  CREATE POLICY room_posts_select_policy ON public.room_posts
    FOR SELECT
    USING (
      status != 'deleted' AND (
        EXISTS (SELECT 1 FROM public.rooms r WHERE r.id = room_id AND r.visibility = 'public')
        OR
        EXISTS (SELECT 1 FROM public.room_members m WHERE m.room_id = room_id AND m.user_id = auth.uid())
      )
    );
END $$;

-- Room Posts Insert Policy:
-- User must be a member of the room; announcements restricted to owner/teacher/moderator
DO $$ BEGIN
  DROP POLICY IF EXISTS room_posts_insert_policy ON public.room_posts;
  CREATE POLICY room_posts_insert_policy ON public.room_posts
    FOR INSERT
    WITH CHECK (
      auth.uid() = author_id AND
      EXISTS (
        SELECT 1 FROM public.room_members m 
        WHERE m.room_id = room_id AND m.user_id = auth.uid()
        AND (
          type != 'announcement'
          OR m.role IN ('owner', 'teacher', 'moderator')
        )
      )
    );
END $$;

-- Room Comments Read & Write
DO $$ BEGIN
  DROP POLICY IF EXISTS room_post_comments_select_policy ON public.room_post_comments;
  CREATE POLICY room_post_comments_select_policy ON public.room_post_comments
    FOR SELECT
    USING (
      status != 'deleted' AND
      EXISTS (
        SELECT 1 FROM public.room_posts p
        JOIN public.rooms r ON r.id = p.room_id
        WHERE p.id = post_id AND (
          r.visibility = 'public' OR
          EXISTS (SELECT 1 FROM public.room_members m WHERE m.room_id = r.id AND m.user_id = auth.uid())
        )
      )
    );

  DROP POLICY IF EXISTS room_post_comments_insert_policy ON public.room_post_comments;
  CREATE POLICY room_post_comments_insert_policy ON public.room_post_comments
    FOR INSERT
    WITH CHECK (
      auth.uid() = author_id AND
      EXISTS (
        SELECT 1 FROM public.room_posts p
        JOIN public.room_members m ON m.room_id = p.room_id
        WHERE p.id = post_id AND m.user_id = auth.uid() AND p.comments_enabled = true
      )
    );
END $$;

-- Room Reactions Read & Write
DO $$ BEGIN
  DROP POLICY IF EXISTS room_post_reactions_select_policy ON public.room_post_reactions;
  CREATE POLICY room_post_reactions_select_policy ON public.room_post_reactions
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.room_posts p
        JOIN public.rooms r ON r.id = p.room_id
        WHERE p.id = post_id AND (
          r.visibility = 'public' OR
          EXISTS (SELECT 1 FROM public.room_members m WHERE m.room_id = r.id AND m.user_id = auth.uid())
        )
      )
    );

  DROP POLICY IF EXISTS room_post_reactions_write_policy ON public.room_post_reactions;
  CREATE POLICY room_post_reactions_write_policy ON public.room_post_reactions
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
END $$;


-- =============================================================================
-- MODULE: infra/supabase/migrations/033_room_advanced_collaboration.sql
-- =============================================================================

-- =============================================================================
-- Migration 033: SkillBridge Advanced Room Collaboration Architecture (Prompt 5)
-- Channels, Pinned Hub, Video Playlists, Watch Progress, Moderation & Invites
-- =============================================================================

-- 1. Extend Rooms & Room Posts
ALTER TABLE rooms 
  ADD COLUMN IF NOT EXISTS enabled_modules TEXT[] DEFAULT ARRAY['posts', 'chat', 'learn', 'media']::text[],
  ADD COLUMN IF NOT EXISTS default_landing_tab TEXT DEFAULT 'posts',
  ADD COLUMN IF NOT EXISTS appearance JSONB DEFAULT '{"accent_color": null, "theme": "auto"}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;

ALTER TABLE room_posts 
  ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal' CHECK (priority IN ('normal', 'important', 'urgent')),
  ADD COLUMN IF NOT EXISTS comments_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS views_count INT DEFAULT 0;

-- 2. Room Channels
CREATE TABLE IF NOT EXISTS room_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('text', 'announcement', 'question', 'resource', 'media', 'voice')),
  description TEXT DEFAULT '',
  position INT DEFAULT 0,
  is_default BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  permissions_override JSONB DEFAULT '{}'::jsonb,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_room_channels_slug UNIQUE (room_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_room_channels_room ON room_channels(room_id, position ASC, created_at ASC);

-- 3. Room Pinned Content Hub
CREATE TABLE IF NOT EXISTS room_pinned_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('post', 'announcement', 'question', 'resource', 'event', 'message', 'video')),
  item_id UUID NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT DEFAULT '',
  pinned_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  position INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_room_pinned_items_room ON room_pinned_items(room_id, position ASC, created_at DESC);

-- 4. User Video Watch Progress
CREATE TABLE IF NOT EXISTS user_video_progress (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recording_id UUID NOT NULL REFERENCES room_recordings(id) ON DELETE CASCADE,
  last_position_seconds INT NOT NULL DEFAULT 0,
  duration_seconds INT NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, recording_id)
);

CREATE INDEX IF NOT EXISTS idx_user_video_progress_user ON user_video_progress(user_id, updated_at DESC);

-- 5. Video Playlists
CREATE TABLE IF NOT EXISTS room_video_playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  position INT DEFAULT 0,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_room_video_playlists_room ON room_video_playlists(room_id, position ASC);

CREATE TABLE IF NOT EXISTS room_video_playlist_items (
  playlist_id UUID NOT NULL REFERENCES room_video_playlists(id) ON DELETE CASCADE,
  recording_id UUID NOT NULL REFERENCES room_recordings(id) ON DELETE CASCADE,
  position INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (playlist_id, recording_id)
);

CREATE INDEX IF NOT EXISTS idx_room_playlist_items_order ON room_video_playlist_items(playlist_id, position ASC);

-- 6. Room Moderation Audit Logs
CREATE TABLE IF NOT EXISTS room_moderation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('dismiss_report', 'remove_content', 'warn_user', 'mute_user', 'remove_user', 'ban_user')),
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  reason TEXT DEFAULT '',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_room_mod_logs_room ON room_moderation_logs(room_id, created_at DESC);

-- 7. Room Invites
CREATE TABLE IF NOT EXISTS room_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  max_uses INT DEFAULT NULL,
  uses_count INT DEFAULT 0,
  expires_at TIMESTAMPTZ DEFAULT NULL,
  is_revoked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_room_invites_code ON room_invites(code) WHERE NOT is_revoked;
CREATE INDEX IF NOT EXISTS idx_room_invites_room ON room_invites(room_id, created_at DESC);

-- 8. Row Level Security Policies
ALTER TABLE room_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_pinned_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_video_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_video_playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_video_playlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_moderation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_invites ENABLE ROW LEVEL SECURITY;

-- Channels RLS
DROP POLICY IF EXISTS "Members can view room channels" ON room_channels;
CREATE POLICY "Members can view room channels" ON room_channels
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM room_members WHERE room_id = room_channels.room_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM rooms WHERE id = room_channels.room_id AND visibility = 'public')
  );

DROP POLICY IF EXISTS "Owners and moderators can manage channels" ON room_channels;
CREATE POLICY "Owners and moderators can manage channels" ON room_channels
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM room_members 
      WHERE room_id = room_channels.room_id 
        AND user_id = auth.uid() 
        AND role IN ('owner', 'moderator', 'teacher')
    )
  );

-- Pinned Items RLS
DROP POLICY IF EXISTS "Members can view pinned items" ON room_pinned_items;
CREATE POLICY "Members can view pinned items" ON room_pinned_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM room_members WHERE room_id = room_pinned_items.room_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM rooms WHERE id = room_pinned_items.room_id AND visibility = 'public')
  );

-- Video Progress RLS
DROP POLICY IF EXISTS "Users can manage their own video progress" ON user_video_progress;
CREATE POLICY "Users can manage their own video progress" ON user_video_progress
  FOR ALL USING (user_id = auth.uid());

-- Playlists RLS
DROP POLICY IF EXISTS "Members can view room playlists" ON room_video_playlists;
CREATE POLICY "Members can view room playlists" ON room_video_playlists
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM room_members WHERE room_id = room_video_playlists.room_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM rooms WHERE id = room_video_playlists.room_id AND visibility = 'public')
  );

DROP POLICY IF EXISTS "Members can view playlist items" ON room_video_playlist_items;
CREATE POLICY "Members can view playlist items" ON room_video_playlist_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM room_video_playlists p
      JOIN rooms r ON r.id = p.room_id
      WHERE p.id = room_video_playlist_items.playlist_id
        AND (r.visibility = 'public' OR EXISTS (SELECT 1 FROM room_members m WHERE m.room_id = r.id AND m.user_id = auth.uid()))
    )
  );

-- Moderation Logs RLS
DROP POLICY IF EXISTS "Owners and mods can view moderation logs" ON room_moderation_logs;
CREATE POLICY "Owners and mods can view moderation logs" ON room_moderation_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM room_members 
      WHERE room_id = room_moderation_logs.room_id 
        AND user_id = auth.uid() 
        AND role IN ('owner', 'moderator')
    )
  );


-- =============================================================================
-- MODULE: infra/supabase/migrations/034_cross_space_integration.sql
-- =============================================================================

-- =============================================================================
-- Migration 034: SkillBridge Cross-Space Integration Architecture (Prompt 6)
-- Clubs + Ask Help + Research + Canonical Content Routing + Space Links
-- =============================================================================

-- 1. Space Linkage to Room OS
-- Clubs link to Room OS collaboration workspace
ALTER TABLE clubs 
  ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recruitment_status TEXT DEFAULT 'open' CHECK (recruitment_status IN ('open', 'closed', 'invite_only'));

-- Research projects link to private Room OS research workspace
ALTER TABLE research_projects 
  ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES rooms(id) ON DELETE SET NULL;

-- Events provenance (source space / creator entity)
ALTER TABLE events 
  ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'campus' CHECK (source_type IN ('campus', 'club', 'room', 'research')),
  ADD COLUMN IF NOT EXISTS source_id UUID;

-- 2. Ask Help Canonical Academic Metadata on room_questions
ALTER TABLE room_questions 
  ADD COLUMN IF NOT EXISTS subject TEXT,
  ADD COLUMN IF NOT EXISTS topic TEXT,
  ADD COLUMN IF NOT EXISTS urgency TEXT DEFAULT 'normal' CHECK (urgency IN ('normal', 'today', 'exam_soon')),
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS is_campus_wide BOOLEAN DEFAULT false;

-- 3. Cross-Space Content Shares Reference Model
CREATE TABLE IF NOT EXISTS space_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_entity_type TEXT NOT NULL CHECK (source_entity_type IN ('post', 'announcement', 'question', 'event', 'resource', 'research')),
  source_entity_id UUID NOT NULL,
  destination_type TEXT NOT NULL CHECK (destination_type IN ('campus_feed', 'room', 'chat')),
  destination_id UUID,
  shared_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Safe Indexes for Cross-Space Queries
CREATE INDEX IF NOT EXISTS idx_clubs_room_id ON clubs(room_id);
CREATE INDEX IF NOT EXISTS idx_research_projects_room_id ON research_projects(room_id);
CREATE INDEX IF NOT EXISTS idx_events_source ON events(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_room_questions_urgency ON room_questions(urgency, is_resolved, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_room_questions_subject ON room_questions(subject, is_resolved);
CREATE INDEX IF NOT EXISTS idx_space_shares_source ON space_shares(source_entity_type, source_entity_id);
CREATE INDEX IF NOT EXISTS idx_space_shares_dest ON space_shares(destination_type, destination_id);
CREATE INDEX IF NOT EXISTS idx_space_shares_user ON space_shares(shared_by, created_at DESC);

-- 5. Row-Level Security on space_shares
ALTER TABLE space_shares ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'space_shares' AND policyname = 'space_shares_read_all') THEN
    CREATE POLICY space_shares_read_all ON space_shares FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'space_shares' AND policyname = 'space_shares_insert_auth') THEN
    CREATE POLICY space_shares_insert_auth ON space_shares FOR INSERT WITH CHECK (auth.uid() = shared_by);
  END IF;
END $$;


-- =============================================================================
-- MODULE: infra/supabase/migrations/035_communication_os.sql
-- =============================================================================

-- =============================================================================
-- Migration 035: SkillBridge Communication OS Architecture (Prompt 7)
-- Telegram/Messenger-grade Inbox + Pinned/Archived/Mute + DM Uniqueness + Search
-- =============================================================================

-- 1. Conversation Member User States (Pin, Archive, Mute)
ALTER TABLE public.conversation_members
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS muted_until TIMESTAMPTZ DEFAULT NULL;

-- 2. Performance Indexes for Telegram-Density Ordering & Filtering
CREATE INDEX IF NOT EXISTS idx_conversation_members_user_pinned
  ON public.conversation_members(user_id, is_pinned DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_members_archived
  ON public.conversation_members(user_id, is_archived);

-- 3. Atomic DM Conversation Resolver with Symmetric Advisory Locking
CREATE OR REPLACE FUNCTION public.get_or_create_dm_conversation(p_user_a UUID, p_user_b UUID)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_conv RECORD;
  v_conv_id UUID;
  v_lock_key BIGINT;
BEGIN
  IF p_user_a = p_user_b THEN
    RAISE EXCEPTION 'Cannot create direct message conversation with oneself';
  END IF;

  -- Derive 64-bit symmetric lock key from sorted UUID pair to serialize concurrent requests between these 2 users
  v_lock_key := ('x' || substr(md5(least(p_user_a::text, p_user_b::text) || ':' || greatest(p_user_a::text, p_user_b::text)), 1, 16))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Check existing DM between the two users
  SELECT c.id, c.title, c.kind, c.updated_at INTO v_conv
  FROM public.conversations c
  WHERE c.kind = 'dm'
    AND EXISTS (SELECT 1 FROM public.conversation_members m WHERE m.conversation_id = c.id AND m.user_id = p_user_a)
    AND EXISTS (SELECT 1 FROM public.conversation_members m WHERE m.conversation_id = c.id AND m.user_id = p_user_b)
    AND (SELECT count(*) FROM public.conversation_members m WHERE m.conversation_id = c.id) = 2
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'id', v_conv.id,
      'title', v_conv.title,
      'kind', v_conv.kind,
      'updated_at', v_conv.updated_at,
      'is_new', false
    );
  END IF;

  -- Create new DM conversation
  INSERT INTO public.conversations(kind, created_by)
  VALUES ('dm', p_user_a)
  RETURNING id INTO v_conv_id;

  INSERT INTO public.conversation_members(conversation_id, user_id, role)
  VALUES
    (v_conv_id, p_user_a, 'member'),
    (v_conv_id, p_user_b, 'member');

  SELECT c.id, c.title, c.kind, c.updated_at INTO v_conv
  FROM public.conversations c WHERE c.id = v_conv_id;

  RETURN jsonb_build_object(
    'id', v_conv.id,
    'title', v_conv.title,
    'kind', v_conv.kind,
    'updated_at', v_conv.updated_at,
    'is_new', true
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_or_create_dm_conversation(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_dm_conversation(UUID, UUID) TO service_role, authenticated;


-- =============================================================================
-- MODULE: infra/supabase/migrations/036_privacy_and_surface_completion.sql
-- =============================================================================

-- Migration 036: Privacy and Surface Completion
-- Adds fine-grained privacy controls for messaging, calls, and presence visibility.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS who_can_message text NOT NULL DEFAULT 'everyone'
    CHECK (who_can_message IN ('everyone', 'connections', 'nobody')),
  ADD COLUMN IF NOT EXISTS who_can_call text NOT NULL DEFAULT 'everyone'
    CHECK (who_can_call IN ('everyone', 'connections', 'nobody')),
  ADD COLUMN IF NOT EXISTS presence_visibility text NOT NULL DEFAULT 'everyone'
    CHECK (presence_visibility IN ('everyone', 'connections', 'nobody'));

COMMENT ON COLUMN public.profiles.who_can_message IS 'Controls who can initiate direct messages: everyone, connections, or nobody';
COMMENT ON COLUMN public.profiles.who_can_call IS 'Controls who can initiate 1:1 audio/video calls: everyone, connections, or nobody';
COMMENT ON COLUMN public.profiles.presence_visibility IS 'Controls who can see online presence / last seen: everyone, connections, or nobody';


-- =============================================================================
-- MODULE: infra/supabase/migrations/037_social_post_system.sql
-- =============================================================================

-- =============================================================================
-- Migration 037: Complete Campus Social Post & Rich Publishing Ecosystem
-- =============================================================================

-- 1. Extend campus_posts with rich post fields
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'campus_posts' AND column_name = 'post_type') THEN
    ALTER TABLE public.campus_posts ADD COLUMN post_type TEXT NOT NULL DEFAULT 'standard';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'campus_posts' AND column_name = 'appearance') THEN
    ALTER TABLE public.campus_posts ADD COLUMN appearance JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'campus_posts' AND column_name = 'structured_content') THEN
    ALTER TABLE public.campus_posts ADD COLUMN structured_content JSONB NOT NULL DEFAULT '{"blocks":[]}'::jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'campus_posts' AND column_name = 'visibility') THEN
    ALTER TABLE public.campus_posts ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'campus_posts' AND column_name = 'club_id') THEN
    ALTER TABLE public.campus_posts ADD COLUMN club_id UUID REFERENCES public.clubs(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'campus_posts' AND column_name = 'department') THEN
    ALTER TABLE public.campus_posts ADD COLUMN department TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'campus_posts' AND column_name = 'section') THEN
    ALTER TABLE public.campus_posts ADD COLUMN section TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'campus_posts' AND column_name = 'mentions') THEN
    ALTER TABLE public.campus_posts ADD COLUMN mentions JSONB NOT NULL DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'campus_posts' AND column_name = 'hashtags') THEN
    ALTER TABLE public.campus_posts ADD COLUMN hashtags TEXT[] NOT NULL DEFAULT '{}';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'campus_posts' AND column_name = 'type_metadata') THEN
    ALTER TABLE public.campus_posts ADD COLUMN type_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'campus_posts' AND column_name = 'is_edited') THEN
    ALTER TABLE public.campus_posts ADD COLUMN is_edited BOOLEAN NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'campus_posts' AND column_name = 'edited_at') THEN
    ALTER TABLE public.campus_posts ADD COLUMN edited_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'campus_posts' AND column_name = 'shares_count') THEN
    ALTER TABLE public.campus_posts ADD COLUMN shares_count INTEGER NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'campus_posts' AND column_name = 'saves_count') THEN
    ALTER TABLE public.campus_posts ADD COLUMN saves_count INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

-- 2. Extend campus_post_comments for nested replies & attachments
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'campus_post_comments' AND column_name = 'parent_id') THEN
    ALTER TABLE public.campus_post_comments ADD COLUMN parent_id UUID REFERENCES public.campus_post_comments(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'campus_post_comments' AND column_name = 'likes_count') THEN
    ALTER TABLE public.campus_post_comments ADD COLUMN likes_count INTEGER NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'campus_post_comments' AND column_name = 'media_url') THEN
    ALTER TABLE public.campus_post_comments ADD COLUMN media_url TEXT;
  END IF;
END $$;

-- 3. Expand reaction_type check constraint if present
DO $$
BEGIN
  ALTER TABLE public.campus_post_reactions DROP CONSTRAINT IF EXISTS campus_post_reactions_reaction_type_check;
  ALTER TABLE public.campus_post_reactions ADD CONSTRAINT campus_post_reactions_reaction_type_check
    CHECK (reaction_type IN ('like', 'love', 'insightful', 'celebrate', 'curious', 'sad'));
EXCEPTION
  WHEN others THEN NULL;
END $$;

-- 4. Campus Post Comment Reactions
CREATE TABLE IF NOT EXISTS public.campus_post_comment_reactions (
  comment_id UUID NOT NULL REFERENCES public.campus_post_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL DEFAULT 'like',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

-- 5. Campus Post Polls
CREATE TABLE IF NOT EXISTS public.campus_post_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.campus_posts(id) ON DELETE CASCADE UNIQUE,
  question TEXT NOT NULL,
  is_multiple BOOLEAN NOT NULL DEFAULT false,
  is_anonymous BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ,
  total_votes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Campus Post Poll Options
CREATE TABLE IF NOT EXISTS public.campus_post_poll_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES public.campus_post_polls(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  image_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  votes_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Campus Post Poll Votes
CREATE TABLE IF NOT EXISTS public.campus_post_poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES public.campus_post_polls(id) ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES public.campus_post_poll_options(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (poll_id, option_id, user_id)
);

-- 8. Campus Post Drafts (for cross-device draft recovery & sync)
CREATE TABLE IF NOT EXISTS public.campus_post_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_type TEXT NOT NULL DEFAULT 'standard',
  title TEXT,
  body TEXT NOT NULL DEFAULT '',
  appearance JSONB NOT NULL DEFAULT '{}'::jsonb,
  structured_content JSONB NOT NULL DEFAULT '{"blocks":[]}'::jsonb,
  type_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  visibility TEXT NOT NULL DEFAULT 'public',
  is_anonymous BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Indexes for performant feed queries
CREATE INDEX IF NOT EXISTS idx_campus_posts_author_created ON public.campus_posts(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campus_posts_type ON public.campus_posts(post_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campus_posts_visibility ON public.campus_posts(visibility, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campus_posts_club ON public.campus_posts(club_id) WHERE club_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_campus_comments_parent ON public.campus_post_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_campus_poll_votes_user ON public.campus_post_poll_votes(poll_id, user_id);
CREATE INDEX IF NOT EXISTS idx_campus_drafts_user ON public.campus_post_drafts(user_id, updated_at DESC);

-- 10. Enable RLS
ALTER TABLE public.campus_post_comment_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_post_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_post_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_post_poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_post_drafts ENABLE ROW LEVEL SECURITY;

-- 11. Policies
DO $$
BEGIN
  -- Polls
  DROP POLICY IF EXISTS campus_post_polls_read ON public.campus_post_polls;
  CREATE POLICY campus_post_polls_read ON public.campus_post_polls FOR SELECT USING (true);

  -- Poll options
  DROP POLICY IF EXISTS campus_post_poll_options_read ON public.campus_post_poll_options;
  CREATE POLICY campus_post_poll_options_read ON public.campus_post_poll_options FOR SELECT USING (true);

  -- Poll votes
  DROP POLICY IF EXISTS campus_post_poll_votes_read ON public.campus_post_poll_votes;
  CREATE POLICY campus_post_poll_votes_read ON public.campus_post_poll_votes FOR SELECT USING (true);

  DROP POLICY IF EXISTS campus_post_poll_votes_insert ON public.campus_post_poll_votes;
  CREATE POLICY campus_post_poll_votes_insert ON public.campus_post_poll_votes FOR INSERT WITH CHECK (auth.uid() = user_id);

  -- Drafts (Private to author)
  DROP POLICY IF EXISTS campus_post_drafts_all ON public.campus_post_drafts;
  CREATE POLICY campus_post_drafts_all ON public.campus_post_drafts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

  -- Comment reactions
  DROP POLICY IF EXISTS campus_post_comment_reactions_read ON public.campus_post_comment_reactions;
  CREATE POLICY campus_post_comment_reactions_read ON public.campus_post_comment_reactions FOR SELECT USING (true);

  DROP POLICY IF EXISTS campus_post_comment_reactions_write ON public.campus_post_comment_reactions;
  CREATE POLICY campus_post_comment_reactions_write ON public.campus_post_comment_reactions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION
  WHEN others THEN NULL;
END $$;


-- =============================================================================
-- MODULE: infra/supabase/migrations/038_group_chat_admin_system.sql
-- =============================================================================

-- Migration 038: Group Chat Admin and Member Management System
-- Provides support for Messenger-style group conversations, admin privileges, role transitions, and member controls.

-- 1. Extend conversations table with optional avatar_url and description
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS description text;

COMMENT ON COLUMN public.conversations.avatar_url IS 'Custom group chat avatar URL';
COMMENT ON COLUMN public.conversations.description IS 'Optional group chat description or guidelines';

-- 2. Ensure indexes on conversation_members for high-throughput queries
CREATE INDEX IF NOT EXISTS idx_conversation_members_lookup
  ON public.conversation_members(conversation_id, user_id, role);

CREATE INDEX IF NOT EXISTS idx_conversation_members_role
  ON public.conversation_members(conversation_id, role);

-- 3. RLS Policies for conversations and conversation_members
-- Allow conversation members to view conversations they belong to
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'conversations' AND policyname = 'conversation_members_can_read'
  ) THEN
    CREATE POLICY conversation_members_can_read ON public.conversations
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.conversation_members cm
          WHERE cm.conversation_id = conversations.id
            AND cm.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Allow conversation admins to update group conversations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'conversations' AND policyname = 'conversation_admins_can_update'
  ) THEN
    CREATE POLICY conversation_admins_can_update ON public.conversations
      FOR UPDATE
      TO authenticated
      USING (
        created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.conversation_members cm
          WHERE cm.conversation_id = conversations.id
            AND cm.user_id = auth.uid()
            AND cm.role = 'admin'
        )
      );
  END IF;
END $$;

-- Allow conversation admins to manage members
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'conversation_members' AND policyname = 'conversation_admins_can_modify_members'
  ) THEN
    CREATE POLICY conversation_admins_can_modify_members ON public.conversation_members
      FOR ALL
      TO authenticated
      USING (
        user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.conversation_members cm
          WHERE cm.conversation_id = conversation_members.conversation_id
            AND cm.user_id = auth.uid()
            AND cm.role = 'admin'
        )
      );
  END IF;
END $$;


-- =============================================================================
-- MODULE: infra/supabase/migrations/040_room_polls_certificates.sql
-- =============================================================================

-- 040: Room polls votes + certificates (A/B/C pack)
CREATE TABLE IF NOT EXISTS public.room_poll_votes (
  poll_id UUID NOT NULL REFERENCES public.room_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  option_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (poll_id, user_id)
);
CREATE TABLE IF NOT EXISTS public.room_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  percent INT NOT NULL DEFAULT 0,
  code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id)
);
ALTER TABLE public.room_poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_certificates ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- MODULE: backend/supabase/migrations/academic_calendar_routine.sql
-- =============================================================================

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


-- =============================================================================
-- MODULE: backend/supabase/migrations/research_library.sql
-- =============================================================================

-- Research Hub Library Tables
-- Run this in your Supabase SQL editor

-- ─── Saved Papers ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_papers (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  paper_id    text NOT NULL,
  paper_data  jsonb NOT NULL DEFAULT '{}',
  saved_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, paper_id)
);
ALTER TABLE saved_papers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own saved papers"
  ON saved_papers FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS saved_papers_user_idx ON saved_papers(user_id, saved_at DESC);

-- ─── Research Collections ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS research_collections (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  description text CHECK (length(description) <= 300),
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE research_collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own collections"
  ON research_collections FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS collections_user_idx ON research_collections(user_id, created_at DESC);

-- ─── Collection Papers ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS collection_papers (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  collection_id uuid NOT NULL REFERENCES research_collections(id) ON DELETE CASCADE,
  paper_id      text NOT NULL,
  paper_data    jsonb NOT NULL DEFAULT '{}',
  added_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (collection_id, paper_id)
);
ALTER TABLE collection_papers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Collection papers visible to collection owner"
  ON collection_papers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM research_collections c
      WHERE c.id = collection_papers.collection_id AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM research_collections c
      WHERE c.id = collection_papers.collection_id AND c.user_id = auth.uid()
    )
  );
CREATE INDEX IF NOT EXISTS collection_papers_col_idx ON collection_papers(collection_id, added_at DESC);

-- ─── Research Notes ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS research_notes (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL DEFAULT '' CHECK (length(title) <= 200),
  body        text NOT NULL DEFAULT '' CHECK (length(body) <= 50000),
  paper_id    text,
  paper_title text CHECK (length(paper_title) <= 300),
  tags        text[] NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE research_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own notes"
  ON research_notes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS notes_user_idx ON research_notes(user_id, updated_at DESC);

-- ─── Paper Reading History ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS paper_reading_history (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  paper_id      text NOT NULL,
  paper_title   text NOT NULL DEFAULT '',
  paper_year    integer,
  paper_authors text[] NOT NULL DEFAULT '{}',
  read_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, paper_id)
);
ALTER TABLE paper_reading_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own reading history"
  ON paper_reading_history FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS reading_history_user_idx ON paper_reading_history(user_id, read_at DESC);


-- =============================================================================
-- MODULE: backend/supabase/migrations/club_platform_suite.sql
-- =============================================================================

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

