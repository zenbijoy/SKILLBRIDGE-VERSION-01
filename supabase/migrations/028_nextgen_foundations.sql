-- =============================================================================
-- Migration 028: Next-Gen Foundations
-- 1. Modular Study Room Q&A (Questions, Answers, Votes)
-- 2. Room Recordings Archive (YouTube Zero-Cost Integration)
-- 3. StorageProvider Media Objects Registry (Lifecycle & Provider Tracking)
-- 4. University Campus Social Feed (Posts, Reactions, Comments, Anonymous Audit Map)
-- 5. Inter-Club Clash Negotiations State Machine
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ROOM Q&A BOARD
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.room_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  accepted_answer_id UUID,
  upvotes_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.room_question_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.room_questions(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  is_accepted BOOLEAN NOT NULL DEFAULT false,
  upvotes_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.room_question_votes (
  question_id UUID NOT NULL REFERENCES public.room_questions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (question_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_room_questions_room ON public.room_questions(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_room_answers_question ON public.room_question_answers(question_id, created_at ASC);

-- -----------------------------------------------------------------------------
-- 2. ROOM RECORDINGS (YOUTUBE EMBED ARCHIVE)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.room_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  uploader_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  youtube_video_id TEXT NOT NULL,
  youtube_url TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_room_recordings_room ON public.room_recordings(room_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 3. MEDIA OBJECTS REGISTRY (StorageProvider Lifecycle)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.media_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('supabase', 'r2', 's3')),
  bucket TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  checksum_sha256 TEXT,
  uploader_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('avatar', 'resource', 'post_attachment', 'chat_attachment', 'recording')),
  entity_id UUID,
  status TEXT NOT NULL DEFAULT 'pending_upload' CHECK (status IN ('pending_upload', 'uploaded', 'ready', 'quarantined', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_objects_uploader ON public.media_objects(uploader_id);
CREATE INDEX IF NOT EXISTS idx_media_objects_entity ON public.media_objects(entity_type, entity_id);

-- -----------------------------------------------------------------------------
-- 4. UNIVERSITY CAMPUS SOCIAL FEED
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campus_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  is_anonymous BOOLEAN NOT NULL DEFAULT false,
  anonymous_handle TEXT,
  media_urls TEXT[] NOT NULL DEFAULT '{}',
  likes_count INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  pinned BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden', 'reported', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.campus_post_reactions (
  post_id UUID NOT NULL REFERENCES public.campus_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('like', 'insightful', 'celebrate', 'curious')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.campus_post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.campus_posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  is_anonymous BOOLEAN NOT NULL DEFAULT false,
  anonymous_handle TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.anonymous_author_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('post', 'comment')),
  entity_id UUID NOT NULL,
  real_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  scoped_handle TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_campus_posts_created ON public.campus_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campus_comments_post ON public.campus_post_comments(post_id, created_at ASC);

-- -----------------------------------------------------------------------------
-- 5. CROSS-CLUB CLASH NEGOTIATION STATE MACHINE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.club_clash_negotiations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  initiator_club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  initiator_event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  target_club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  target_event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  proposed_new_time TIMESTAMPTZ NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'countered', 'accepted', 'rejected', 'cancelled', 'expired')),
  overlap_member_count INTEGER NOT NULL DEFAULT 0,
  overlap_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  resolved_by UUID REFERENCES public.profiles(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_club_negotiations_target ON public.club_clash_negotiations(target_club_id, status);

-- -----------------------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS)
-- -----------------------------------------------------------------------------
ALTER TABLE public.room_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_question_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_question_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_post_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anonymous_author_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_clash_negotiations ENABLE ROW LEVEL SECURITY;

-- 1. Room Q&A RLS
CREATE POLICY room_questions_read ON public.room_questions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.room_members rm WHERE rm.room_id = room_questions.room_id AND rm.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.rooms r WHERE r.id = room_questions.room_id AND r.visibility = 'public')
  );

CREATE POLICY room_questions_insert ON public.room_questions
  FOR INSERT TO authenticated WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.room_members rm WHERE rm.room_id = room_questions.room_id AND rm.user_id = auth.uid())
  );

CREATE POLICY room_answers_read ON public.room_question_answers
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.room_questions rq
      JOIN public.room_members rm ON rm.room_id = rq.room_id
      WHERE rq.id = room_question_answers.question_id AND rm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.room_questions rq
      JOIN public.rooms r ON r.id = rq.room_id
      WHERE rq.id = room_question_answers.question_id AND r.visibility = 'public'
    )
  );

CREATE POLICY room_answers_insert ON public.room_question_answers
  FOR INSERT TO authenticated WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.room_questions rq
      JOIN public.room_members rm ON rm.room_id = rq.room_id
      WHERE rq.id = room_question_answers.question_id AND rm.user_id = auth.uid()
    )
  );

-- 2. Room Recordings RLS
CREATE POLICY room_recordings_read ON public.room_recordings
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.room_members rm WHERE rm.room_id = room_recordings.room_id AND rm.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.rooms r WHERE r.id = room_recordings.room_id AND r.visibility = 'public')
  );

CREATE POLICY room_recordings_insert ON public.room_recordings
  FOR INSERT TO authenticated WITH CHECK (
    uploader_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = room_recordings.room_id AND rm.user_id = auth.uid() AND rm.role IN ('owner', 'moderator')
    )
  );

-- 3. Campus Posts RLS
CREATE POLICY campus_posts_read ON public.campus_posts
  FOR SELECT TO authenticated USING (status = 'active' OR author_id = auth.uid());

CREATE POLICY campus_posts_insert ON public.campus_posts
  FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());

CREATE POLICY campus_posts_update ON public.campus_posts
  FOR UPDATE TO authenticated USING (author_id = auth.uid());

CREATE POLICY campus_comments_read ON public.campus_post_comments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY campus_comments_insert ON public.campus_post_comments
  FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());

CREATE POLICY campus_reactions_all ON public.campus_post_reactions
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 4. Anonymous Map RLS (Protected: Only service-role can read/write real identities)
CREATE POLICY anonymous_map_service_only ON public.anonymous_author_map
  FOR ALL TO service_role USING (true) WITH CHECK (true);
