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
