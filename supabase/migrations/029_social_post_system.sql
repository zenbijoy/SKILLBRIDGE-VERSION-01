-- =============================================================================
-- Migration 029: Complete Campus Social Post & Rich Publishing Ecosystem
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
