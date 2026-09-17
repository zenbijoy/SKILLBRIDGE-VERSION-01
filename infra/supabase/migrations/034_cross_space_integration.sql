-- =============================================================================
-- Migration 034: SkillBridge Cross-Space Integration Architecture (Prompt 6)
-- Clubs + Ask Help + Research + Canonical Content Routing + Space Links
-- =============================================================================

-- 1. Space Linkage to Room OS
-- Clubs link to Room OS collaboration workspace
ALTER TABLE clubs 
  ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recruitment_status TEXT DEFAULT 'open' CHECK (recruitment_status IN ('open', 'closed', 'invite_only'));

-- Research projects link to private Room OS research workspace
ALTER TABLE research_projects 
  ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES rooms(id) ON DELETE SET NULL;

-- Events provenance (source space / creator entity)
ALTER TABLE events 
  ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'campus' CHECK (source_type IN ('campus', 'club', 'room', 'research')),
  ADD COLUMN IF NOT EXISTS source_id UUID;

-- 2. Ask Help Canonical Academic Metadata on room_questions
ALTER TABLE room_questions 
  ADD COLUMN IF NOT EXISTS subject TEXT,
  ADD COLUMN IF NOT EXISTS topic TEXT,
  ADD COLUMN IF NOT EXISTS urgency TEXT DEFAULT 'normal' CHECK (urgency IN ('normal', 'today', 'exam_soon')),
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS is_campus_wide BOOLEAN DEFAULT false;

-- 3. Cross-Space Content Shares Reference Model
CREATE TABLE IF NOT EXISTS space_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_entity_type TEXT NOT NULL CHECK (source_entity_type IN ('post', 'announcement', 'question', 'event', 'resource', 'research')),
  source_entity_id UUID NOT NULL,
  destination_type TEXT NOT NULL CHECK (destination_type IN ('campus_feed', 'room', 'chat')),
  destination_id UUID,
  shared_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Safe Indexes for Cross-Space Queries
CREATE INDEX IF NOT EXISTS idx_clubs_room_id ON clubs(room_id);
CREATE INDEX IF NOT EXISTS idx_research_projects_room_id ON research_projects(room_id);
CREATE INDEX IF NOT EXISTS idx_events_source ON events(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_room_questions_urgency ON room_questions(urgency, is_resolved, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_room_questions_subject ON room_questions(subject, is_resolved);
CREATE INDEX IF NOT EXISTS idx_space_shares_source ON space_shares(source_entity_type, source_entity_id);
CREATE INDEX IF NOT EXISTS idx_space_shares_dest ON space_shares(destination_type, destination_id);
CREATE INDEX IF NOT EXISTS idx_space_shares_user ON space_shares(shared_by, created_at DESC);

-- 5. Row-Level Security on space_shares
ALTER TABLE space_shares ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'space_shares' AND policyname = 'space_shares_read_all') THEN
    CREATE POLICY space_shares_read_all ON space_shares FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'space_shares' AND policyname = 'space_shares_insert_auth') THEN
    CREATE POLICY space_shares_insert_auth ON space_shares FOR INSERT WITH CHECK (auth.uid() = shared_by);
  END IF;
END $$;
