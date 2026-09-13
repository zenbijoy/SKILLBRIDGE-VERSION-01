-- =============================================================================
-- Migration 030: Next-Gen Notifications, Moderation Operations & Audit Logs
-- 1. Extend reports.target_type for Next-Gen content (posts, comments, Q&A)
-- 2. Enhance notifications table with operational metadata & priority
-- 3. Create moderation_audit_logs with strict RLS
-- 4. Add performance indexes for unread notifications and audit queries
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. EXTEND REPORTS TARGET TYPE CONSTRAINT
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.reports'::regclass
      AND conname = 'reports_target_type_check'
  ) THEN
    ALTER TABLE public.reports DROP CONSTRAINT reports_target_type_check;
  END IF;

  ALTER TABLE public.reports
    ADD CONSTRAINT reports_target_type_check
    CHECK (target_type IN (
      'user', 'message', 'room', 'event', 'resource',
      'post', 'comment', 'question', 'answer', 'club_announcement'
    ));
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipping reports_target_type_check update: %', SQLERRM;
END $$;

-- -----------------------------------------------------------------------------
-- 2. ENHANCE NOTIFICATIONS TABLE
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'priority'
  ) THEN
    ALTER TABLE public.notifications
      ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal'
      CHECK (priority IN ('low', 'normal', 'high', 'urgent'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'entity_type'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN entity_type TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'entity_id'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN entity_id UUID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN expires_at TIMESTAMPTZ;
  END IF;
END $$;

-- Composite index for fast unread notifications lookup
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, read_at, created_at DESC);

-- -----------------------------------------------------------------------------
-- 3. MODERATION AUDIT LOGS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.moderation_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  reason TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_moderation_audit_created
  ON public.moderation_audit_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_moderation_audit_entity
  ON public.moderation_audit_logs(entity_type, entity_id);

-- -----------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS)
-- -----------------------------------------------------------------------------
ALTER TABLE public.moderation_audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'moderation_audit_read' AND tablename = 'moderation_audit_logs'
  ) THEN
    CREATE POLICY moderation_audit_read ON public.moderation_audit_logs
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND (p.roles @> ARRAY['admin']::text[] OR p.roles @> ARRAY['moderator']::text[])
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'moderation_audit_insert' AND tablename = 'moderation_audit_logs'
  ) THEN
    CREATE POLICY moderation_audit_insert ON public.moderation_audit_logs
      FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND (p.roles @> ARRAY['admin']::text[] OR p.roles @> ARRAY['moderator']::text[])
        )
      );
  END IF;
END $$;
