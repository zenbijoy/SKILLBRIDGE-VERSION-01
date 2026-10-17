-- Migration 014: Atomic Room Service RPC and Research Members Table
-- Enables secure atomic room joins and leaves with service role support and invite checks

CREATE OR REPLACE FUNCTION public.join_room_service_atomic(
    p_room_id uuid,
    p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r public.rooms;
    existing boolean;
    v_invited boolean;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'User ID required';
    END IF;

    -- Lock room row for update to eliminate concurrency race condition
    SELECT * INTO r FROM public.rooms WHERE id = p_room_id FOR UPDATE;
    IF NOT FOUND THEN 
        RAISE EXCEPTION 'Room not found'; 
    END IF;
    
    IF r.status NOT IN ('open','scheduled','live') THEN 
        RAISE EXCEPTION 'Room is not active'; 
    END IF;
    
    SELECT EXISTS(SELECT 1 FROM public.room_members WHERE room_id = p_room_id AND user_id = p_user_id) INTO existing;
    IF existing THEN 
        RETURN jsonb_build_object('already_member', true, 'member_count', r.member_count); 
    END IF;
    
    IF r.member_count >= r.capacity THEN 
        RAISE EXCEPTION 'Room is at maximum capacity'; 
    END IF;
    
    IF r.visibility = 'private' THEN
        RAISE EXCEPTION 'This room is private';
    END IF;

    IF r.visibility = 'invite_only' THEN
        SELECT EXISTS(
            SELECT 1 FROM public.room_invitations 
            WHERE room_id = p_room_id AND invitee_id = p_user_id AND status = 'accepted'
        ) INTO v_invited;
        IF NOT v_invited THEN
            RAISE EXCEPTION 'This room requires an invitation to join';
        END IF;
    END IF;
    
    INSERT INTO public.room_members(room_id, user_id, role) 
    VALUES (p_room_id, p_user_id, 'learner');

    IF r.conversation_id IS NOT NULL THEN
        INSERT INTO public.conversation_members(conversation_id, user_id, role)
        VALUES (r.conversation_id, p_user_id, 'member')
        ON CONFLICT (conversation_id, user_id) DO NOTHING;
    END IF;
    
    UPDATE public.rooms SET member_count = member_count + 1, updated_at = now() WHERE id = p_room_id;
    RETURN jsonb_build_object('joined', true, 'member_count', r.member_count + 1);
END;
$$;

-- Atomic leave
CREATE OR REPLACE FUNCTION public.leave_room_service_atomic(
    p_room_id uuid,
    p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r public.rooms;
BEGIN
    SELECT * INTO r FROM public.rooms WHERE id = p_room_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
    IF r.owner_id = p_user_id THEN RAISE EXCEPTION 'Room owner cannot leave their own room'; END IF;

    DELETE FROM public.room_members WHERE room_id = p_room_id AND user_id = p_user_id;

    IF r.conversation_id IS NOT NULL THEN
        DELETE FROM public.conversation_members WHERE conversation_id = r.conversation_id AND user_id = p_user_id;
    END IF;

    UPDATE public.rooms SET member_count = GREATEST(1, member_count - 1), updated_at = now() WHERE id = p_room_id;
    RETURN jsonb_build_object('left', true, 'member_count', GREATEST(1, r.member_count - 1));
END;
$$;
