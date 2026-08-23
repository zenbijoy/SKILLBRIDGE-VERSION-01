-- Migration 019: Session Local Recordings & YouTube Replay Integration

ALTER TABLE public.sessions
ADD COLUMN IF NOT EXISTS recording_url TEXT,
ADD COLUMN IF NOT EXISTS recording_video_id TEXT,
ADD COLUMN IF NOT EXISTS recording_provider TEXT DEFAULT 'youtube',
ADD COLUMN IF NOT EXISTS recording_status TEXT DEFAULT 'none',
ADD COLUMN IF NOT EXISTS recording_duration_seconds INTEGER DEFAULT 0;

-- Ensure constraint on recording_provider and recording_status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sessions_recording_provider_check'
  ) THEN
    ALTER TABLE public.sessions
    ADD CONSTRAINT sessions_recording_provider_check
    CHECK (recording_provider IN ('youtube', 'google_drive', 'r2', 'custom'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sessions_recording_status_check'
  ) THEN
    ALTER TABLE public.sessions
    ADD CONSTRAINT sessions_recording_status_check
    CHECK (recording_status IN ('none', 'recording', 'uploading', 'ready', 'failed'));
  END IF;
END $$;

COMMENT ON COLUMN public.sessions.recording_url IS 'Public or unlisted URL to the session recording (e.g., YouTube unlisted embed link).';
COMMENT ON COLUMN public.sessions.recording_video_id IS 'Unique video ID from YouTube or the underlying media provider.';
COMMENT ON COLUMN public.sessions.recording_status IS 'Lifecycle status of the session recording (none, recording, uploading, ready, failed).';
