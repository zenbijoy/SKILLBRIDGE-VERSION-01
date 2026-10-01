-- Migration 038: Group Chat Admin and Member Management System
-- Provides support for Messenger-style group conversations, admin privileges, role transitions, and member controls.

-- 1. Extend conversations table with optional avatar_url and description
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS description text;

COMMENT ON COLUMN public.conversations.avatar_url IS 'Custom group chat avatar URL';
COMMENT ON COLUMN public.conversations.description IS 'Optional group chat description or guidelines';

-- 2. Ensure indexes on conversation_members for high-throughput queries
CREATE INDEX IF NOT EXISTS idx_conversation_members_lookup
  ON public.conversation_members(conversation_id, user_id, role);

CREATE INDEX IF NOT EXISTS idx_conversation_members_role
  ON public.conversation_members(conversation_id, role);

-- 3. RLS Policies for conversations and conversation_members
-- Allow conversation members to view conversations they belong to
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'conversations' AND policyname = 'conversation_members_can_read'
  ) THEN
    CREATE POLICY conversation_members_can_read ON public.conversations
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.conversation_members cm
          WHERE cm.conversation_id = conversations.id
            AND cm.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Allow conversation admins to update group conversations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'conversations' AND policyname = 'conversation_admins_can_update'
  ) THEN
    CREATE POLICY conversation_admins_can_update ON public.conversations
      FOR UPDATE
      TO authenticated
      USING (
        created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.conversation_members cm
          WHERE cm.conversation_id = conversations.id
            AND cm.user_id = auth.uid()
            AND cm.role = 'admin'
        )
      );
  END IF;
END $$;

-- Allow conversation admins to manage members
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'conversation_members' AND policyname = 'conversation_admins_can_modify_members'
  ) THEN
    CREATE POLICY conversation_admins_can_modify_members ON public.conversation_members
      FOR ALL
      TO authenticated
      USING (
        user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.conversation_members cm
          WHERE cm.conversation_id = conversation_members.conversation_id
            AND cm.user_id = auth.uid()
            AND cm.role = 'admin'
        )
      );
  END IF;
END $$;
