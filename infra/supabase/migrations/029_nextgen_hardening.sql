-- =============================================================================
-- Migration 029: Next-Gen Hardening, Integrity & Security Policies
-- 1. Room Recordings duplicate prevention (room_id, youtube_video_id)
-- 2. Room Q&A accepted answer reference index & foreign key safety
-- 3. Club Clash Negotiations RLS policies (multi-club tenant protection)
-- 4. Next-Gen Feature Flags registration
-- 5. Performance composite indexes & updated_at automation
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. PREVENT DUPLICATE RECORDINGS PER ROOM
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'room_recordings_room_video_unique'
  ) THEN
    ALTER TABLE public.room_recordings
      ADD CONSTRAINT room_recordings_room_video_unique
      UNIQUE (room_id, youtube_video_id);
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. ROOM Q&A ACCEPTED ANSWER INDEX & SAFETY
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_room_questions_accepted_ans
  ON public.room_questions(accepted_answer_id)
  WHERE accepted_answer_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. CLUB CLASH NEGOTIATION RLS POLICIES
-- -----------------------------------------------------------------------------
-- Allow members of either negotiating club to view proposals
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'club_negotiations_read' AND tablename = 'club_clash_negotiations'
  ) THEN
    CREATE POLICY club_negotiations_read ON public.club_clash_negotiations
      FOR SELECT TO authenticated USING (
        EXISTS (
          SELECT 1 FROM public.club_members cm
          WHERE (cm.club_id = club_clash_negotiations.initiator_club_id OR cm.club_id = club_clash_negotiations.target_club_id)
            AND cm.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'club_negotiations_insert' AND tablename = 'club_clash_negotiations'
  ) THEN
    CREATE POLICY club_negotiations_insert ON public.club_clash_negotiations
      FOR INSERT TO authenticated WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.club_members cm
          WHERE cm.club_id = club_clash_negotiations.initiator_club_id
            AND cm.user_id = auth.uid()
            AND cm.role IN ('owner', 'admin')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'club_negotiations_update' AND tablename = 'club_clash_negotiations'
  ) THEN
    CREATE POLICY club_negotiations_update ON public.club_clash_negotiations
      FOR UPDATE TO authenticated USING (
        EXISTS (
          SELECT 1 FROM public.club_members cm
          WHERE (cm.club_id = club_clash_negotiations.initiator_club_id OR cm.club_id = club_clash_negotiations.target_club_id)
            AND cm.user_id = auth.uid()
            AND cm.role IN ('owner', 'admin')
        )
      );
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4. REGISTER NEXT-GEN FEATURE FLAGS IN EXISTING SYSTEM
-- -----------------------------------------------------------------------------
INSERT INTO public.feature_flags (key, description, is_enabled, rollout_percentage)
VALUES
  ('nextgen_room_ui', 'Enable 5-card modular Study Room layout.', true, 100),
  ('room_qa', 'Enable Room Q&A Discussion and Answer Voting.', true, 100),
  ('room_recordings', 'Enable Zero-Cost YouTube Classroom Archive.', true, 100),
  ('campus_feed', 'Enable University Campus Social Feed with Anonymity.', true, 100),
  ('club_clash_engine', 'Enable 4-Signal Club Clash Detector and Negotiation.', true, 100),
  ('r2_storage', 'Enable Cloudflare R2 presigned academic vault storage.', false, 0)
ON CONFLICT (key) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 5. COMPOSITE INDEXES & UPDATED_AT TRIGGERS
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_campus_posts_status_created
  ON public.campus_posts(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_media_objects_status_provider
  ON public.media_objects(status, provider);

CREATE OR REPLACE FUNCTION public.set_nextgen_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_room_questions_updated_at') THEN
    CREATE TRIGGER trg_room_questions_updated_at
      BEFORE UPDATE ON public.room_questions
      FOR EACH ROW EXECUTE FUNCTION public.set_nextgen_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_room_answers_updated_at') THEN
    CREATE TRIGGER trg_room_answers_updated_at
      BEFORE UPDATE ON public.room_question_answers
      FOR EACH ROW EXECUTE FUNCTION public.set_nextgen_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_campus_posts_updated_at') THEN
    CREATE TRIGGER trg_campus_posts_updated_at
      BEFORE UPDATE ON public.campus_posts
      FOR EACH ROW EXECUTE FUNCTION public.set_nextgen_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_media_objects_updated_at') THEN
    CREATE TRIGGER trg_media_objects_updated_at
      BEFORE UPDATE ON public.media_objects
      FOR EACH ROW EXECUTE FUNCTION public.set_nextgen_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_club_negotiations_updated_at') THEN
    CREATE TRIGGER trg_club_negotiations_updated_at
      BEFORE UPDATE ON public.club_clash_negotiations
      FOR EACH ROW EXECUTE FUNCTION public.set_nextgen_updated_at();
  END IF;
END $$;
