-- Migration 015: Complete Domain Hardening & Transactional Guarantees
-- 1. Room Invitations Table with Strict Lifecycle and Uniqueness
-- 2. Corrected join_room_service_atomic (inserts 'member', calculates true capacity, consumes invites)
-- 3. Transactional Admin Mutations (mutate status + audit log in single transaction)
-- 4. Transactional Report Decisions
-- 5. Idempotent Reputation Rewards (points_ledger as single source of truth)
-- 6. Strict Security Definer Permissions (Revoke Public/Anon, Grant Service Role)

-- 1. Create Room Invitations Table
CREATE TABLE IF NOT EXISTS public.room_invitations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    inviter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    invitee_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    token_hash text,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'revoked', 'expired', 'consumed')),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    accepted_at timestamptz,
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT chk_invitation_target CHECK (invitee_id IS NOT NULL OR token_hash IS NOT NULL),
    CONSTRAINT chk_no_self_invite CHECK (inviter_id != invitee_id)
);

CREATE INDEX IF NOT EXISTS idx_room_invitations_room_id ON public.room_invitations(room_id);
CREATE INDEX IF NOT EXISTS idx_room_invitations_invitee ON public.room_invitations(invitee_id) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_room_invitee ON public.room_invitations(room_id, invitee_id) WHERE status = 'pending';

ALTER TABLE public.room_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS room_invitations_select ON public.room_invitations;
CREATE POLICY room_invitations_select ON public.room_invitations FOR SELECT USING (
    auth.uid() = inviter_id OR auth.uid() = invitee_id OR
    EXISTS (SELECT 1 FROM public.room_members WHERE room_id = room_invitations.room_id AND user_id = auth.uid() AND role IN ('owner', 'moderator'))
);

DROP POLICY IF EXISTS room_invitations_insert ON public.room_invitations;
CREATE POLICY room_invitations_insert ON public.room_invitations FOR INSERT WITH CHECK (
    auth.uid() = inviter_id AND
    EXISTS (SELECT 1 FROM public.room_members WHERE room_id = room_invitations.room_id AND user_id = auth.uid() AND role IN ('owner', 'moderator'))
);

DROP POLICY IF EXISTS room_invitations_update ON public.room_invitations;
CREATE POLICY room_invitations_update ON public.room_invitations FOR UPDATE USING (
    auth.uid() = invitee_id OR auth.uid() = inviter_id OR
    EXISTS (SELECT 1 FROM public.room_members WHERE room_id = room_invitations.room_id AND user_id = auth.uid() AND role IN ('owner', 'moderator'))
);

-- 2. Hardened Atomic Room Join with Service Role
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
    v_actual_count integer;
    v_existing boolean;
    v_invite_id uuid;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'User ID required';
    END IF;

    -- Lock room row for update to eliminate race condition
    SELECT * INTO r FROM public.rooms WHERE id = p_room_id FOR UPDATE;
    IF NOT FOUND THEN 
        RAISE EXCEPTION 'Room not found'; 
    END IF;
    
    IF r.status NOT IN ('open','scheduled','live') THEN 
        RAISE EXCEPTION 'Room is not active'; 
    END IF;
    
    SELECT EXISTS(SELECT 1 FROM public.room_members WHERE room_id = p_room_id AND user_id = p_user_id) INTO v_existing;
    IF v_existing THEN 
        RETURN jsonb_build_object('already_member', true, 'member_count', r.member_count); 
    END IF;
    
    -- Transactional authoritative capacity count
    SELECT COUNT(*) INTO v_actual_count FROM public.room_members WHERE room_id = p_room_id;
    IF v_actual_count >= r.capacity THEN 
        RAISE EXCEPTION 'Room is at maximum capacity'; 
    END IF;
    
    IF r.visibility = 'private' THEN
        RAISE EXCEPTION 'This room is private';
    END IF;

    IF r.visibility = 'invite_only' THEN
        SELECT id INTO v_invite_id FROM public.room_invitations 
        WHERE room_id = p_room_id 
          AND invitee_id = p_user_id 
          AND status IN ('pending', 'accepted')
          AND expires_at > now()
        ORDER BY created_at DESC LIMIT 1;
        
        IF v_invite_id IS NULL THEN
            RAISE EXCEPTION 'This room requires an invitation to join';
        END IF;
        
        -- Consume the invitation
        UPDATE public.room_invitations 
        SET status = 'consumed', accepted_at = now(), updated_at = now() 
        WHERE id = v_invite_id;
    END IF;
    
    -- Insert role as 'member' (valid enum value)
    INSERT INTO public.room_members(room_id, user_id, role) 
    VALUES (p_room_id, p_user_id, 'member');

    IF r.conversation_id IS NOT NULL THEN
        INSERT INTO public.conversation_members(conversation_id, user_id, role)
        VALUES (r.conversation_id, p_user_id, 'member')
        ON CONFLICT (conversation_id, user_id) DO NOTHING;
    END IF;
    
    v_actual_count := v_actual_count + 1;
    UPDATE public.rooms SET member_count = v_actual_count, updated_at = now() WHERE id = p_room_id;
    RETURN jsonb_build_object('joined', true, 'member_count', v_actual_count);
END;
$$;

-- 3. Hardened Atomic Room Leave with Service Role
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
    v_actual_count integer;
BEGIN
    SELECT * INTO r FROM public.rooms WHERE id = p_room_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
    IF r.owner_id = p_user_id THEN 
        RAISE EXCEPTION 'Room owner cannot leave without transferring ownership'; 
    END IF;

    DELETE FROM public.room_members WHERE room_id = p_room_id AND user_id = p_user_id;

    IF r.conversation_id IS NOT NULL THEN
        DELETE FROM public.conversation_members WHERE conversation_id = r.conversation_id AND user_id = p_user_id;
    END IF;

    SELECT COUNT(*) INTO v_actual_count FROM public.room_members WHERE room_id = p_room_id;
    UPDATE public.rooms SET member_count = v_actual_count, updated_at = now() WHERE id = p_room_id;
    RETURN jsonb_build_object('left', true, 'member_count', v_actual_count);
END;
$$;

-- 4. Transactional Admin User Status Mutation
CREATE OR REPLACE FUNCTION public.admin_mutate_user_status_atomic(
    p_admin_id uuid,
    p_target_id uuid,
    p_new_status text,
    p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin public.profiles;
    v_target public.profiles;
BEGIN
    SELECT * INTO v_admin FROM public.profiles WHERE id = p_admin_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Admin profile not found'; END IF;
    IF NOT ('admin' = ANY(v_admin.roles) OR 'moderator' = ANY(v_admin.roles)) THEN
        RAISE EXCEPTION 'Unauthorized: elevated role required';
    END IF;

    SELECT * INTO v_target FROM public.profiles WHERE id = p_target_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Target user not found'; END IF;

    IF 'admin' = ANY(v_target.roles) AND NOT ('admin' = ANY(v_admin.roles)) THEN
        RAISE EXCEPTION 'Moderators cannot modify administrator accounts';
    END IF;

    IF p_admin_id = p_target_id AND p_new_status != 'active' THEN
        RAISE EXCEPTION 'Cannot suspend or ban your own administrator account';
    END IF;

    UPDATE public.profiles 
    SET account_status = p_new_status, updated_at = now() 
    WHERE id = p_target_id;

    INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
    VALUES (
        p_admin_id,
        'moderation.user.status',
        'user',
        p_target_id,
        jsonb_build_object('status', p_new_status, 'previous_status', v_target.account_status, 'reason', p_reason)
    );

    RETURN jsonb_build_object('success', true, 'user_id', p_target_id, 'status', p_new_status);
END;
$$;

-- 5. Transactional Admin Report Decision
CREATE OR REPLACE FUNCTION public.admin_decide_report_atomic(
    p_admin_id uuid,
    p_report_id uuid,
    p_status text,
    p_action text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin public.profiles;
    v_report public.reports;
    v_action text;
BEGIN
    SELECT * INTO v_admin FROM public.profiles WHERE id = p_admin_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Admin profile not found'; END IF;
    IF NOT ('admin' = ANY(v_admin.roles) OR 'moderator' = ANY(v_admin.roles)) THEN
        RAISE EXCEPTION 'Unauthorized: elevated role required';
    END IF;

    SELECT * INTO v_report FROM public.reports WHERE id = p_report_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;

    v_action := COALESCE(p_action, 'Report marked ' || p_status);

    UPDATE public.reports
    SET status = p_status,
        action = v_action,
        reviewed_by = p_admin_id,
        reviewed_at = now()
    WHERE id = p_report_id;

    INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
    VALUES (
        p_admin_id,
        'moderation.report.update',
        'report',
        p_report_id,
        jsonb_build_object('status', p_status, 'action', v_action)
    );

    RETURN jsonb_build_object('success', true, 'report_id', p_report_id, 'status', p_status, 'action', v_action);
END;
$$;

-- 6. Idempotent Atomic Reputation Award
CREATE OR REPLACE FUNCTION public.award_reputation_atomic(
    p_user_id uuid,
    p_event_type text,
    p_points integer,
    p_reference_type text DEFAULT NULL,
    p_reference_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_existing_id uuid;
    v_new_rep integer;
BEGIN
    IF p_reference_type IS NOT NULL AND p_reference_id IS NOT NULL THEN
        SELECT id INTO v_existing_id 
        FROM public.points_ledger 
        WHERE user_id = p_user_id 
          AND event_type = p_event_type 
          AND reference_type = p_reference_type 
          AND reference_id = p_reference_id;
          
        IF v_existing_id IS NOT NULL THEN
            SELECT reputation INTO v_new_rep FROM public.profiles WHERE id = p_user_id;
            RETURN jsonb_build_object('awarded', false, 'reason', 'already_awarded', 'reputation', v_new_rep);
        END IF;
    END IF;

    INSERT INTO public.points_ledger (user_id, event_type, points, reference_type, reference_id)
    VALUES (p_user_id, p_event_type, p_points, p_reference_type, p_reference_id);

    SELECT COALESCE(SUM(points), 0) INTO v_new_rep 
    FROM public.points_ledger 
    WHERE user_id = p_user_id;

    UPDATE public.profiles 
    SET reputation = GREATEST(0, v_new_rep), updated_at = now() 
    WHERE id = p_user_id;

    RETURN jsonb_build_object('awarded', true, 'points', p_points, 'new_reputation', v_new_rep);
END;
$$;

-- 7. Security Hardening: Revoke from Public and Grant to Service Role
REVOKE ALL ON FUNCTION public.join_room_service_atomic(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_room_service_atomic(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.leave_room_service_atomic(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leave_room_service_atomic(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_mutate_user_status_atomic(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mutate_user_status_atomic(uuid, uuid, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_decide_report_atomic(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_decide_report_atomic(uuid, uuid, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.award_reputation_atomic(uuid, text, integer, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_reputation_atomic(uuid, text, integer, text, uuid) TO service_role;
