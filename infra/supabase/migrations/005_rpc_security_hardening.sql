-- 005_rpc_security_hardening.sql

-- 1. REVOKE EXECUTE FROM PUBLIC on Backend-only functions
REVOKE EXECUTE ON FUNCTION public.recompute_reputation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_reputation() TO service_role;

REVOKE EXECUTE ON FUNCTION public.block_user_atomic(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.block_user_atomic(uuid, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.submit_review_atomic(uuid, uuid, uuid, int, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_review_atomic(uuid, uuid, uuid, int, text, int) TO service_role;

REVOKE EXECUTE ON FUNCTION public.accept_teaching_request(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_teaching_request(uuid, uuid, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.find_dm_conversation(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_dm_conversation(uuid, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.recommend_people(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recommend_people(uuid, int) TO service_role;

REVOKE EXECUTE ON FUNCTION public.suggest_connections(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.suggest_connections(uuid, int) TO service_role;

REVOKE EXECUTE ON FUNCTION public.mutual_connection_count(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mutual_connection_count(uuid, uuid) TO service_role;


-- 2. Harden accept_teaching_request by dropping p_volunteer_id and reading from DB
-- First, drop the old function to avoid overload conflicts if signature changes
DROP FUNCTION IF EXISTS public.accept_teaching_request(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.accept_teaching_request(
    p_room_id uuid,
    p_request_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_volunteer_id uuid;
BEGIN
    -- Read volunteer_id with row-level lock
    SELECT volunteer_id INTO v_volunteer_id
    FROM public.teaching_requests
    WHERE id = p_request_id 
      AND room_id = p_room_id 
      AND status = 'pending'
    FOR UPDATE;

    IF v_volunteer_id IS NULL THEN
        RAISE EXCEPTION 'Teaching request not found or already decided';
    END IF;

    -- Update the teaching request status
    UPDATE public.teaching_requests
    SET status = 'accepted', decided_at = now()
    WHERE id = p_request_id;

    -- Upsert the room_members role to 'teacher'
    INSERT INTO public.room_members (room_id, user_id, role)
    VALUES (p_room_id, v_volunteer_id, 'teacher')
    ON CONFLICT (room_id, user_id) 
    DO UPDATE SET role = 'teacher';
END;
$$;

-- Secure the new accept_teaching_request
REVOKE EXECUTE ON FUNCTION public.accept_teaching_request(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_teaching_request(uuid, uuid) TO service_role;


-- 3. Redefine submit_review_atomic to remove duplicate reputation points update
CREATE OR REPLACE FUNCTION submit_review_atomic(
    p_reviewer_id uuid,
    p_reviewee_id uuid,
    p_session_id uuid,
    p_rating int,
    p_comment text,
    p_points_awarded int
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_review_id uuid;
BEGIN
    -- Insert the review
    INSERT INTO public.reviews (session_id, reviewer_id, reviewee_id, rating, comment)
    VALUES (p_session_id, p_reviewer_id, p_reviewee_id, p_rating, p_comment)
    RETURNING id INTO v_review_id;

    -- If points should be awarded, add to ledger. 
    -- The unique constraint will prevent duplicate awards for the same session/reviewee.
    IF p_points_awarded <> 0 THEN
        INSERT INTO public.points_ledger (user_id, event_type, points, reference_type, reference_id)
        VALUES (p_reviewee_id, 'received_review', p_points_awarded, 'session', p_session_id)
        ON CONFLICT ON CONSTRAINT points_ledger_unique_event DO NOTHING;
        
        -- REMOVED: UPDATE public.profiles SET reputation = reputation + p_points_awarded ...
        -- This is now exclusively handled by the `points_after_change` trigger to prevent double-counting.
    END IF;

    RETURN v_review_id;
END;
$$;
