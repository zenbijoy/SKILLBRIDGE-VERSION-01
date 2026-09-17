-- Migration 036: Privacy and Surface Completion
-- Adds fine-grained privacy controls for messaging, calls, and presence visibility.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS who_can_message text NOT NULL DEFAULT 'everyone'
    CHECK (who_can_message IN ('everyone', 'connections', 'nobody')),
  ADD COLUMN IF NOT EXISTS who_can_call text NOT NULL DEFAULT 'everyone'
    CHECK (who_can_call IN ('everyone', 'connections', 'nobody')),
  ADD COLUMN IF NOT EXISTS presence_visibility text NOT NULL DEFAULT 'everyone'
    CHECK (presence_visibility IN ('everyone', 'connections', 'nobody'));

COMMENT ON COLUMN public.profiles.who_can_message IS 'Controls who can initiate direct messages: everyone, connections, or nobody';
COMMENT ON COLUMN public.profiles.who_can_call IS 'Controls who can initiate 1:1 audio/video calls: everyone, connections, or nobody';
COMMENT ON COLUMN public.profiles.presence_visibility IS 'Controls who can see online presence / last seen: everyone, connections, or nobody';
