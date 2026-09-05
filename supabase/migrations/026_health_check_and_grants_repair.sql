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

-- Public catalog tables (Readable by anyone, writes restricted by RLS)
GRANT SELECT ON TABLE public.skills TO anon, authenticated;
GRANT SELECT ON TABLE public.profiles TO anon, authenticated;
GRANT SELECT ON TABLE public.rooms TO anon, authenticated;
GRANT SELECT ON TABLE public.reviews TO anon, authenticated;
GRANT SELECT ON TABLE public.clubs TO anon, authenticated;
GRANT SELECT ON TABLE public.club_members TO anon, authenticated;
GRANT SELECT ON TABLE public.events TO anon, authenticated;
GRANT SELECT ON TABLE public.achievements TO anon, authenticated;
GRANT SELECT ON TABLE public.user_achievements TO anon, authenticated;
GRANT SELECT ON TABLE public.quizzes TO anon, authenticated;
GRANT SELECT ON TABLE public.dashboard_widget_configs TO anon, authenticated;
GRANT SELECT ON TABLE public.guided_tour_steps TO anon, authenticated;
GRANT SELECT ON TABLE public.experience_content TO anon, authenticated;
GRANT SELECT ON TABLE public.learning_challenges TO anon, authenticated;

-- Authenticated Member Tables (Governed by user_id = auth.uid() RLS policies)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_skills TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.room_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.conversation_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.connection_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.connections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.blocks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.session_participants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.teaching_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.event_applications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.resources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.saved_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.points_ledger TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.quiz_attempts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.device_tokens TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.dashboard_user_layouts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_guided_tour_progress TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.experience_interactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.learning_goals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.learning_milestones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.session_bookings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_challenge_claims TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.call_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.call_signaling_messages TO authenticated;

-- Reports (Users can insert their own reports and read their own reports)
GRANT SELECT, INSERT ON TABLE public.reports TO authenticated;

-- 5. Explicitly Re-verify RLS Is Enabled on Critical Tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_user_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experience_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_sessions ENABLE ROW LEVEL SECURITY;
