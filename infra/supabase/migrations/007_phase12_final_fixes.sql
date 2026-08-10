-- 007_phase12_final_fixes.sql

-- A. Account Deactivation Semantics
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_account_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_account_status_check CHECK (account_status in ('active','deactivated','suspended','banned'));

-- B. Block Transaction Security
CREATE OR REPLACE FUNCTION public.block_user_atomic(
    p_blocker_id uuid,
    p_blocked_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_blocker_id = p_blocked_id THEN
        RAISE EXCEPTION 'Cannot block yourself';
    END IF;

    -- Insert block
    INSERT INTO public.blocks(blocker_id, blocked_id)
    VALUES (p_blocker_id, p_blocked_id)
    ON CONFLICT DO NOTHING;

    -- Delete connections between these two users
    DELETE FROM public.connections
    WHERE (user_a = p_blocker_id AND user_b = p_blocked_id)
       OR (user_a = p_blocked_id AND user_b = p_blocker_id);

    -- Delete pending requests between these two users
    DELETE FROM public.connection_requests
    WHERE (requester_id = p_blocker_id AND recipient_id = p_blocked_id)
       OR (requester_id = p_blocked_id AND recipient_id = p_blocker_id);
END;
$$;

REVOKE ALL ON FUNCTION public.block_user_atomic(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.block_user_atomic(uuid, uuid) TO service_role;


-- C. Review Transaction Validation
-- Drop previous versions with different signatures
DROP FUNCTION IF EXISTS public.submit_review_atomic(uuid, uuid, uuid, int, text, int);

CREATE OR REPLACE FUNCTION public.submit_review_atomic(
    p_reviewer_id uuid,
    p_reviewee_id uuid,
    p_session_id uuid,
    p_rating int,
    p_comment text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_review_id uuid;
    v_session public.sessions;
    v_reviewer_part boolean;
    v_reviewee_part boolean;
BEGIN
    IF p_reviewer_id = p_reviewee_id THEN
        RAISE EXCEPTION 'Reviewer cannot be the same as reviewee';
    END IF;

    SELECT * INTO v_session FROM public.sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Session not found'; END IF;
    IF v_session.status <> 'completed' THEN RAISE EXCEPTION 'Session is not completed'; END IF;

    -- Check participation
    SELECT EXISTS(SELECT 1 FROM public.session_participants WHERE session_id = p_session_id AND user_id = p_reviewer_id AND attendance_status = 'attended') OR v_session.teacher_id = p_reviewer_id INTO v_reviewer_part;
    IF NOT v_reviewer_part THEN RAISE EXCEPTION 'Reviewer did not participate in this session'; END IF;

    SELECT EXISTS(SELECT 1 FROM public.session_participants WHERE session_id = p_session_id AND user_id = p_reviewee_id) OR v_session.teacher_id = p_reviewee_id INTO v_reviewee_part;
    IF NOT v_reviewee_part THEN RAISE EXCEPTION 'Reviewee did not participate in this session'; END IF;

    -- Insert the review
    INSERT INTO public.reviews (session_id, reviewer_id, reviewee_id, rating, comment)
    VALUES (p_session_id, p_reviewer_id, p_reviewee_id, p_rating, p_comment)
    RETURNING id INTO v_review_id;

    -- Calculate reward inside trusted backend (e.g. 5 points per review received)
    INSERT INTO public.points_ledger (user_id, event_type, points, reference_type, reference_id)
    VALUES (p_reviewee_id, 'received_review', 5, 'session', p_session_id)
    ON CONFLICT ON CONSTRAINT points_ledger_unique_event DO NOTHING;

    RETURN v_review_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_review_atomic(uuid, uuid, uuid, int, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_review_atomic(uuid, uuid, uuid, int, text) TO service_role;


-- D. Secure other functions properly with SET search_path = public and REVOKE ALL

-- create_room_atomic
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
SET search_path = public
AS $$
DECLARE
    v_conversation_id uuid;
    v_room_id uuid;
BEGIN
    INSERT INTO public.conversations (kind, title, created_by)
    VALUES ('room', p_title, p_owner_id)
    RETURNING id INTO v_conversation_id;

    INSERT INTO public.rooms (
        title, description, visibility, capacity, rules, tags, 
        owner_id, conversation_id, member_count
    )
    VALUES (
        p_title, p_description, p_visibility::public.room_visibility, p_capacity, p_rules, p_tags, 
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

REVOKE ALL ON FUNCTION public.create_room_atomic(text, text, text, int, text, text[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_room_atomic(text, text, text, int, text, text[], uuid) TO service_role;


-- accept_teaching_request
CREATE OR REPLACE FUNCTION public.accept_teaching_request(
    p_room_id uuid,
    p_request_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_volunteer_id uuid;
BEGIN
    SELECT volunteer_id INTO v_volunteer_id
    FROM public.teaching_requests
    WHERE id = p_request_id 
      AND room_id = p_room_id 
      AND status = 'pending'
    FOR UPDATE;

    IF v_volunteer_id IS NULL THEN
        RAISE EXCEPTION 'Teaching request not found or already decided';
    END IF;

    UPDATE public.teaching_requests
    SET status = 'accepted', decided_at = now()
    WHERE id = p_request_id;

    INSERT INTO public.room_members (room_id, user_id, role)
    VALUES (p_room_id, v_volunteer_id, 'teacher')
    ON CONFLICT (room_id, user_id) 
    DO UPDATE SET role = 'teacher';
END;
$$;

REVOKE ALL ON FUNCTION public.accept_teaching_request(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_teaching_request(uuid, uuid) TO service_role;


-- E. Client-callable atomic room joins and leaves
-- join_room_atomic
CREATE OR REPLACE FUNCTION public.join_room_atomic(
    p_room_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    
    INSERT INTO public.room_members(room_id, user_id, role) 
    VALUES (p_room_id, v_user_id, 'member');

    INSERT INTO public.conversation_members(conversation_id, user_id, role)
    VALUES (r.conversation_id, v_user_id, 'member')
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
    
    UPDATE public.rooms SET member_count = member_count + 1, updated_at = now() WHERE id = p_room_id;
    RETURN jsonb_build_object('joined', true, 'member_count', r.member_count + 1);
END;
$$;

-- leave_room_atomic
CREATE OR REPLACE FUNCTION public.leave_room_atomic(
    p_room_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

    DELETE FROM public.room_members WHERE room_id = p_room_id AND user_id = v_user_id;
    DELETE FROM public.conversation_members WHERE conversation_id = r.conversation_id AND user_id = v_user_id;

    UPDATE public.rooms 
    SET member_count = GREATEST(0, member_count - 1), updated_at = now() 
    WHERE id = p_room_id;

    RETURN jsonb_build_object('left', true, 'member_count', GREATEST(0, r.member_count - 1));
END;
$$;
