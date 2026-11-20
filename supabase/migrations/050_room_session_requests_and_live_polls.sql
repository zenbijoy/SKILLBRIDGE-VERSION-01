-- ==============================================================================
-- Migration 050: Room Session Requests, Session Types (Voice, Offline, Video), and Live Polls
-- ==============================================================================

BEGIN;

-- 1. Extend sessions table with session_type
ALTER TABLE public.sessions 
  ADD COLUMN IF NOT EXISTS session_type text CHECK (session_type IN ('voice', 'offline', 'video')) DEFAULT 'video';

UPDATE public.sessions 
SET session_type = CASE 
  WHEN mode = 'offline' THEN 'offline' 
  WHEN media = 'audio' THEN 'voice' 
  ELSE 'video' 
END 
WHERE session_type IS NULL;

-- 2. Create room_session_requests table
CREATE TABLE IF NOT EXISTS public.room_session_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text DEFAULT '',
  session_type text NOT NULL DEFAULT 'video' CHECK (session_type IN ('voice', 'offline', 'video')),
  preferred_time timestamptz,
  preferred_time_note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'converted_to_poll')),
  scheduled_session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  poll_id uuid REFERENCES public.room_posts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Create room_session_request_upvotes table
CREATE TABLE IF NOT EXISTS public.room_session_request_upvotes (
  request_id uuid NOT NULL REFERENCES public.room_session_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, user_id)
);

-- 4. Create indexes for quick retrieval
CREATE INDEX IF NOT EXISTS idx_room_session_requests_room ON public.room_session_requests(room_id, status);
CREATE INDEX IF NOT EXISTS idx_room_session_requests_user ON public.room_session_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_room_session_request_upvotes_req ON public.room_session_request_upvotes(request_id);

-- 5. Enable RLS
ALTER TABLE public.room_session_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_session_request_upvotes ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies for room_session_requests
DROP POLICY IF EXISTS "Room members can read session requests" ON public.room_session_requests;
CREATE POLICY "Room members can read session requests"
  ON public.room_session_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.room_members rm 
      WHERE rm.room_id = room_session_requests.room_id 
      AND rm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.rooms r 
      WHERE r.id = room_session_requests.room_id 
      AND (r.owner_id = auth.uid() OR r.visibility = 'public')
    )
  );

DROP POLICY IF EXISTS "Members can create session requests" ON public.room_session_requests;
CREATE POLICY "Members can create session requests"
  ON public.room_session_requests FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.room_members rm 
      WHERE rm.room_id = room_session_requests.room_id 
      AND rm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authors and room leaders can update session requests" ON public.room_session_requests;
CREATE POLICY "Authors and room leaders can update session requests"
  ON public.room_session_requests FOR UPDATE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.room_members rm 
      WHERE rm.room_id = room_session_requests.room_id 
      AND rm.user_id = auth.uid()
      AND rm.role IN ('owner', 'admin', 'teacher', 'moderator')
    )
    OR EXISTS (
      SELECT 1 FROM public.rooms r 
      WHERE r.id = room_session_requests.room_id 
      AND r.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authors and room leaders can delete session requests" ON public.room_session_requests;
CREATE POLICY "Authors and room leaders can delete session requests"
  ON public.room_session_requests FOR DELETE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.rooms r 
      WHERE r.id = room_session_requests.room_id 
      AND r.owner_id = auth.uid()
    )
  );

-- 7. RLS Policies for room_session_request_upvotes
DROP POLICY IF EXISTS "Room members can read upvotes" ON public.room_session_request_upvotes;
CREATE POLICY "Room members can read upvotes"
  ON public.room_session_request_upvotes FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can manage own upvotes" ON public.room_session_request_upvotes;
CREATE POLICY "Users can manage own upvotes"
  ON public.room_session_request_upvotes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 8. Ensure room_poll_votes policies
DROP POLICY IF EXISTS "Members can view poll votes" ON public.room_poll_votes;
CREATE POLICY "Members can view poll votes"
  ON public.room_poll_votes FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can vote on polls" ON public.room_poll_votes;
CREATE POLICY "Users can vote on polls"
  ON public.room_poll_votes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMIT;
