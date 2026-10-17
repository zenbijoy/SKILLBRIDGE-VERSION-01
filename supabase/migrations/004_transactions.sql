-- 004_transactions.sql

-- 1. Idempotency Constraint on points_ledger
ALTER TABLE public.points_ledger 
ADD CONSTRAINT points_ledger_unique_event UNIQUE (user_id, event_type, reference_type, reference_id);

-- 2. Transaction for accepting a teaching request
CREATE OR REPLACE FUNCTION accept_teaching_request(
    p_room_id uuid,
    p_request_id uuid,
    p_volunteer_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Update the teaching request status
    UPDATE public.teaching_requests
    SET status = 'accepted', decided_at = now()
    WHERE id = p_request_id AND room_id = p_room_id;

    -- Upsert the room_members role to 'teacher'
    INSERT INTO public.room_members (room_id, user_id, role)
    VALUES (p_room_id, p_volunteer_id, 'teacher')
    ON CONFLICT (room_id, user_id) 
    DO UPDATE SET role = 'teacher';
END;
$$;

-- 3. Transaction for blocking a user
CREATE OR REPLACE FUNCTION block_user_atomic(
    p_blocker_id uuid,
    p_blocked_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Insert into blocks
    INSERT INTO public.blocks (blocker_id, blocked_id)
    VALUES (p_blocker_id, p_blocked_id)
    ON CONFLICT (blocker_id, blocked_id) DO NOTHING;

    -- Delete connections between the two users
    DELETE FROM public.connections
    WHERE (user_a = p_blocker_id AND user_b = p_blocked_id)
       OR (user_a = p_blocked_id AND user_b = p_blocker_id);

    -- Delete pending connection requests between the two users
    DELETE FROM public.connection_requests
    WHERE (requester_id = p_blocker_id AND recipient_id = p_blocked_id)
       OR (requester_id = p_blocked_id AND recipient_id = p_blocker_id);
END;
$$;

-- 4. Transaction for submitting a review and awarding reputation
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

        -- Update the materialized reputation on the profile
        -- Note: in a high-scale environment this would be done via triggers or batch jobs
        UPDATE public.profiles
        SET reputation = reputation + p_points_awarded
        WHERE id = p_reviewee_id;
    END IF;

    RETURN v_review_id;
END;
$$;
