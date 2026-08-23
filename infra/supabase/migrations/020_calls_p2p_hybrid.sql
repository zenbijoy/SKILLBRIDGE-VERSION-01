-- ============================================================================
-- Migration 020: P2P Calls Hybrid Architecture Schema & RLS
-- Description: Dedicated table and state machine for 1:1 WebRTC audio/video calls
-- ============================================================================

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

-- Optimized Composite Indexes
CREATE INDEX IF NOT EXISTS idx_calls_caller ON public.calls(caller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_callee ON public.calls(callee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_status ON public.calls(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_active ON public.calls(caller_id, callee_id, status)
    WHERE status IN ('initiating', 'ringing', 'accepted', 'connecting', 'connected', 'reconnecting');

-- Row Level Security (RLS)
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

-- Select Policy: Call participants and elevated admins
CREATE POLICY "Call participants can view their call records"
ON public.calls FOR SELECT
USING (
    caller_id = auth.uid() OR
    callee_id = auth.uid() OR
    EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_roles.user_id = auth.uid()
        AND user_roles.role IN ('admin', 'moderator')
    )
);

-- Insert Policy: Authenticated users can only initiate calls where they are the caller
CREATE POLICY "Authenticated users can initiate calls"
ON public.calls FOR INSERT
WITH CHECK (
    auth.uid() = caller_id AND
    caller_id <> callee_id
);

-- Update Policy: Call participants can update call state
CREATE POLICY "Call participants can update call state"
ON public.calls FOR UPDATE
USING (
    caller_id = auth.uid() OR
    callee_id = auth.uid()
);
