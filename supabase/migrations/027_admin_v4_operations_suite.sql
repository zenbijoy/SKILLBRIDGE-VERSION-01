-- ============================================================================
-- Migration 027: Admin V4 Operations Suite
-- Additive, idempotent schema additions for:
-- 1. Trust & Safety structured escalation cases
-- 2. Notification Campaign Center
-- 3. Privacy-preserving Search Analytics
-- ============================================================================

BEGIN;

-- 1. Moderation / Trust & Safety Cases
CREATE TABLE IF NOT EXISTS public.moderation_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES public.reports(id) ON DELETE SET NULL,
  subject_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  subject_content_type text NOT NULL CHECK (subject_content_type IN ('user', 'message', 'room', 'event', 'resource', 'club', 'quiz')),
  subject_content_id text NOT NULL,
  title text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
  status text NOT NULL CHECK (status IN ('open', 'investigating', 'actioned', 'dismissed', 'closed')) DEFAULT 'open',
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  internal_notes jsonb NOT NULL DEFAULT '[]'::jsonb,
  action_taken text,
  action_metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_moderation_cases_status ON public.moderation_cases(status, severity);
CREATE INDEX IF NOT EXISTS idx_moderation_cases_subject ON public.moderation_cases(subject_user_id);
CREATE INDEX IF NOT EXISTS idx_moderation_cases_assigned ON public.moderation_cases(assigned_to);

ALTER TABLE public.moderation_cases ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'moderation_cases' AND policyname = 'moderation_cases_service_role_all'
  ) THEN
    CREATE POLICY moderation_cases_service_role_all ON public.moderation_cases FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;


-- 2. Notification Campaign Center
CREATE TABLE IF NOT EXISTS public.notification_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text NOT NULL,
  action_url text,
  target_role text,
  target_campus text,
  target_skill text,
  channel text NOT NULL CHECK (channel IN ('in_app', 'push', 'all')) DEFAULT 'all',
  status text NOT NULL CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'cancelled')) DEFAULT 'draft',
  scheduled_at timestamptz,
  sent_at timestamptz,
  stats jsonb NOT NULL DEFAULT '{"targeted": 0, "queued": 0, "sent": 0, "failed": 0}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_campaigns_status ON public.notification_campaigns(status, created_at DESC);

ALTER TABLE public.notification_campaigns ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'notification_campaigns' AND policyname = 'notification_campaigns_service_role_all'
  ) THEN
    CREATE POLICY notification_campaigns_service_role_all ON public.notification_campaigns FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;


-- 3. Privacy-Preserving Search Analytics Events
CREATE TABLE IF NOT EXISTS public.search_analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_query_normalized text NOT NULL,
  result_count int NOT NULL DEFAULT 0,
  category text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_analytics_query ON public.search_analytics_events(search_query_normalized);
CREATE INDEX IF NOT EXISTS idx_search_analytics_created ON public.search_analytics_events(created_at DESC);

ALTER TABLE public.search_analytics_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'search_analytics_events' AND policyname = 'search_analytics_service_role_all'
  ) THEN
    CREATE POLICY search_analytics_service_role_all ON public.search_analytics_events FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;


-- 4. App Version and Release Operations Control
CREATE TABLE IF NOT EXISTS public.app_version_control (
  id text PRIMARY KEY DEFAULT 'default',
  min_supported_version text NOT NULL DEFAULT '2.0.0',
  recommended_version text NOT NULL DEFAULT '2.1.0',
  maintenance_mode boolean NOT NULL DEFAULT false,
  maintenance_message text NOT NULL DEFAULT 'SkillBridge is currently undergoing scheduled platform maintenance. Please check back shortly.',
  update_prompt_enabled boolean NOT NULL DEFAULT true,
  update_title text NOT NULL DEFAULT 'New Version Available',
  update_message text NOT NULL DEFAULT 'A new version of SkillBridge is ready with performance upgrades and new collaboration tools.',
  store_url_android text,
  store_url_ios text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

INSERT INTO public.app_version_control (id, min_supported_version, recommended_version)
VALUES ('default', '2.0.0', '2.1.0')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_version_control ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'app_version_control' AND policyname = 'app_version_control_service_role_all'
  ) THEN
    CREATE POLICY app_version_control_service_role_all ON public.app_version_control FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'app_version_control' AND policyname = 'app_version_control_public_read'
  ) THEN
    CREATE POLICY app_version_control_public_read ON public.app_version_control FOR SELECT USING (true);
  END IF;
END $$;

COMMIT;
