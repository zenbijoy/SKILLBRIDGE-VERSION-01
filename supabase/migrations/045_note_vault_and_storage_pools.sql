-- Migration 045: Note Vault, Profile Covers & Storage Pools Suite
-- Ensures cover_url column on profiles, creates vault_notes and storage_pools tables with RLS

-- 1. Profile Cover Photo Column
ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS cover_url text;

-- 2. Note Vault Table for PDF and Academic Document Sharing
CREATE TABLE IF NOT EXISTS public.vault_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  file_url text NOT NULL,
  file_key text NOT NULL,
  file_size_bytes bigint DEFAULT 0,
  sha256_hash text,
  mime_type text DEFAULT 'application/pdf',
  uploader_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department text,
  semester text,
  course_code text,
  tags text[] DEFAULT '{}'::text[],
  visibility text DEFAULT 'public' CHECK (visibility IN ('public', 'community', 'private')),
  community_id uuid,
  community_name text,
  storage_bucket text DEFAULT 'skillbridge-media',
  storage_provider text DEFAULT 'r2',
  downloads_count integer DEFAULT 0,
  views_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexing for fast search and filtering
CREATE INDEX IF NOT EXISTS idx_vault_notes_uploader ON public.vault_notes(uploader_id);
CREATE INDEX IF NOT EXISTS idx_vault_notes_dept ON public.vault_notes(department);
CREATE INDEX IF NOT EXISTS idx_vault_notes_visibility ON public.vault_notes(visibility);
CREATE INDEX IF NOT EXISTS idx_vault_notes_hash ON public.vault_notes(sha256_hash);
CREATE INDEX IF NOT EXISTS idx_vault_notes_created_at ON public.vault_notes(created_at DESC);

-- Enable RLS
ALTER TABLE public.vault_notes ENABLE ROW LEVEL SECURITY;

-- Policies for vault_notes
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'vault_notes' AND policyname = 'Anyone can view public notes'
  ) THEN
    CREATE POLICY "Anyone can view public notes"
      ON public.vault_notes FOR SELECT
      USING (visibility = 'public' OR uploader_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'vault_notes' AND policyname = 'Authenticated users can upload notes'
  ) THEN
    CREATE POLICY "Authenticated users can upload notes"
      ON public.vault_notes FOR INSERT
      WITH CHECK (auth.uid() = uploader_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'vault_notes' AND policyname = 'Users can update own notes'
  ) THEN
    CREATE POLICY "Users can update own notes"
      ON public.vault_notes FOR UPDATE
      USING (auth.uid() = uploader_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'vault_notes' AND policyname = 'Users can delete own notes'
  ) THEN
    CREATE POLICY "Users can delete own notes"
      ON public.vault_notes FOR DELETE
      USING (auth.uid() = uploader_id);
  END IF;
END $$;

-- 3. Storage Pools Table for Multi-Bucket Routing
CREATE TABLE IF NOT EXISTS public.storage_pools (
  id text PRIMARY KEY,
  name text NOT NULL,
  provider text DEFAULT 'r2',
  account_id text NOT NULL,
  bucket_name text NOT NULL,
  access_key_id text NOT NULL,
  secret_access_key text NOT NULL,
  public_domain text,
  max_capacity_bytes bigint DEFAULT 10737418240, -- 10 GB
  used_bytes bigint DEFAULT 0,
  file_count integer DEFAULT 0,
  status text DEFAULT 'active' CHECK (status IN ('active', 'full', 'standby', 'disabled')),
  priority integer DEFAULT 1,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.storage_pools ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'storage_pools' AND policyname = 'Admins can view and manage storage pools'
  ) THEN
    CREATE POLICY "Admins can view and manage storage pools"
      ON public.storage_pools FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid() AND ('admin' = ANY(profiles.roles))
        )
      );
  END IF;
END $$;
