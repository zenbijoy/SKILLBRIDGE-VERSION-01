-- =============================================================================
-- Migration 056: Club Creation Atomic RPC, Member Status & Room Auto-Sync
-- Fixes "status" column on club_members, updates create_club_atomic,
-- and ensures create_room_atomic conflict handling with conversation triggers.
-- =============================================================================

-- 1. Ensure status column on club_members
ALTER TABLE public.club_members ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'club_members_status_check'
  ) THEN
    ALTER TABLE public.club_members ADD CONSTRAINT club_members_status_check CHECK (status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;

-- 2. Update create_club_atomic to reliably initialize owner membership
CREATE OR REPLACE FUNCTION public.create_club_atomic(
    p_name text,
    p_description text,
    p_university text,
    p_owner_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_club_id uuid;
BEGIN
    INSERT INTO public.clubs(name, description, university, created_by)
    VALUES(p_name, p_description, p_university, p_owner_id)
    RETURNING id INTO v_club_id;

    INSERT INTO public.club_members(club_id, user_id, role, title, status)
    VALUES(v_club_id, p_owner_id, 'owner', 'Founder & Owner', 'approved');

    RETURN v_club_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_club_atomic(text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_club_atomic(text, text, text, uuid) TO service_role;

-- 3. Update create_room_atomic to handle conversation_members upsert without duplicate key crash
CREATE OR REPLACE FUNCTION public.create_room_atomic(
    p_title text,
    p_description text,
    p_topic text,
    p_visibility text,
    p_mode text,
    p_capacity integer,
    p_rules text,
    p_tags text[],
    p_campus_location text,
    p_owner_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_conversation_id uuid;
  v_room_id uuid;
BEGIN
  IF p_visibility NOT IN ('public', 'private', 'invite_only') THEN
    RAISE EXCEPTION 'Invalid room visibility';
  END IF;
  IF p_mode NOT IN ('online', 'offline', 'hybrid') THEN
    RAISE EXCEPTION 'Invalid room mode';
  END IF;
  IF p_capacity < 2 OR p_capacity > 250 THEN
    RAISE EXCEPTION 'Invalid room capacity';
  END IF;

  INSERT INTO public.conversations(kind, title, created_by)
  VALUES ('room', p_title, p_owner_id)
  RETURNING id INTO v_conversation_id;

  INSERT INTO public.rooms(
    title, description, topic, visibility, mode, capacity, rules, tags,
    campus_location, owner_id, conversation_id, member_count
  ) VALUES (
    p_title, p_description, p_topic, p_visibility, p_mode, p_capacity,
    coalesce(p_rules, ''), coalesce(p_tags, '{}'::text[]), p_campus_location,
    p_owner_id, v_conversation_id, 1
  )
  RETURNING id INTO v_room_id;

  INSERT INTO public.room_members(room_id, user_id, role)
  VALUES (v_room_id, p_owner_id, 'owner')
  ON CONFLICT (room_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO public.conversation_members(conversation_id, user_id, role)
  VALUES (v_conversation_id, p_owner_id, 'owner')
  ON CONFLICT (conversation_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  RETURN v_room_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_room_atomic(text, text, text, text, text, integer, text, text[], text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_room_atomic(text, text, text, text, text, integer, text, text[], text, uuid) TO service_role;
