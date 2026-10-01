-- ============================================================
-- Migration 028: Quiz Attempt Schema for AI Quiz Engine
-- ============================================================

-- Add new columns to quiz_attempts if they do not exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quiz_attempts' AND column_name = 'skill_id') THEN
    ALTER TABLE quiz_attempts ADD COLUMN skill_id uuid REFERENCES skills(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quiz_attempts' AND column_name = 'quiz_session_id') THEN
    ALTER TABLE quiz_attempts ADD COLUMN quiz_session_id text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quiz_attempts' AND column_name = 'topic') THEN
    ALTER TABLE quiz_attempts ADD COLUMN topic text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quiz_attempts' AND column_name = 'difficulty') THEN
    ALTER TABLE quiz_attempts ADD COLUMN difficulty text CHECK (difficulty IN ('easy', 'medium', 'hard'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quiz_attempts' AND column_name = 'correct_count') THEN
    ALTER TABLE quiz_attempts ADD COLUMN correct_count integer DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quiz_attempts' AND column_name = 'total_count') THEN
    ALTER TABLE quiz_attempts ADD COLUMN total_count integer DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quiz_attempts' AND column_name = 'violation_count') THEN
    ALTER TABLE quiz_attempts ADD COLUMN violation_count integer DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quiz_attempts' AND column_name = 'bloom_breakdown') THEN
    ALTER TABLE quiz_attempts ADD COLUMN bloom_breakdown jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quiz_attempts' AND column_name = 'elapsed_seconds') THEN
    ALTER TABLE quiz_attempts ADD COLUMN elapsed_seconds integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quiz_attempts' AND column_name = 'answers_submitted') THEN
    ALTER TABLE quiz_attempts ADD COLUMN answers_submitted integer DEFAULT 0;
  END IF;
END $$;

-- Index for fast history lookups
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_skill 
  ON quiz_attempts(user_id, skill_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_passed
  ON quiz_attempts(user_id, passed, created_at DESC);

-- RLS Policies for quiz_attempts
ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quiz_attempts_select_own" ON quiz_attempts;
CREATE POLICY "quiz_attempts_select_own"
  ON quiz_attempts FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "quiz_attempts_insert_own" ON quiz_attempts;
CREATE POLICY "quiz_attempts_insert_own"
  ON quiz_attempts FOR INSERT
  WITH CHECK (auth.uid() = user_id);
