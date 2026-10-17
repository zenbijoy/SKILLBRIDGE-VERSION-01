-- Phase 2 Realtime Schema Migrations

-- 1. Idempotency and Reference for Messages
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS client_message_id UUID,
ADD COLUMN IF NOT EXISTS reply_to_message_id UUID REFERENCES messages(id) ON DELETE SET NULL;

-- Make client_message_id unique per sender to prevent duplicate sends on retry
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_client_message_id_sender_id_key;
ALTER TABLE messages ADD CONSTRAINT messages_client_message_id_sender_id_key UNIQUE (sender_id, client_message_id);

-- 2. Message Reactions
CREATE TABLE IF NOT EXISTS message_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    reaction TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (message_id, user_id, reaction)
);

ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see reactions in their conversations"
ON message_reactions FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM messages m
        JOIN conversation_members cm ON cm.conversation_id = m.conversation_id
        WHERE m.id = message_reactions.message_id
        AND cm.user_id = auth.uid()
    )
);

-- Note: In this architecture, all inserts to message_reactions will be handled via RPC or backend API to ensure strict validation.

-- 3. Notification Preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    messages BOOLEAN NOT NULL DEFAULT true,
    connections BOOLEAN NOT NULL DEFAULT true,
    rooms BOOLEAN NOT NULL DEFAULT true,
    sessions BOOLEAN NOT NULL DEFAULT true,
    teaching BOOLEAN NOT NULL DEFAULT true,
    system BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own notification preferences"
ON notification_preferences FOR SELECT
USING (auth.uid() = user_id);

-- 4. LiveKit Attendance
CREATE TABLE IF NOT EXISTS livekit_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    left_at TIMESTAMPTZ,
    duration_seconds INTEGER DEFAULT 0
);

ALTER TABLE livekit_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view attendance for their sessions"
ON livekit_attendance FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM sessions s
        JOIN room_members rm ON rm.room_id = s.room_id
        WHERE s.id = livekit_attendance.session_id
        AND rm.user_id = auth.uid()
    )
);
