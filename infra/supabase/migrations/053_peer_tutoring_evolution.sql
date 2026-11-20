-- Migration 053: Peer Tutoring Evolution
-- Adds booking_id to reviews, custom proposals to session_bookings, and atomic booking review RPC

-- 1. Extend reviews table with booking_id and make session_id nullable if it was required
DO $$ BEGIN
  ALTER TABLE IF EXISTS public.reviews ALTER COLUMN session_id DROP NOT NULL;
EXCEPTION
  WHEN undefined_column THEN NULL;
END $$;

ALTER TABLE IF EXISTS public.reviews
  ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.session_bookings(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_reviews_booking_id ON public.reviews(booking_id);

-- 2. Extend session_bookings with custom proposal support
ALTER TABLE IF EXISTS public.session_bookings
  ADD COLUMN IF NOT EXISTS is_custom_proposal boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_session_bookings_room_id ON public.session_bookings(room_id);

-- 3. Create Atomic Booking Review RPC Function
CREATE OR REPLACE FUNCTION public.submit_booking_review_atomic(
  p_booking_id uuid,
  p_reviewer_id uuid,
  p_rating integer,
  p_comment text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking record;
  v_review_id uuid;
  v_rep_bonus integer := 0;
BEGIN
  -- Verify booking exists
  SELECT * INTO v_booking
  FROM public.session_bookings
  WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;

  -- Only learner can review the tutor
  IF v_booking.learner_id <> p_reviewer_id THEN
    RAISE EXCEPTION 'Only the learner can submit a review for this session' USING ERRCODE = '42501';
  END IF;

  -- Booking must be completed
  IF v_booking.status <> 'completed' THEN
    RAISE EXCEPTION 'Can only review completed sessions' USING ERRCODE = '22000';
  END IF;

  -- Rating range validation
  IF p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5' USING ERRCODE = '22000';
  END IF;

  -- Check if already reviewed
  IF EXISTS (SELECT 1 FROM public.reviews WHERE booking_id = p_booking_id AND reviewer_id = p_reviewer_id) THEN
    RAISE EXCEPTION 'You have already reviewed this session' USING ERRCODE = '23505';
  END IF;

  -- Insert review
  INSERT INTO public.reviews (
    booking_id,
    reviewer_id,
    reviewee_id,
    rating,
    comment,
    created_at
  )
  VALUES (
    p_booking_id,
    p_reviewer_id,
    v_booking.tutor_id,
    p_rating,
    p_comment,
    now()
  )
  RETURNING id INTO v_review_id;

  -- Reputation bonus for tutor on quality ratings
  IF p_rating >= 4 THEN
    v_rep_bonus := CASE WHEN p_rating = 5 THEN 10 ELSE 5 END;
    INSERT INTO public.points_ledger (user_id, points, action, reference_id, created_at)
    VALUES (
      v_booking.tutor_id,
      v_rep_bonus,
      'tutor_rating_bonus:' || p_booking_id::text,
      p_booking_id,
      now()
    )
    ON CONFLICT (action) DO NOTHING;

    -- Update tutor reputation score
    UPDATE public.profiles
    SET reputation_score = (SELECT coalesce(sum(points), 0) FROM public.points_ledger WHERE user_id = v_booking.tutor_id)
    WHERE id = v_booking.tutor_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'review_id', v_review_id,
    'rating', p_rating,
    'bonus_points', v_rep_bonus
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_booking_review_atomic(uuid, uuid, integer, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_booking_review_atomic(uuid, uuid, integer, text) TO authenticated, service_role;
