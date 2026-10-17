-- ==============================================================================
-- Migration 048: Real-Time Room Live Sessions, Permissions & Atomic Lifecycle
-- ==============================================================================

-- 1. Migrate any legacy NULL knock_mode_enabled values and set canonical default
UPDATE public.rooms SET knock_mode_enabled = true WHERE knock_mode_enabled IS NULL;
ALTER TABLE public.rooms ALTER COLUMN knock_mode_enabled SET DEFAULT true;

-- Ensure cover_image_url, is_teacher_mode, and is_locked exist on rooms
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS cover_image_url text;
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS is_teacher_mode boolean NOT NULL DEFAULT false;
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false;

-- 2. Extend existing study sessions table with media and created_by
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS media text NOT NULL DEFAULT 'video' CHECK (media IN ('audio', 'video'));
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS sessions_scheduler_idx ON public.sessions(room_id, status, starts_at, ends_at);

-- 3. Create room_open_sessions table
CREATE TABLE IF NOT EXISTS public.room_open_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  media text NOT NULL DEFAULT 'audio' CHECK (media IN ('audio', 'video')),
  status text NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'ended')),
  started_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  host_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  livekit_room text NOT NULL UNIQUE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  end_reason text,
  last_empty_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Partial UNIQUE index: exactly one active ('live') open session per room
CREATE UNIQUE INDEX IF NOT EXISTS room_open_sessions_active_idx 
  ON public.room_open_sessions(room_id) 
  WHERE status = 'live';

CREATE INDEX IF NOT EXISTS room_open_sessions_status_idx 
  ON public.room_open_sessions(room_id, status);

CREATE INDEX IF NOT EXISTS room_open_sessions_empty_idx 
  ON public.room_open_sessions(status, last_empty_at) 
  WHERE status = 'live';

-- 4. Create room_open_participants table
CREATE TABLE IF NOT EXISTS public.room_open_participants (
  session_id uuid NOT NULL REFERENCES public.room_open_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  is_host boolean NOT NULL DEFAULT false,
  PRIMARY KEY (session_id, user_id, joined_at)
);

CREATE INDEX IF NOT EXISTS room_open_participants_active_idx 
  ON public.room_open_participants(session_id, user_id) 
  WHERE left_at IS NULL;

-- 5. Create room_study_permissions table
CREATE TABLE IF NOT EXISTS public.room_study_permissions (
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  granted_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  PRIMARY KEY (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS room_study_permissions_room_idx 
  ON public.room_study_permissions(room_id, user_id);

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.room_open_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_open_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_study_permissions ENABLE ROW LEVEL SECURITY;

-- RLS: Room members can SELECT sessions, participants, and permissions
DROP POLICY IF EXISTS "Members can select open sessions" ON public.room_open_sessions;
CREATE POLICY "Members can select open sessions" ON public.room_open_sessions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.room_members rm 
      WHERE rm.room_id = room_open_sessions.room_id 
      AND rm.user_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.rooms r 
      WHERE r.id = room_open_sessions.room_id 
      AND (r.owner_id = auth.uid() OR r.visibility = 'public')
    )
  );

DROP POLICY IF EXISTS "Members can select open participants" ON public.room_open_participants;
CREATE POLICY "Members can select open participants" ON public.room_open_participants
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.room_open_sessions ros
      JOIN public.room_members rm ON rm.room_id = ros.room_id
      WHERE ros.id = room_open_participants.session_id 
      AND rm.user_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.room_open_sessions ros
      JOIN public.rooms r ON r.id = ros.room_id
      WHERE ros.id = room_open_participants.session_id 
      AND (r.owner_id = auth.uid() OR r.visibility = 'public')
    )
  );

DROP POLICY IF EXISTS "Members can select study permissions" ON public.room_study_permissions;
CREATE POLICY "Members can select study permissions" ON public.room_study_permissions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.room_members rm 
      WHERE rm.room_id = room_study_permissions.room_id 
      AND rm.user_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.rooms r 
      WHERE r.id = room_study_permissions.room_id 
      AND r.owner_id = auth.uid()
    )
  );

-- Service role full access
DROP POLICY IF EXISTS "Service role full access on room_open_sessions" ON public.room_open_sessions;
CREATE POLICY "Service role full access on room_open_sessions" ON public.room_open_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on room_open_participants" ON public.room_open_participants;
CREATE POLICY "Service role full access on room_open_participants" ON public.room_open_participants
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on room_study_permissions" ON public.room_study_permissions;
CREATE POLICY "Service role full access on room_study_permissions" ON public.room_study_permissions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 7. ATOMIC RPC: end_open_sessions_for_room
CREATE OR REPLACE FUNCTION public.end_open_sessions_for_room(
  p_room_id uuid,
  p_reason text DEFAULT 'study_session_started'
) RETURNS TABLE(ended_session_id uuid, livekit_room text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec record;
BEGIN
  -- Mark all active open sessions as ended
  FOR v_rec IN 
    UPDATE public.room_open_sessions
    SET status = 'ended',
        ended_at = now(),
        end_reason = p_reason
    WHERE room_id = p_room_id AND status = 'live'
    RETURNING id, room_open_sessions.livekit_room
  LOOP
    -- Close all active participant records
    UPDATE public.room_open_participants
    SET left_at = now()
    WHERE session_id = v_rec.id AND left_at IS NULL;

    ended_session_id := v_rec.id;
    livekit_room := v_rec.livekit_room;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- 8. ATOMIC RPC: start_open_session_atomic
CREATE OR REPLACE FUNCTION public.start_open_session_atomic(
  p_room_id uuid,
  p_user_id uuid,
  p_media text DEFAULT 'audio'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_member boolean;
  v_owner_id uuid;
  v_room_visibility text;
  v_study_live record;
  v_existing_session record;
  v_new_session_id uuid;
  v_livekit_room text;
  v_result jsonb;
BEGIN
  IF p_media NOT IN ('audio', 'video') THEN
    RAISE EXCEPTION 'Invalid media type: %', p_media USING ERRCODE = 'SB001';
  END IF;

  -- Lock room row to serialize session state changes per room
  SELECT owner_id, visibility INTO v_owner_id, v_room_visibility
  FROM public.rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found' USING ERRCODE = 'SB002';
  END IF;

  -- Check membership or ownership
  SELECT EXISTS (
    SELECT 1 FROM public.room_members 
    WHERE room_id = p_room_id AND user_id = p_user_id
  ) INTO v_is_member;

  IF NOT v_is_member AND v_owner_id != p_user_id THEN
    -- If room is open public, auto-join user as member
    IF v_room_visibility = 'public' THEN
      INSERT INTO public.room_members (room_id, user_id, role)
      VALUES (p_room_id, p_user_id, 'member')
      ON CONFLICT (room_id, user_id) DO NOTHING;
    ELSE
      RAISE EXCEPTION 'User is not a member of this room' USING ERRCODE = 'SB003';
    END IF;
  END IF;

  -- Check if a study session is currently live or scheduled within the next 2 minutes
  SELECT id, title, starts_at, ends_at, status INTO v_study_live
  FROM public.sessions
  WHERE room_id = p_room_id
    AND (
      status = 'live'
      OR (
        status = 'scheduled' 
        AND starts_at <= (now() + interval '2 minutes')
        AND (ends_at IS NULL OR ends_at > now())
      )
    )
  ORDER BY starts_at ASC
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'STUDY_SESSION_ACTIVE_OR_PENDING: Cannot start open session while a study session is active or scheduled soon.'
      USING ERRCODE = 'SB004';
  END IF;

  -- Idempotency check: if an open session is already live, return it and ensure user is a participant
  SELECT * INTO v_existing_session
  FROM public.room_open_sessions
  WHERE room_id = p_room_id AND status = 'live';

  IF FOUND THEN
    -- Join user to existing open session if not already in it
    INSERT INTO public.room_open_participants (session_id, user_id, joined_at, is_host)
    VALUES (v_existing_session.id, p_user_id, now(), false)
    ON CONFLICT (session_id, user_id, joined_at) DO NOTHING;

    -- Clear last_empty_at since a participant is present
    UPDATE public.room_open_sessions
    SET last_empty_at = NULL
    WHERE id = v_existing_session.id;

    RETURN jsonb_build_object(
      'session_id', v_existing_session.id,
      'room_id', v_existing_session.room_id,
      'media', v_existing_session.media,
      'status', v_existing_session.status,
      'host_id', v_existing_session.host_id,
      'started_by', v_existing_session.started_by,
      'livekit_room', v_existing_session.livekit_room,
      'started_at', v_existing_session.started_at,
      'is_new', false
    );
  END IF;

  -- Insert new live open session
  v_new_session_id := gen_random_uuid();
  v_livekit_room := 'skillbridge-open-' || v_new_session_id;

  INSERT INTO public.room_open_sessions (
    id, room_id, media, status, started_by, host_id, livekit_room, started_at
  ) VALUES (
    v_new_session_id, p_room_id, p_media, 'live', p_user_id, p_user_id, v_livekit_room, now()
  );

  -- Insert starter as initial host participant
  INSERT INTO public.room_open_participants (
    session_id, user_id, joined_at, is_host
  ) VALUES (
    v_new_session_id, p_user_id, now(), true
  );

  RETURN jsonb_build_object(
    'session_id', v_new_session_id,
    'room_id', p_room_id,
    'media', p_media,
    'status', 'live',
    'host_id', p_user_id,
    'started_by', p_user_id,
    'livekit_room', v_livekit_room,
    'started_at', now(),
    'is_new', true
  );
END;
$$;

-- 9. ATOMIC RPC: join_open_session_atomic
CREATE OR REPLACE FUNCTION public.join_open_session_atomic(
  p_session_id uuid,
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session record;
  v_is_member boolean;
BEGIN
  SELECT * INTO v_session
  FROM public.room_open_sessions
  WHERE id = p_session_id AND status = 'live';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Open session not found or already ended' USING ERRCODE = 'SB005';
  END IF;

  -- Check membership
  SELECT EXISTS (
    SELECT 1 FROM public.room_members 
    WHERE room_id = v_session.room_id AND user_id = p_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.rooms 
    WHERE id = v_session.room_id AND (owner_id = p_user_id OR visibility = 'public')
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    RAISE EXCEPTION 'User is not a member of this room' USING ERRCODE = 'SB003';
  END IF;

  -- Insert participant record if not actively present
  INSERT INTO public.room_open_participants (session_id, user_id, joined_at, is_host)
  VALUES (p_session_id, p_user_id, now(), (v_session.host_id = p_user_id))
  ON CONFLICT (session_id, user_id, joined_at) DO NOTHING;

  -- Clear last_empty_at flag
  UPDATE public.room_open_sessions
  SET last_empty_at = NULL
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'session_id', v_session.id,
    'room_id', v_session.room_id,
    'media', v_session.media,
    'host_id', v_session.host_id,
    'livekit_room', v_session.livekit_room
  );
END;
$$;

-- 10. ATOMIC RPC: leave_open_session_atomic (handles host transfer & grace period)
CREATE OR REPLACE FUNCTION public.leave_open_session_atomic(
  p_session_id uuid,
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session record;
  v_remaining_count int;
  v_next_host record;
  v_new_host_id uuid;
  v_last_empty timestamptz := NULL;
BEGIN
  -- Lock session record
  SELECT * INTO v_session
  FROM public.room_open_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'session_not_found');
  END IF;

  -- Mark active participation as left
  UPDATE public.room_open_participants
  SET left_at = now()
  WHERE session_id = p_session_id AND user_id = p_user_id AND left_at IS NULL;

  -- Count remaining active participants
  SELECT count(*) INTO v_remaining_count
  FROM public.room_open_participants
  WHERE session_id = p_session_id AND left_at IS NULL;

  v_new_host_id := v_session.host_id;

  IF v_remaining_count = 0 THEN
    -- No participants remain: set last_empty_at to now() to begin grace period
    v_last_empty := now();
    UPDATE public.room_open_sessions
    SET last_empty_at = v_last_empty
    WHERE id = p_session_id;
  ELSIF v_session.host_id = p_user_id THEN
    -- Host left! Transfer host to the longest-present active participant
    SELECT user_id INTO v_next_host
    FROM public.room_open_participants
    WHERE session_id = p_session_id AND left_at IS NULL
    ORDER BY joined_at ASC
    LIMIT 1;

    IF FOUND THEN
      v_new_host_id := v_next_host.user_id;
      UPDATE public.room_open_sessions
      SET host_id = v_new_host_id
      WHERE id = p_session_id;

      UPDATE public.room_open_participants
      SET is_host = true
      WHERE session_id = p_session_id AND user_id = v_new_host_id AND left_at IS NULL;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'user_id', p_user_id,
    'remaining_count', v_remaining_count,
    'host_id', v_new_host_id,
    'host_transferred', (v_new_host_id != v_session.host_id),
    'last_empty_at', v_last_empty
  );
END;
$$;

-- 11. ATOMIC RPC: start_study_session_atomic (enforces permissions & atomically ends open sessions)
CREATE OR REPLACE FUNCTION public.start_study_session_atomic(
  p_room_id uuid,
  p_user_id uuid,
  p_title text,
  p_media text DEFAULT 'video',
  p_starts_at timestamptz DEFAULT now(),
  p_ends_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_owner boolean;
  v_has_permission boolean;
  v_session_id uuid;
  v_ended_open jsonb := '[]'::jsonb;
  v_rec record;
BEGIN
  -- Lock room row
  PERFORM id FROM public.rooms WHERE id = p_room_id FOR UPDATE;

  -- 1. Check Owner permission
  SELECT (owner_id = p_user_id) INTO v_is_owner
  FROM public.rooms
  WHERE id = p_room_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found' USING ERRCODE = 'SB002';
  END IF;

  -- 2. Check study permissions table (or teacher role)
  IF NOT v_is_owner THEN
    SELECT EXISTS (
      SELECT 1 FROM public.room_study_permissions
      WHERE room_id = p_room_id 
        AND user_id = p_user_id 
        AND (expires_at IS NULL OR expires_at > now())
    ) OR EXISTS (
      SELECT 1 FROM public.room_members
      WHERE room_id = p_room_id 
        AND user_id = p_user_id 
        AND role IN ('teacher')
    ) INTO v_has_permission;

    IF NOT v_has_permission THEN
      RAISE EXCEPTION 'PERMISSION_DENIED_STUDY_SESSION: Only the room owner or authorized study creators may start a study session.'
        USING ERRCODE = 'SB006';
    END IF;
  END IF;

  -- 3. In the SAME transaction: end all active open sessions for this room
  FOR v_rec IN 
    SELECT * FROM public.end_open_sessions_for_room(p_room_id, 'study_session_started')
  LOOP
    v_ended_open := v_ended_open || jsonb_build_object(
      'session_id', v_rec.ended_session_id,
      'livekit_room', v_rec.livekit_room
    );
  END LOOP;

  -- 4. Create and start the study session
  v_session_id := gen_random_uuid();
  INSERT INTO public.sessions (
    id, room_id, teacher_id, created_by, title, mode, media, status, starts_at, ends_at
  ) VALUES (
    v_session_id, p_room_id, p_user_id, p_user_id, p_title, 'online', 
    COALESCE(p_media, 'video'), 'live', COALESCE(p_starts_at, now()), p_ends_at
  );

  -- 5. Add creator as initial participant
  INSERT INTO public.session_participants (session_id, user_id, status, attendance_status)
  VALUES (v_session_id, p_user_id, 'attended', 'present')
  ON CONFLICT (session_id, user_id) DO NOTHING;

  RETURN jsonb_build_object(
    'session_id', v_session_id,
    'room_id', p_room_id,
    'title', p_title,
    'media', COALESCE(p_media, 'video'),
    'status', 'live',
    'teacher_id', p_user_id,
    'ended_open_sessions', v_ended_open
  );
END;
$$;

-- 12. ATOMIC RPC: create_room_full_atomic (Single-transaction room + metadata + invitations)
CREATE OR REPLACE FUNCTION public.create_room_full_atomic(
  p_title text,
  p_description text,
  p_topic text,
  p_visibility text,
  p_mode text,
  p_capacity integer,
  p_rules text,
  p_tags text[],
  p_campus_location text,
  p_owner_id uuid,
  p_cover_image_url text DEFAULT NULL,
  p_is_teacher_mode boolean DEFAULT false,
  p_knock_mode_enabled boolean DEFAULT true,
  p_appearance jsonb DEFAULT '{}'::jsonb,
  p_invitee_usernames text[] DEFAULT '{}'::text[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation_id uuid;
  v_room_id uuid;
  v_username text;
  v_invitee_id uuid;
  v_invited_count int := 0;
  v_failed_invites text[] := '{}'::text[];
BEGIN
  IF p_visibility NOT IN ('public', 'private', 'invite_only') THEN
    RAISE EXCEPTION 'Invalid room visibility';
  END IF;
  IF p_mode NOT IN ('online', 'offline', 'hybrid') THEN
    RAISE EXCEPTION 'Invalid room mode';
  END IF;
  IF p_capacity < 2 OR p_capacity > 500 THEN
    RAISE EXCEPTION 'Invalid room capacity (must be between 2 and 500)';
  END IF;

  -- 1. Create linked room conversation
  INSERT INTO public.conversations (kind, title, created_by)
  VALUES ('room', p_title, p_owner_id)
  RETURNING id INTO v_conversation_id;

  -- 2. Create room with all extended columns atomically
  INSERT INTO public.rooms (
    title, description, topic, visibility, mode, capacity, rules, tags,
    campus_location, owner_id, conversation_id, member_count,
    cover_image_url, is_teacher_mode, knock_mode_enabled, appearance
  ) VALUES (
    p_title, p_description, p_topic, p_visibility, p_mode, p_capacity,
    COALESCE(p_rules, ''), COALESCE(p_tags, '{}'::text[]), p_campus_location,
    p_owner_id, v_conversation_id, 1,
    p_cover_image_url, COALESCE(p_is_teacher_mode, false), 
    COALESCE(p_knock_mode_enabled, true), COALESCE(p_appearance, '{}'::jsonb)
  )
  RETURNING id INTO v_room_id;

  -- 3. Add owner as member in both room and conversation
  INSERT INTO public.room_members (room_id, user_id, role)
  VALUES (v_room_id, p_owner_id, 'owner');

  INSERT INTO public.conversation_members (conversation_id, user_id, role)
  VALUES (v_conversation_id, p_owner_id, 'owner');

  -- 4. Process invitations atomically if provided
  IF p_invitee_usernames IS NOT NULL AND array_length(p_invitee_usernames, 1) > 0 THEN
    FOREACH v_username IN ARRAY p_invitee_usernames
    LOOP
      SELECT id INTO v_invitee_id 
      FROM public.profiles 
      WHERE lower(username) = lower(trim(v_username));

      IF FOUND AND v_invitee_id != p_owner_id THEN
        INSERT INTO public.room_invitations (room_id, inviter_id, invitee_id, status)
        VALUES (v_room_id, p_owner_id, v_invitee_id, 'pending')
        ON CONFLICT (room_id, invitee_id) DO NOTHING;
        v_invited_count := v_invited_count + 1;
      ELSE
        v_failed_invites := array_append(v_failed_invites, v_username);
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'room_id', v_room_id,
    'conversation_id', v_conversation_id,
    'title', p_title,
    'invited_count', v_invited_count,
    'failed_invites', v_failed_invites
  );
END;
$$;

-- Revoke execute from public/anon and grant to service_role
REVOKE ALL ON FUNCTION public.end_open_sessions_for_room FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.end_open_sessions_for_room TO service_role;

REVOKE ALL ON FUNCTION public.start_open_session_atomic FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_open_session_atomic TO service_role;

REVOKE ALL ON FUNCTION public.join_open_session_atomic FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_open_session_atomic TO service_role;

REVOKE ALL ON FUNCTION public.leave_open_session_atomic FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leave_open_session_atomic TO service_role;

REVOKE ALL ON FUNCTION public.start_study_session_atomic FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_study_session_atomic TO service_role;

REVOKE ALL ON FUNCTION public.create_room_full_atomic FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_room_full_atomic TO service_role;
