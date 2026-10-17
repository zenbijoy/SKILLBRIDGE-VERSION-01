-- 006_room_transactions.sql

-- 1. create_room_atomic
CREATE OR REPLACE FUNCTION public.create_room_atomic(
    p_title text,
    p_description text,
    p_visibility text,
    p_capacity int,
    p_rules text,
    p_tags text[],
    p_owner_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_conversation_id uuid;
    v_room_id uuid;
BEGIN
    -- Create conversation
    INSERT INTO public.conversations (kind, title, created_by)
    VALUES ('room', p_title, p_owner_id)
    RETURNING id INTO v_conversation_id;

    -- Create room
    INSERT INTO public.rooms (
        title, description, visibility, capacity, rules, tags, 
        owner_id, conversation_id, member_count
    )
    VALUES (
        p_title, p_description, p_visibility::public.room_visibility, p_capacity, p_rules, p_tags, 
        p_owner_id, v_conversation_id, 1
    )
    RETURNING id INTO v_room_id;

    -- Add owner to room_members
    INSERT INTO public.room_members (room_id, user_id, role)
    VALUES (v_room_id, p_owner_id, 'owner');

    -- Add owner to conversation_members
    INSERT INTO public.conversation_members (conversation_id, user_id, role)
    VALUES (v_conversation_id, p_owner_id, 'owner');

    RETURN v_room_id;
EXCEPTION WHEN OTHERS THEN
    -- Transaction implicitly rolls back
    RAISE;
END;
$$;

-- Secure create_room_atomic
REVOKE EXECUTE ON FUNCTION public.create_room_atomic(text, text, text, int, text, text[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_room_atomic(text, text, text, int, text, text[], uuid) TO service_role;


-- 2. Modify join_room_atomic to use auth.uid() and handle conversation_members
DROP FUNCTION IF EXISTS public.join_room_atomic(uuid, uuid);

CREATE OR REPLACE FUNCTION public.join_room_atomic(
    p_room_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    r public.rooms;
    existing boolean;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO r FROM public.rooms WHERE id = p_room_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
    IF r.status NOT IN ('open','scheduled','live') THEN RAISE EXCEPTION 'Room closed'; END IF;
    
    SELECT EXISTS(SELECT 1 FROM public.room_members WHERE room_id = p_room_id AND user_id = v_user_id) INTO existing;
    IF existing THEN 
        RETURN jsonb_build_object('already_member', true, 'member_count', r.member_count); 
    END IF;
    
    IF r.member_count >= r.capacity THEN RAISE EXCEPTION 'Room full'; END IF;
    IF r.visibility = 'invite_only' THEN RAISE EXCEPTION 'Invite required'; END IF;
    
    -- Insert into room_members
    INSERT INTO public.room_members(room_id, user_id, role) 
    VALUES (p_room_id, v_user_id, 'member');

    -- Upsert into conversation_members
    INSERT INTO public.conversation_members(conversation_id, user_id, role)
    VALUES (r.conversation_id, v_user_id, 'member')
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
    
    UPDATE public.rooms SET member_count = member_count + 1, updated_at = now() WHERE id = p_room_id;
    RETURN jsonb_build_object('joined', true, 'member_count', r.member_count + 1);
END;
$$;

-- Secure join_room_atomic (client-callable)
GRANT EXECUTE ON FUNCTION public.join_room_atomic(uuid) TO authenticated;


-- 3. create leave_room_atomic
CREATE OR REPLACE FUNCTION public.leave_room_atomic(
    p_room_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    r public.rooms;
    v_role text;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO r FROM public.rooms WHERE id = p_room_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;

    SELECT role INTO v_role FROM public.room_members WHERE room_id = p_room_id AND user_id = v_user_id;
    IF NOT FOUND THEN 
        RETURN jsonb_build_object('already_left', true, 'member_count', r.member_count); 
    END IF;

    IF v_role = 'owner' THEN
        RAISE EXCEPTION 'Owner cannot simply leave. Must transfer ownership or archive/delete room.';
    END IF;

    -- Remove room membership
    DELETE FROM public.room_members WHERE room_id = p_room_id AND user_id = v_user_id;
    
    -- Remove conversation membership
    DELETE FROM public.conversation_members WHERE conversation_id = r.conversation_id AND user_id = v_user_id;

    -- Decrement member count safely
    UPDATE public.rooms 
    SET member_count = GREATEST(0, member_count - 1), updated_at = now() 
    WHERE id = p_room_id;

    RETURN jsonb_build_object('left', true, 'member_count', GREATEST(0, r.member_count - 1));
END;
$$;

-- Secure leave_room_atomic (client-callable)
GRANT EXECUTE ON FUNCTION public.leave_room_atomic(uuid) TO authenticated;
