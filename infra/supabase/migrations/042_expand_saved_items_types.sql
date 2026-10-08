-- =============================================================================
-- Migration 042: Expand saved_items allowed entity types for posts & social
-- =============================================================================
DO $$
BEGIN
  ALTER TABLE public.saved_items DROP CONSTRAINT IF EXISTS saved_items_entity_type_check;
  ALTER TABLE public.saved_items ADD CONSTRAINT saved_items_entity_type_check
    CHECK (entity_type IN ('room','event','resource','profile','post','person','skill','club','research','session','goal'));
EXCEPTION
  WHEN others THEN NULL;
END $$;
