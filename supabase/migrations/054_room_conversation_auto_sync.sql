-- ==============================================================================
-- Migration 054: Automatic Room & Channel Conversation Membership Synchronization
-- ==============================================================================

BEGIN;

-- 1. Trigger function: when a room member is added or role changed, sync to conversation_members
CREATE OR REPLACE FUNCTION public.handle_room_member_sync_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_room_conv_id uuid;
    v_chan RECORD;
BEGIN
    -- Sync main room conversation
    SELECT conversation_id INTO v_room_conv_id FROM public.rooms WHERE id = NEW.room_id;
    IF v_room_conv_id IS NOT NULL THEN
        INSERT INTO public.conversation_members (conversation_id, user_id, role)
        VALUES (v_room_conv_id, NEW.user_id, COALESCE(NEW.role, 'member'))
        ON CONFLICT (conversation_id, user_id) 
        DO UPDATE SET role = EXCLUDED.role;
    END IF;

    -- Sync all non-private channels of this room
    FOR v_chan IN 
        SELECT conversation_id FROM public.room_channels 
        WHERE room_id = NEW.room_id AND (is_private IS NOT TRUE) AND conversation_id IS NOT NULL
    LOOP
        INSERT INTO public.conversation_members (conversation_id, user_id, role)
        VALUES (v_chan.conversation_id, NEW.user_id, COALESCE(NEW.role, 'member'))
        ON CONFLICT (conversation_id, user_id) 
        DO UPDATE SET role = EXCLUDED.role;
    END LOOP;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_room_member_sync_conversation ON public.room_members;
CREATE TRIGGER trg_room_member_sync_conversation
AFTER INSERT OR UPDATE OF role ON public.room_members
FOR EACH ROW
EXECUTE FUNCTION public.handle_room_member_sync_conversation();


-- 2. Trigger function: when a new non-private channel is created or updated, sync all existing room members into it
CREATE OR REPLACE FUNCTION public.handle_room_channel_sync_members()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_mem RECORD;
BEGIN
    IF NEW.conversation_id IS NOT NULL AND (NEW.is_private IS NOT TRUE) THEN
        FOR v_mem IN 
            SELECT user_id, role FROM public.room_members WHERE room_id = NEW.room_id
        LOOP
            INSERT INTO public.conversation_members (conversation_id, user_id, role)
            VALUES (NEW.conversation_id, v_mem.user_id, COALESCE(v_mem.role, 'member'))
            ON CONFLICT (conversation_id, user_id) 
            DO UPDATE SET role = EXCLUDED.role;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_room_channel_sync_members ON public.room_channels;
CREATE TRIGGER trg_room_channel_sync_members
AFTER INSERT OR UPDATE OF conversation_id, is_private ON public.room_channels
FOR EACH ROW
EXECUTE FUNCTION public.handle_room_channel_sync_members();

-- 3. Initial backfill: ensure all existing room members are enrolled in room and channel conversations
DO $$
DECLARE
    r RECORD;
    ch RECORD;
    m RECORD;
BEGIN
    FOR r IN SELECT id, conversation_id FROM public.rooms WHERE conversation_id IS NOT NULL LOOP
        FOR m IN SELECT user_id, role FROM public.room_members WHERE room_id = r.id LOOP
            INSERT INTO public.conversation_members (conversation_id, user_id, role)
            VALUES (r.conversation_id, m.user_id, COALESCE(m.role, 'member'))
            ON CONFLICT (conversation_id, user_id) DO NOTHING;
        END LOOP;
    END LOOP;

    FOR ch IN SELECT room_id, conversation_id FROM public.room_channels WHERE conversation_id IS NOT NULL AND (is_private IS NOT TRUE) LOOP
        FOR m IN SELECT user_id, role FROM public.room_members WHERE room_id = ch.room_id LOOP
            INSERT INTO public.conversation_members (conversation_id, user_id, role)
            VALUES (ch.conversation_id, m.user_id, COALESCE(m.role, 'member'))
            ON CONFLICT (conversation_id, user_id) DO NOTHING;
        END LOOP;
    END LOOP;
END;
$$;

COMMIT;
