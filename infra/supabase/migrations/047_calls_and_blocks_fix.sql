-- ============================================================================
-- Migration 047: Calls and Blocks Foundation Fix
-- Description: Ensures public.calls and public.blocks tables, indexes, views, and RLS policies exist
-- ============================================================================

-- 1. Calls Table
CREATE TABLE IF NOT EXISTS public.calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    caller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    callee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('audio', 'video')),
    status TEXT NOT NULL CHECK (
        status IN (
            'initiating',
            'ringing',
            'accepted',
            'connecting',
            'connected',
            'reconnecting',
            'declined',
            'busy',
            'missed',
            'failed',
            'ended'
        )
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ringing_at TIMESTAMPTZ,
    answered_at TIMESTAMPTZ,
    connected_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
    end_reason TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT chk_caller_callee_different CHECK (caller_id <> callee_id)
);

CREATE INDEX IF NOT EXISTS idx_calls_caller ON public.calls(caller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_callee ON public.calls(callee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_status ON public.calls(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_active ON public.calls(caller_id, callee_id, status)
    WHERE status IN ('initiating', 'ringing', 'accepted', 'connecting', 'connected', 'reconnecting');

ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calls' AND policyname = 'Call participants can view their call records') THEN
    CREATE POLICY "Call participants can view their call records"
    ON public.calls FOR SELECT
    USING (
        caller_id = auth.uid() OR
        callee_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND ('admin' = ANY(profiles.roles) OR 'moderator' = ANY(profiles.roles))
        )
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calls' AND policyname = 'Authenticated users can initiate calls') THEN
    CREATE POLICY "Authenticated users can initiate calls"
    ON public.calls FOR INSERT
    WITH CHECK (
        auth.uid() = caller_id AND
        caller_id <> callee_id
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calls' AND policyname = 'Call participants can update call state') THEN
    CREATE POLICY "Call participants can update call state"
    ON public.calls FOR UPDATE
    USING (
        caller_id = auth.uid() OR
        callee_id = auth.uid()
    );
  END IF;
END $$;

-- 2. Blocks Table & user_blocks View
CREATE TABLE IF NOT EXISTS public.blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_block_self CHECK (blocker_id <> blocked_id),
    UNIQUE (blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON public.blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON public.blocks(blocked_id);

ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'blocks' AND policyname = 'Users can view their own blocks') THEN
    CREATE POLICY "Users can view their own blocks"
    ON public.blocks FOR SELECT
    USING (blocker_id = auth.uid() OR blocked_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'blocks' AND policyname = 'Users can block others') THEN
    CREATE POLICY "Users can block others"
    ON public.blocks FOR INSERT
    WITH CHECK (blocker_id = auth.uid() AND blocker_id <> blocked_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'blocks' AND policyname = 'Users can unblock others') THEN
    CREATE POLICY "Users can unblock others"
    ON public.blocks FOR DELETE
    USING (blocker_id = auth.uid());
  END IF;
END $$;

-- Alias view for user_blocks compatibility
CREATE OR REPLACE VIEW public.user_blocks AS
SELECT * FROM public.blocks;
