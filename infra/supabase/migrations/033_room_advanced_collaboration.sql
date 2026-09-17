-- =============================================================================
-- Migration 033: SkillBridge Advanced Room Collaboration Architecture (Prompt 5)
-- Channels, Pinned Hub, Video Playlists, Watch Progress, Moderation & Invites
-- =============================================================================

-- 1. Extend Rooms & Room Posts
ALTER TABLE rooms 
  ADD COLUMN IF NOT EXISTS enabled_modules TEXT[] DEFAULT ARRAY['posts', 'chat', 'learn', 'media']::text[],
  ADD COLUMN IF NOT EXISTS default_landing_tab TEXT DEFAULT 'posts',
  ADD COLUMN IF NOT EXISTS appearance JSONB DEFAULT '{"accent_color": null, "theme": "auto"}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;

ALTER TABLE room_posts 
  ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal' CHECK (priority IN ('normal', 'important', 'urgent')),
  ADD COLUMN IF NOT EXISTS comments_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS views_count INT DEFAULT 0;

-- 2. Room Channels
CREATE TABLE IF NOT EXISTS room_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('text', 'announcement', 'question', 'resource', 'media', 'voice')),
  description TEXT DEFAULT '',
  position INT DEFAULT 0,
  is_default BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  permissions_override JSONB DEFAULT '{}'::jsonb,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_room_channels_slug UNIQUE (room_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_room_channels_room ON room_channels(room_id, position ASC, created_at ASC);

-- 3. Room Pinned Content Hub
CREATE TABLE IF NOT EXISTS room_pinned_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('post', 'announcement', 'question', 'resource', 'event', 'message', 'video')),
  item_id UUID NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT DEFAULT '',
  pinned_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  position INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_room_pinned_items_room ON room_pinned_items(room_id, position ASC, created_at DESC);

-- 4. User Video Watch Progress
CREATE TABLE IF NOT EXISTS user_video_progress (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recording_id UUID NOT NULL REFERENCES room_recordings(id) ON DELETE CASCADE,
  last_position_seconds INT NOT NULL DEFAULT 0,
  duration_seconds INT NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, recording_id)
);

CREATE INDEX IF NOT EXISTS idx_user_video_progress_user ON user_video_progress(user_id, updated_at DESC);

-- 5. Video Playlists
CREATE TABLE IF NOT EXISTS room_video_playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  position INT DEFAULT 0,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_room_video_playlists_room ON room_video_playlists(room_id, position ASC);

CREATE TABLE IF NOT EXISTS room_video_playlist_items (
  playlist_id UUID NOT NULL REFERENCES room_video_playlists(id) ON DELETE CASCADE,
  recording_id UUID NOT NULL REFERENCES room_recordings(id) ON DELETE CASCADE,
  position INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (playlist_id, recording_id)
);

CREATE INDEX IF NOT EXISTS idx_room_playlist_items_order ON room_video_playlist_items(playlist_id, position ASC);

-- 6. Room Moderation Audit Logs
CREATE TABLE IF NOT EXISTS room_moderation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('dismiss_report', 'remove_content', 'warn_user', 'mute_user', 'remove_user', 'ban_user')),
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  reason TEXT DEFAULT '',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_room_mod_logs_room ON room_moderation_logs(room_id, created_at DESC);

-- 7. Room Invites
CREATE TABLE IF NOT EXISTS room_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  max_uses INT DEFAULT NULL,
  uses_count INT DEFAULT 0,
  expires_at TIMESTAMPTZ DEFAULT NULL,
  is_revoked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_room_invites_code ON room_invites(code) WHERE NOT is_revoked;
CREATE INDEX IF NOT EXISTS idx_room_invites_room ON room_invites(room_id, created_at DESC);

-- 8. Row Level Security Policies
ALTER TABLE room_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_pinned_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_video_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_video_playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_video_playlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_moderation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_invites ENABLE ROW LEVEL SECURITY;

-- Channels RLS
DROP POLICY IF EXISTS "Members can view room channels" ON room_channels;
CREATE POLICY "Members can view room channels" ON room_channels
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM room_members WHERE room_id = room_channels.room_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM rooms WHERE id = room_channels.room_id AND visibility = 'public')
  );

DROP POLICY IF EXISTS "Owners and moderators can manage channels" ON room_channels;
CREATE POLICY "Owners and moderators can manage channels" ON room_channels
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM room_members 
      WHERE room_id = room_channels.room_id 
        AND user_id = auth.uid() 
        AND role IN ('owner', 'moderator', 'teacher')
    )
  );

-- Pinned Items RLS
DROP POLICY IF EXISTS "Members can view pinned items" ON room_pinned_items;
CREATE POLICY "Members can view pinned items" ON room_pinned_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM room_members WHERE room_id = room_pinned_items.room_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM rooms WHERE id = room_pinned_items.room_id AND visibility = 'public')
  );

-- Video Progress RLS
DROP POLICY IF EXISTS "Users can manage their own video progress" ON user_video_progress;
CREATE POLICY "Users can manage their own video progress" ON user_video_progress
  FOR ALL USING (user_id = auth.uid());

-- Playlists RLS
DROP POLICY IF EXISTS "Members can view room playlists" ON room_video_playlists;
CREATE POLICY "Members can view room playlists" ON room_video_playlists
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM room_members WHERE room_id = room_video_playlists.room_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM rooms WHERE id = room_video_playlists.room_id AND visibility = 'public')
  );

DROP POLICY IF EXISTS "Members can view playlist items" ON room_video_playlist_items;
CREATE POLICY "Members can view playlist items" ON room_video_playlist_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM room_video_playlists p
      JOIN rooms r ON r.id = p.room_id
      WHERE p.id = room_video_playlist_items.playlist_id
        AND (r.visibility = 'public' OR EXISTS (SELECT 1 FROM room_members m WHERE m.room_id = r.id AND m.user_id = auth.uid()))
    )
  );

-- Moderation Logs RLS
DROP POLICY IF EXISTS "Owners and mods can view moderation logs" ON room_moderation_logs;
CREATE POLICY "Owners and mods can view moderation logs" ON room_moderation_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM room_members 
      WHERE room_id = room_moderation_logs.room_id 
        AND user_id = auth.uid() 
        AND role IN ('owner', 'moderator')
    )
  );
