-- 010_critical_security_consistency.sql

ALTER TABLE public.rooms
ADD COLUMN IF NOT EXISTS rules text NOT NULL DEFAULT '';

REVOKE UPDATE ON TABLE public.profiles FROM authenticated;

GRANT UPDATE (
  full_name,
  username,
  avatar_url,
  bio,
  university,
  department,
  batch,
  research_interests,
  profile_visibility,
  updated_at
) ON TABLE public.profiles TO authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS livekit_attendance_one_open_segment
ON public.livekit_attendance(session_id,user_id)
WHERE left_at IS NULL;

CREATE OR REPLACE FUNCTION public.record_livekit_join(
  p_session_id uuid,
  p_user_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
  INSERT INTO public.livekit_attendance(session_id,user_id,joined_at)
  SELECT p_session_id,p_user_id,now()
  WHERE NOT EXISTS(
    SELECT 1 FROM public.livekit_attendance
    WHERE session_id=p_session_id
      AND user_id=p_user_id
      AND left_at IS NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_livekit_leave(
  p_session_id uuid,
  p_user_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_id uuid;
  v_joined timestamptz;
BEGIN
  SELECT id,joined_at INTO v_id,v_joined
  FROM public.livekit_attendance
  WHERE session_id=p_session_id
    AND user_id=p_user_id
    AND left_at IS NULL
  ORDER BY joined_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_id IS NULL THEN RETURN; END IF;

  UPDATE public.livekit_attendance
  SET left_at=now(),
      duration_seconds=GREATEST(
        0,
        FLOOR(EXTRACT(EPOCH FROM(now()-v_joined)))::int
      )
  WHERE id=v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_livekit_join(uuid,uuid)
FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_livekit_leave(uuid,uuid)
FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.record_livekit_join(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_livekit_leave(uuid,uuid) TO service_role;

CREATE TABLE IF NOT EXISTS public.message_delivery_receipts (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(message_id,user_id)
);

ALTER TABLE public.message_delivery_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS message_delivery_receipts_self_read
ON public.message_delivery_receipts;

CREATE POLICY message_delivery_receipts_self_read
ON public.message_delivery_receipts
FOR SELECT
USING(user_id=auth.uid());

REVOKE INSERT,UPDATE,DELETE
ON TABLE public.message_delivery_receipts
FROM anon,authenticated;

-- RBAC Tables
CREATE TABLE IF NOT EXISTS public.admin_roles (
    id text PRIMARY KEY,
    description text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_permissions (
    id text PRIMARY KEY,
    description text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_role_permissions (
    role_id text NOT NULL REFERENCES public.admin_roles(id) ON DELETE CASCADE,
    permission_id text NOT NULL REFERENCES public.admin_permissions(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS public.admin_assignments (
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role_id text NOT NULL REFERENCES public.admin_roles(id) ON DELETE CASCADE,
    assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(user_id, role_id)
);

-- Basic Seed for RBAC
INSERT INTO public.admin_roles (id, description) VALUES
('SUPER_ADMIN', 'Super Administrator'),
('PLATFORM_ADMIN', 'Platform Administrator'),
('SECURITY_ADMIN', 'Security Administrator'),
('SUPPORT_MANAGER', 'Support Manager'),
('SUPPORT_AGENT', 'Support Agent'),
('MODERATION_MANAGER', 'Moderation Manager'),
('MODERATOR', 'Moderator'),
('CONTENT_MANAGER', 'Content Manager'),
('INSTITUTION_MANAGER', 'Institution Manager'),
('DATABASE_OPERATOR', 'Database Operator'),
('API_OPERATOR', 'API Operator'),
('ANALYST', 'Analyst'),
('AUDITOR', 'Auditor'),
('READ_ONLY_ADMIN', 'Read-Only Admin')
ON CONFLICT (id) DO NOTHING;

-- RLS for RBAC Tables
ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_roles_read ON public.admin_roles FOR SELECT USING (true);
CREATE POLICY admin_permissions_read ON public.admin_permissions FOR SELECT USING (true);
CREATE POLICY admin_role_permissions_read ON public.admin_role_permissions FOR SELECT USING (true);
CREATE POLICY admin_assignments_read ON public.admin_assignments FOR SELECT USING (true);

REVOKE ALL ON TABLE public.admin_roles FROM anon,authenticated;
REVOKE ALL ON TABLE public.admin_permissions FROM anon,authenticated;
REVOKE ALL ON TABLE public.admin_role_permissions FROM anon,authenticated;
REVOKE ALL ON TABLE public.admin_assignments FROM anon,authenticated;
GRANT SELECT ON TABLE public.admin_roles TO authenticated;
GRANT SELECT ON TABLE public.admin_permissions TO authenticated;
GRANT SELECT ON TABLE public.admin_role_permissions TO authenticated;
GRANT SELECT ON TABLE public.admin_assignments TO authenticated;
