-- Migration 052: Google Drive Vault Ingestion, Background VPS Worker & R2 Caching
-- Adds drive provenance and sync state to vault_notes, and creates vault_sync_jobs

-- 1. Extend vault_notes table with Google Drive tracking
ALTER TABLE IF EXISTS public.vault_notes
  ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'direct_upload',
  ADD COLUMN IF NOT EXISTS source_drive_id text,
  ADD COLUMN IF NOT EXISTS source_drive_url text,
  ADD COLUMN IF NOT EXISTS sync_status text DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS r2_cached_at timestamptz,
  ADD COLUMN IF NOT EXISTS drive_parent_folder_id text,
  ADD COLUMN IF NOT EXISTS drive_parent_folder_name text;

CREATE INDEX IF NOT EXISTS idx_vault_notes_source_drive ON public.vault_notes(source_drive_id);
CREATE INDEX IF NOT EXISTS idx_vault_notes_sync_status ON public.vault_notes(sync_status);

-- 2. Create vault_sync_jobs table for tracking background crawling on VPS
CREATE TABLE IF NOT EXISTS public.vault_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  drive_url text NOT NULL,
  drive_id text NOT NULL,
  drive_type text NOT NULL DEFAULT 'folder' CHECK (drive_type IN ('folder', 'file')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  total_files integer DEFAULT 0,
  processed_files integer DEFAULT 0,
  cached_files integer DEFAULT 0,
  manifest_r2_key text,
  manifest_r2_url text,
  error_message text,
  department text,
  semester text,
  course_code text,
  visibility text DEFAULT 'public' CHECK (visibility IN ('public', 'community', 'private')),
  tags text[] DEFAULT '{}'::text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vault_sync_jobs_user ON public.vault_sync_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_vault_sync_jobs_status ON public.vault_sync_jobs(status);
CREATE INDEX IF NOT EXISTS idx_vault_sync_jobs_created_at ON public.vault_sync_jobs(created_at DESC);

-- Enable RLS on vault_sync_jobs
ALTER TABLE public.vault_sync_jobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'vault_sync_jobs' AND policyname = 'Users can view own sync jobs'
  ) THEN
    CREATE POLICY "Users can view own sync jobs"
      ON public.vault_sync_jobs FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'vault_sync_jobs' AND policyname = 'Users can create sync jobs'
  ) THEN
    CREATE POLICY "Users can create sync jobs"
      ON public.vault_sync_jobs FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'vault_sync_jobs' AND policyname = 'Users can update own sync jobs'
  ) THEN
    CREATE POLICY "Users can update own sync jobs"
      ON public.vault_sync_jobs FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;
END $$;
