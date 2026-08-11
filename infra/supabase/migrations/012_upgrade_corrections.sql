-- 012_upgrade_corrections.sql

-- 1. Defensively add the 'rules' column to 'rooms' which was mistakenly edited inline in 001_schema.sql
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS rules text not null default '';

-- 2. Apply proper execution privileges to recompute_reputation(uuid)
-- 005_rpc_security_hardening.sql mistakenly used recompute_reputation() without args
REVOKE EXECUTE ON FUNCTION public.recompute_reputation(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_reputation(uuid) TO service_role;

-- Re-affirming block_user_atomic as well (defensive)
REVOKE EXECUTE ON FUNCTION public.block_user_atomic(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.block_user_atomic(uuid, uuid) TO service_role;

-- 3. Update create_room_atomic to include new parameters (topic, mode, campus_location)
-- This was incorrectly inlined into 006_room_transactions.sql and 007_phase12_final_fixes.sql
CREATE OR REPLACE FUNCTION public.create_room_atomic(
    p_title text,
    p_description text,
    p_topic text,
    p_visibility text,
    p_mode text,
    p_capacity int,
    p_rules text,
    p_tags text[],
    p_campus_location text,
    p_owner_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_conversation_id uuid;
    v_room_id uuid;
BEGIN
    IF p_visibility NOT IN ('public','private','invite_only') THEN
        RAISE EXCEPTION 'Invalid room visibility';
    END IF;

    IF p_mode NOT IN ('online','offline','hybrid') THEN
        RAISE EXCEPTION 'Invalid room mode';
    END IF;

    IF p_capacity < 2 OR p_capacity > 250 THEN
        RAISE EXCEPTION 'Invalid room capacity';
    END IF;

    INSERT INTO public.conversations (kind, title, created_by)
    VALUES ('room', p_title, p_owner_id)
    RETURNING id INTO v_conversation_id;

    INSERT INTO public.rooms (
        title, description, topic, visibility, mode, capacity, rules, tags,
        campus_location, owner_id, conversation_id, member_count
    )
    VALUES (
        p_title, p_description, p_topic, p_visibility, p_mode, p_capacity,
        COALESCE(p_rules, ''), COALESCE(p_tags, '{}'), p_campus_location,
        p_owner_id, v_conversation_id, 1
    )
    RETURNING id INTO v_room_id;

    INSERT INTO public.room_members (room_id, user_id, role)
    VALUES (v_room_id, p_owner_id, 'owner');

    INSERT INTO public.conversation_members (conversation_id, user_id, role)
    VALUES (v_conversation_id, p_owner_id, 'owner');

    RETURN v_room_id;
END;
$$;

-- Secure the redefined create_room_atomic
REVOKE ALL ON FUNCTION public.create_room_atomic(
    text, text, text, text, text, int, text, text[], text, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_room_atomic(
    text, text, text, text, text, int, text, text[], text, uuid
) TO service_role;
