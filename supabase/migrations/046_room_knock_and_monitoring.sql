-- =============================================================================
-- Migration 046: Room Knock System & Real-Time Monitoring
-- 1. Extend rooms table with knock_mode_enabled and is_locked
-- 2. Create room_knock_requests for approval lobbies
-- 3. Create room_monitoring_events for senior-grade audit trails
-- =============================================================================

-- 1. Extend rooms table
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS knock_mode_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false;

-- 2. Create room_knock_requests table
CREATE TABLE IF NOT EXISTS public.room_knock_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  method TEXT NOT NULL DEFAULT 'message' CHECK (method IN ('message', 'phone_call')),
  message TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'admitted', 'declined', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  decided_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_room_knock_requests_room ON public.room_knock_requests(room_id, status);
CREATE INDEX IF NOT EXISTS idx_room_knock_requests_user ON public.room_knock_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_room_knock_requests_created ON public.room_knock_requests(created_at DESC);

-- Enable RLS
ALTER TABLE public.room_knock_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'room_knock_requests' AND policyname = 'Requesters can view and submit own knock requests'
  ) THEN
    CREATE POLICY "Requesters can view and submit own knock requests"
      ON public.room_knock_requests FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'room_knock_requests' AND policyname = 'Room hosts and moderators can manage knock requests'
  ) THEN
    CREATE POLICY "Room hosts and moderators can manage knock requests"
      ON public.room_knock_requests FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.rooms r
          WHERE r.id = room_knock_requests.room_id AND r.owner_id = auth.uid()
        ) OR EXISTS (
          SELECT 1 FROM public.room_members rm
          WHERE rm.room_id = room_knock_requests.room_id AND rm.user_id = auth.uid() AND rm.role IN ('owner', 'moderator')
        )
      );
  END IF;
END $$;

-- 3. Create room_monitoring_events table
CREATE TABLE IF NOT EXISTS public.room_monitoring_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_room_monitoring_events_room ON public.room_monitoring_events(room_id, created_at DESC);

ALTER TABLE public.room_monitoring_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'room_monitoring_events' AND policyname = 'Room moderators can view monitoring events'
  ) THEN
    CREATE POLICY "Room moderators can view monitoring events"
      ON public.room_monitoring_events FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.rooms r
          WHERE r.id = room_monitoring_events.room_id AND r.owner_id = auth.uid()
        ) OR EXISTS (
          SELECT 1 FROM public.room_members rm
          WHERE rm.room_id = room_monitoring_events.room_id AND rm.user_id = auth.uid() AND rm.role IN ('owner', 'moderator')
        )
      );
  END IF;
END $$;
