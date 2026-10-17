-- =============================================================================
-- Migration 035: SkillBridge Communication OS Architecture (Prompt 7)
-- Telegram/Messenger-grade Inbox + Pinned/Archived/Mute + DM Uniqueness + Search
-- =============================================================================

-- 1. Conversation Member User States (Pin, Archive, Mute)
ALTER TABLE public.conversation_members
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS muted_until TIMESTAMPTZ DEFAULT NULL;

-- 2. Performance Indexes for Telegram-Density Ordering & Filtering
CREATE INDEX IF NOT EXISTS idx_conversation_members_user_pinned
  ON public.conversation_members(user_id, is_pinned DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_members_archived
  ON public.conversation_members(user_id, is_archived);

-- 3. Atomic DM Conversation Resolver with Symmetric Advisory Locking
CREATE OR REPLACE FUNCTION public.get_or_create_dm_conversation(p_user_a UUID, p_user_b UUID)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_conv RECORD;
  v_conv_id UUID;
  v_lock_key BIGINT;
BEGIN
  IF p_user_a = p_user_b THEN
    RAISE EXCEPTION 'Cannot create direct message conversation with oneself';
  END IF;

  -- Derive 64-bit symmetric lock key from sorted UUID pair to serialize concurrent requests between these 2 users
  v_lock_key := ('x' || substr(md5(least(p_user_a::text, p_user_b::text) || ':' || greatest(p_user_a::text, p_user_b::text)), 1, 16))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Check existing DM between the two users
  SELECT c.id, c.title, c.kind, c.updated_at INTO v_conv
  FROM public.conversations c
  WHERE c.kind = 'dm'
    AND EXISTS (SELECT 1 FROM public.conversation_members m WHERE m.conversation_id = c.id AND m.user_id = p_user_a)
    AND EXISTS (SELECT 1 FROM public.conversation_members m WHERE m.conversation_id = c.id AND m.user_id = p_user_b)
    AND (SELECT count(*) FROM public.conversation_members m WHERE m.conversation_id = c.id) = 2
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'id', v_conv.id,
      'title', v_conv.title,
      'kind', v_conv.kind,
      'updated_at', v_conv.updated_at,
      'is_new', false
    );
  END IF;

  -- Create new DM conversation
  INSERT INTO public.conversations(kind, created_by)
  VALUES ('dm', p_user_a)
  RETURNING id INTO v_conv_id;

  INSERT INTO public.conversation_members(conversation_id, user_id, role)
  VALUES
    (v_conv_id, p_user_a, 'member'),
    (v_conv_id, p_user_b, 'member');

  SELECT c.id, c.title, c.kind, c.updated_at INTO v_conv
  FROM public.conversations c WHERE c.id = v_conv_id;

  RETURN jsonb_build_object(
    'id', v_conv.id,
    'title', v_conv.title,
    'kind', v_conv.kind,
    'updated_at', v_conv.updated_at,
    'is_new', true
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_or_create_dm_conversation(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_dm_conversation(UUID, UUID) TO service_role, authenticated;
