-- Migration 046: Ensure Foreign Key from vault_notes.uploader_id to profiles.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vault_notes_uploader_profiles_fkey'
  ) THEN
    ALTER TABLE public.vault_notes
      ADD CONSTRAINT vault_notes_uploader_profiles_fkey
      FOREIGN KEY (uploader_id) REFERENCES public.profiles(id)
      ON DELETE CASCADE;
  END IF;
END $$;
