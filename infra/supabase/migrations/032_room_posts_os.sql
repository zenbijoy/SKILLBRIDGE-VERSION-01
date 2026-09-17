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
