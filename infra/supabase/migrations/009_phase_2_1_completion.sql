-- Phase 2.1 Schema Additions

-- 1. Push Tokens enhancements
-- Current table is:
-- create table public.device_tokens (
--   user_id uuid references public.profiles(id) on delete cascade not null,
--   token text not null,
--   token_fingerprint text not null,
--   platform text,
--   enabled boolean default true,
--   last_seen_at timestamptz default now(),
--   created_at timestamptz default now(),
--   primary key (user_id, token_fingerprint)
-- );

ALTER TABLE public.device_tokens 
ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'expo',
ADD COLUMN IF NOT EXISTS device_id TEXT,
ADD COLUMN IF NOT EXISTS app_version TEXT;

-- 2. Message Delivery States
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'sent',
ADD COLUMN IF NOT EXISTS soft_deleted BOOLEAN DEFAULT false;

-- 3. Conversation Read State (Scalable)
ALTER TABLE public.conversation_members
ADD COLUMN IF NOT EXISTS last_read_message_id UUID REFERENCES messages(id) ON DELETE SET NULL;

-- 4. Push Receipts Table
CREATE TABLE IF NOT EXISTS public.push_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    device_token TEXT NOT NULL,
    status TEXT NOT NULL, -- 'pending', 'delivered', 'error'
    error_details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Note: No RLS needed for push_receipts since it's backend-only

-- 5. Add idempotency and soft-delete policies for messages
DROP POLICY IF EXISTS "Users can read conversation messages" ON messages;
CREATE POLICY "Users can read conversation messages"
ON messages FOR SELECT
USING (
    soft_deleted = false AND
    EXISTS (
        SELECT 1 FROM conversation_members cm 
        WHERE cm.conversation_id = messages.conversation_id 
        AND cm.user_id = auth.uid()
    )
);

-- Allow senders to see their soft_deleted messages (to show "Message deleted")
CREATE POLICY "Senders can see their soft_deleted messages"
ON messages FOR SELECT
USING (
    soft_deleted = true AND sender_id = auth.uid()
);
