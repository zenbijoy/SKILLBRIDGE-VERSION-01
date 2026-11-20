-- ── 051_room_assignments_and_submissions.sql ─────────────────────────────
-- Room Assignments & Homework Submissions Platform
-- Enables teachers/hosts to publish assignments with deadlines and points,
-- and students to submit PDFs/scans (stored in Cloudflare R2) and receive grades/feedback.

-- 1. Room Assignments Table
CREATE TABLE IF NOT EXISTS public.room_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  total_points integer NOT NULL DEFAULT 100 CHECK (total_points > 0 AND total_points <= 1000),
  due_date timestamptz NOT NULL,
  attachment_url text,
  attachment_path text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_room_assignments_room_due 
  ON public.room_assignments(room_id, due_date DESC);

-- 2. Room Assignment Submissions Table
CREATE TABLE IF NOT EXISTS public.room_assignment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.room_assignments(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  storage_path text NOT NULL,
  file_name text,
  file_size_bytes integer,
  student_notes text,
  grade numeric(5,2) CHECK (grade >= 0),
  feedback text,
  graded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  graded_at timestamptz,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'graded', 'resubmitted')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_assignment_student UNIQUE (assignment_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_room_submissions_assignment 
  ON public.room_assignment_submissions(assignment_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_room_submissions_student 
  ON public.room_assignment_submissions(student_id);

-- 3. Row Level Security (RLS)
ALTER TABLE public.room_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_assignment_submissions ENABLE ROW LEVEL SECURITY;

-- Assignments RLS Policies:
-- Any room member can view assignments
CREATE POLICY room_assignments_read ON public.room_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.room_members rm 
      WHERE rm.room_id = room_assignments.room_id AND rm.user_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.rooms r 
      WHERE r.id = room_assignments.room_id AND (r.owner_id = auth.uid() OR r.visibility = 'public')
    )
  );

-- Teachers/moderators/owners can insert, update, delete assignments
CREATE POLICY room_assignments_manage ON public.room_assignments
  FOR ALL USING (
    creator_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.room_members rm 
      WHERE rm.room_id = room_assignments.room_id 
        AND rm.user_id = auth.uid() 
        AND rm.role IN ('owner', 'admin', 'teacher', 'moderator')
    ) OR EXISTS (
      SELECT 1 FROM public.rooms r 
      WHERE r.id = room_assignments.room_id AND r.owner_id = auth.uid()
    )
  );

-- Submissions RLS Policies:
-- Students can see their own submission; teachers/owners can see all submissions in the room
CREATE POLICY room_submissions_read ON public.room_assignment_submissions
  FOR SELECT USING (
    student_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.room_members rm 
      WHERE rm.room_id = room_assignment_submissions.room_id 
        AND rm.user_id = auth.uid() 
        AND rm.role IN ('owner', 'admin', 'teacher', 'moderator')
    ) OR EXISTS (
      SELECT 1 FROM public.rooms r 
      WHERE r.id = room_assignment_submissions.room_id AND r.owner_id = auth.uid()
    )
  );

-- Students can insert/update their own submission
CREATE POLICY room_submissions_insert ON public.room_assignment_submissions
  FOR INSERT WITH CHECK (
    student_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.room_members rm 
      WHERE rm.room_id = room_assignment_submissions.room_id AND rm.user_id = auth.uid()
    )
  );

CREATE POLICY room_submissions_update ON public.room_assignment_submissions
  FOR UPDATE USING (
    student_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.room_members rm 
      WHERE rm.room_id = room_assignment_submissions.room_id 
        AND rm.user_id = auth.uid() 
        AND rm.role IN ('owner', 'admin', 'teacher', 'moderator')
    ) OR EXISTS (
      SELECT 1 FROM public.rooms r 
      WHERE r.id = room_assignment_submissions.room_id AND r.owner_id = auth.uid()
    )
  );

-- Permissions Grants
GRANT ALL ON TABLE public.room_assignments TO authenticated;
GRANT ALL ON TABLE public.room_assignment_submissions TO authenticated;
