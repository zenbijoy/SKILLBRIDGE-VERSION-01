-- Migration 016: Dynamic Dashboard, Progressive Onboarding, Guided Tour, and Product Experience Expansion
-- Sets up schema for server-driven widgets, user layout preferences, announcements, feature flags, and tour lifecycle.

-- 1. Extend profiles with onboarding, tour, and quiet hours fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS onboarding_status text DEFAULT 'not_started' CHECK (onboarding_status IN ('not_started', 'in_progress', 'completed', 'skipped')),
  ADD COLUMN IF NOT EXISTS onboarding_step text DEFAULT 'language',
  ADD COLUMN IF NOT EXISTS profile_completion_percent integer DEFAULT 0 CHECK (profile_completion_percent BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS profile_missing_fields text[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS guided_tour_version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS guided_tour_status text DEFAULT 'pending' CHECK (guided_tour_status IN ('pending', 'in_progress', 'completed', 'skipped')),
  ADD COLUMN IF NOT EXISTS guided_tour_last_step text DEFAULT 'start',
  ADD COLUMN IF NOT EXISTS preferred_locale text DEFAULT 'en' CHECK (preferred_locale IN ('en', 'bn')),
  ADD COLUMN IF NOT EXISTS quiet_hours_start text DEFAULT '22:00',
  ADD COLUMN IF NOT EXISTS quiet_hours_end text DEFAULT '07:00';

-- 2. Create dashboard_configs table (Admin-configurable server-driven widgets)
CREATE TABLE IF NOT EXISTS public.dashboard_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  widget_key text NOT NULL UNIQUE,
  title_en text NOT NULL,
  title_bn text NOT NULL,
  default_order integer NOT NULL DEFAULT 0,
  is_required boolean DEFAULT false,
  is_enabled boolean DEFAULT true,
  target_roles text[] DEFAULT ARRAY['student', 'tutor', 'moderator', 'admin'],
  target_campus text,
  min_app_version text DEFAULT '2.0.0',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Seed default standard widgets if not present
INSERT INTO public.dashboard_configs (widget_key, title_en, title_bn, default_order, is_required, is_enabled)
VALUES
  ('announcements', 'Announcements', 'ঘোষণা', 1, true, true),
  ('greeting_hero', 'Greeting & Hero', 'শুভেচ্ছা ও হিরো', 2, true, true),
  ('profile_quest', 'Profile Completion Quest', 'প্রোফাইল সম্পূর্ণ করার মিশন', 3, false, true),
  ('momentum_stats', 'Learning Momentum', 'শেখার অগ্রগতি', 4, false, true),
  ('quick_actions', 'Quick Actions', 'দ্রুত অ্যাকশন', 5, false, true),
  ('live_and_upcoming', 'Live & Upcoming Sessions', 'লাইভ ও আসন্ন সেশন', 6, false, true),
  ('urgent_rooms', 'Urgent Study Rooms', 'জরুরি স্টাডি রুম', 7, false, true),
  ('recommended_peers', 'Recommended Peers', 'প্রস্তাবিত সহপাঠী', 8, false, true),
  ('campus_events', 'Campus Events', 'ক্যাম্পাস ইভেন্ট', 9, false, true),
  ('research_opportunities', 'Research Projects', 'গবেষণা প্রকল্প', 10, false, true),
  ('leaderboard_preview', 'Leaderboard Podium', 'লিডারবোর্ড পডিয়াম', 11, false, true)
ON CONFLICT (widget_key) DO NOTHING;

-- 3. Create user_dashboard_layouts table (User personalized layout preferences)
CREATE TABLE IF NOT EXISTS public.user_dashboard_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  density text DEFAULT 'comfortable' CHECK (density IN ('compact', 'comfortable', 'spacious')),
  preset text DEFAULT 'balanced' CHECK (preset IN ('learner', 'tutor', 'researcher', 'community', 'balanced', 'custom')),
  widgets jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT user_dashboard_layouts_user_id_key UNIQUE (user_id)
);

-- 4. Create announcements table (Platform service broadcasts)
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_en text NOT NULL,
  title_bn text NOT NULL,
  body_en text NOT NULL,
  body_bn text NOT NULL,
  tone text DEFAULT 'info' CHECK (tone IN ('info', 'warning', 'success', 'accent')),
  action_url text,
  action_label_en text,
  action_label_bn text,
  is_active boolean DEFAULT true,
  starts_at timestamptz DEFAULT now(),
  ends_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 5. Create feature_flags table (Staged rollouts and kill switches)
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  description text,
  is_enabled boolean DEFAULT true,
  rollout_percentage integer DEFAULT 100 CHECK (rollout_percentage BETWEEN 0 AND 100),
  target_roles text[] DEFAULT ARRAY['student', 'tutor', 'moderator', 'admin'],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 6. Enable RLS on newly created tables
ALTER TABLE public.dashboard_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_dashboard_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- 7. Define RLS Policies
DROP POLICY IF EXISTS "Anyone can read dashboard configs" ON public.dashboard_configs;
CREATE POLICY "Anyone can read dashboard configs"
  ON public.dashboard_configs FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can read own layout" ON public.user_dashboard_layouts;
CREATE POLICY "Users can read own layout"
  ON public.user_dashboard_layouts FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own layout" ON public.user_dashboard_layouts;
CREATE POLICY "Users can update own layout"
  ON public.user_dashboard_layouts FOR ALL
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Anyone can read active announcements" ON public.announcements;
CREATE POLICY "Anyone can read active announcements"
  ON public.announcements FOR SELECT
  USING (is_active = true AND (ends_at IS NULL OR ends_at > now()));

DROP POLICY IF EXISTS "Anyone can read feature flags" ON public.feature_flags;
CREATE POLICY "Anyone can read feature flags"
  ON public.feature_flags FOR SELECT
  USING (true);

-- 8. Atomic Stored Procedures

-- Save/Upsert user dashboard layout
CREATE OR REPLACE FUNCTION public.save_user_dashboard_layout_atomic(
  p_user_id uuid,
  p_preset text,
  p_density text,
  p_widgets jsonb
) RETURNS jsonb AS $$
DECLARE
  v_result jsonb;
BEGIN
  INSERT INTO public.user_dashboard_layouts (user_id, preset, density, widgets, updated_at)
  VALUES (p_user_id, p_preset, p_density, p_widgets, now())
  ON CONFLICT (user_id) DO UPDATE SET
    preset = EXCLUDED.preset,
    density = EXCLUDED.density,
    widgets = EXCLUDED.widgets,
    updated_at = now();

  SELECT jsonb_build_object(
    'user_id', user_id,
    'preset', preset,
    'density', density,
    'widgets', widgets,
    'updated_at', updated_at
  ) INTO v_result
  FROM public.user_dashboard_layouts
  WHERE user_id = p_user_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Complete guided tour step & idempotent completion reward
CREATE OR REPLACE FUNCTION public.complete_guided_tour_step_atomic(
  p_user_id uuid,
  p_step text,
  p_is_last boolean
) RETURNS jsonb AS $$
DECLARE
  v_status text;
  v_reward jsonb;
BEGIN
  IF p_is_last THEN
    v_status := 'completed';
    -- Award +5 reputation for completing product tour exactly once
    v_reward := public.award_reputation_atomic(p_user_id, 'tour_completed', 5, 'tour', p_user_id);
  ELSE
    v_status := 'in_progress';
  END IF;

  UPDATE public.profiles
  SET
    guided_tour_last_step = p_step,
    guided_tour_status = v_status,
    updated_at = now()
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'step', p_step,
    'status', v_status,
    'reward', v_reward
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Revoke execute from public/anon/authenticated and grant to service_role
REVOKE ALL ON FUNCTION public.save_user_dashboard_layout_atomic(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_user_dashboard_layout_atomic(uuid, text, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.complete_guided_tour_step_atomic(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_guided_tour_step_atomic(uuid, text, boolean) TO service_role;
