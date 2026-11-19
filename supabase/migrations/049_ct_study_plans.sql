-- ==============================================================================
-- Migration 049: CT (Class Test) Study Plans, Checklists & AI Roadmaps
-- ==============================================================================

BEGIN;

-- 1. Create dedicated ct_study_plans table
CREATE TABLE IF NOT EXISTS public.ct_study_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject text NOT NULL,
  target_date timestamptz NOT NULL,
  topics jsonb NOT NULL DEFAULT '[]'::jsonb,
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  schedule jsonb NOT NULL DEFAULT '[]'::jsonb,
  cheatsheet jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_tips jsonb NOT NULL DEFAULT '[]'::jsonb,
  mock_quiz jsonb NOT NULL DEFAULT '[]'::jsonb,
  progress_percent integer NOT NULL DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  study_minutes_spent integer NOT NULL DEFAULT 0,
  target_score text DEFAULT 'ace',
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ct_study_plans_user_idx ON public.ct_study_plans(user_id, target_date);

-- Enable RLS
ALTER TABLE public.ct_study_plans ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can read own CT plans" ON public.ct_study_plans;
CREATE POLICY "Users can read own CT plans"
  ON public.ct_study_plans FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own CT plans" ON public.ct_study_plans;
CREATE POLICY "Users can create own CT plans"
  ON public.ct_study_plans FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own CT plans" ON public.ct_study_plans;
CREATE POLICY "Users can update own CT plans"
  ON public.ct_study_plans FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own CT plans" ON public.ct_study_plans;
CREATE POLICY "Users can delete own CT plans"
  ON public.ct_study_plans FOR DELETE
  USING (auth.uid() = user_id);

-- 2. Create user_goals table for compatibility with legacy academic queries
CREATE TABLE IF NOT EXISTS public.user_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'academic',
  status text NOT NULL DEFAULT 'in_progress',
  target_date timestamptz,
  progress_percentage integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_goals_user_category_idx ON public.user_goals(user_id, category, target_date);

ALTER TABLE public.user_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own user_goals" ON public.user_goals;
CREATE POLICY "Users can manage own user_goals"
  ON public.user_goals FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMIT;
