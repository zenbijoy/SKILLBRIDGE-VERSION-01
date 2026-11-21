-- Migration 055: Add image_url support to room_questions
-- Allows questions to include an optional image attachment stored in R2/Supabase storage

ALTER TABLE public.room_questions
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Also add image support to answers for future use
ALTER TABLE public.room_question_answers
  ADD COLUMN IF NOT EXISTS image_url TEXT;
