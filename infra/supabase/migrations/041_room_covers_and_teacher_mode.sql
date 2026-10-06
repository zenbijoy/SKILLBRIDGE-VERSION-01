-- =============================================================================
-- Migration 041: Room Covers, Teacher Mode & Classroom Sessions
-- =============================================================================

-- 1. Extend Rooms table with cover image & teacher mode
ALTER TABLE public.rooms 
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT,
  ADD COLUMN IF NOT EXISTS is_teacher_mode BOOLEAN DEFAULT false;

-- 2. Extend Sessions table with title & description
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT;

-- 3. Ensure teaching_requests indexes and permissions
CREATE INDEX IF NOT EXISTS idx_teaching_requests_room ON public.teaching_requests(room_id, status);
CREATE INDEX IF NOT EXISTS idx_teaching_requests_volunteer ON public.teaching_requests(volunteer_id);

-- 4. Fast search index on rooms for teacher mode
CREATE INDEX IF NOT EXISTS idx_rooms_teacher_mode ON public.rooms(is_teacher_mode) WHERE is_teacher_mode = true;
