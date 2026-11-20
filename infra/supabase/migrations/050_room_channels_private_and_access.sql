-- ==============================================================================
-- Migration 050: Room Channels Private & Access Control (Common vs Private)
-- ==============================================================================

BEGIN;

-- 1. Add is_private and allowed_roles to room_channels
ALTER TABLE public.room_channels 
ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT false;

ALTER TABLE public.room_channels 
ADD COLUMN IF NOT EXISTS allowed_roles TEXT[] DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_room_channels_privacy 
ON public.room_channels(room_id, is_private);

-- 2. Update RLS policies on room_channels so private channels are protected
DROP POLICY IF EXISTS "Members can view room channels" ON public.room_channels;
CREATE POLICY "Members can view room channels" ON public.room_channels
  FOR SELECT USING (
    -- Common / non-private channels visible to room members or public room viewers
    ((COALESCE(is_private, false) = false) AND (
      EXISTS (SELECT 1 FROM public.room_members WHERE room_id = room_channels.room_id AND user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.rooms WHERE id = room_channels.room_id AND visibility = 'public')
    ))
    -- Private channels visible only to room educators/staff (owner, teacher, moderator, admin)
    OR ((is_private IS TRUE) AND (
      EXISTS (
        SELECT 1 FROM public.room_members 
        WHERE room_id = room_channels.room_id 
          AND user_id = auth.uid() 
          AND role IN ('owner', 'teacher', 'moderator', 'admin')
      )
      OR EXISTS (
        SELECT 1 FROM public.rooms 
        WHERE id = room_channels.room_id 
          AND owner_id = auth.uid()
      )
    ))
  );

COMMIT;
