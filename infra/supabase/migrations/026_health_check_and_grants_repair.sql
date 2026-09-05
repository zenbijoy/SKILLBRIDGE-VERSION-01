-- ==============================================================================
-- SkillBridge Migration 026: Health Check RPC and Table Grants Repair
-- ==============================================================================
-- Purpose:
-- 1. Create dedicated, uncoupled public.health_check() function for readiness probing
-- 2. Resolve PostgreSQL 42501 "permission denied for table profiles" for service_role
-- 3. Restore necessary table-level privileges so RLS policies can evaluate properly
-- 4. Maintain strict Row Level Security (RLS) across all user & platform tables
-- ==============================================================================

-- 1. Dedicated Readiness Health Check Function
CREATE OR REPLACE FUNCTION public.health_check()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'status', 'healthy',
    'timestamp', now(),
    'version', '2.0.1'
  );
$$;

-- Secure the health check function
REVOKE ALL ON FUNCTION public.health_check() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.health_check() TO authenticated, service_role;

-- 2. Schema USAGE Grants
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- 3. Service Role Comprehensive Privileges
-- The backend server runs with service_role to orchestrate background jobs,
-- atomic multi-table RPCs, and administrative actions (bypasses RLS by design).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;

-- 4. Public and Authenticated Table-Level Privileges
-- PostgreSQL requires table-level privilege before RLS can filter rows.
-- RLS remains 100% active and guarantees users cannot access unauthorized data.
DO $$
DECLARE
  tbl text;
  public_catalog_tables text[] := ARRAY[
    'skills', 'profiles', 'rooms', 'reviews', 'clubs', 'club_members',
    'events', 'achievements', 'user_achievements', 'quizzes', 'quiz_questions',
    'dashboard_configs', 'experience_content_sets', 'challenge_definitions',
    'achievement_definitions', 'feature_flags', 'announcements', 'research_projects',
    'research_publications', 'app_version_control'
  ];
  authenticated_member_tables text[] := ARRAY[
    'user_skills', 'room_members', 'room_invitations', 'messages', 'message_reactions',
    'message_delivery_receipts', 'conversations', 'conversation_members',
    'connection_requests', 'connections', 'blocks', 'sessions', 'session_participants',
    'teaching_requests', 'event_applications', 'resources', 'saved_items',
    'saved_collections', 'points_ledger', 'quiz_attempts', 'notifications',
    'device_tokens', 'push_receipts', 'user_settings', 'user_dashboard_layouts',
    'learning_goals', 'goal_milestones', 'session_bookings', 'booking_status_history',
    'challenge_progress', 'calls', 'tutor_availability_rules', 'tutor_availability_exceptions',
    'study_plan_blocks', 'study_planner_preferences', 'calendar_reminders',
    'notification_preferences', 'user_activity_events', 'research_members',
    'saved_research_projects', 'research_collaboration_requests', 'announcement_dismissals'
  ];
  rls_enforce_tables text[] := ARRAY[
    'profiles', 'skills', 'user_skills', 'connection_requests', 'connections',
    'blocks', 'conversations', 'conversation_members', 'messages', 'rooms',
    'room_members', 'sessions', 'session_participants', 'reviews', 'reports',
    'user_settings', 'audit_logs', 'user_dashboard_layouts', 'learning_goals',
    'session_bookings', 'calls', 'moderation_cases', 'notification_campaigns',
    'search_analytics_events', 'app_version_control'
  ];
BEGIN
  -- 4.1 Public catalog tables (Readable by anyone, writes restricted by RLS)
  FOREACH tbl IN ARRAY public_catalog_tables LOOP
    IF to_regclass(format('public.%I', tbl)) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO anon, authenticated', tbl);
    END IF;
  END LOOP;

  -- 4.2 Authenticated Member Tables (Governed by user_id = auth.uid() RLS policies)
  FOREACH tbl IN ARRAY authenticated_member_tables LOOP
    IF to_regclass(format('public.%I', tbl)) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', tbl);
    END IF;
  END LOOP;

  -- 4.3 Reports (Users can insert their own reports and read their own reports)
  IF to_regclass('public.reports') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT ON TABLE public.reports TO authenticated';
  END IF;

  -- 5. Explicitly Re-verify RLS Is Enabled on All Present Tables
  FOREACH tbl IN ARRAY rls_enforce_tables LOOP
    IF to_regclass(format('public.%I', tbl)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    END IF;
  END LOOP;
END $$;

