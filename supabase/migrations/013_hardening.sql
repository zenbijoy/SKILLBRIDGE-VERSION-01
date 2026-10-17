-- 013_hardening.sql
-- Ensure all SECURITY DEFINER functions have search_path set to public

DO $$
DECLARE
    rec record;
BEGIN
    FOR rec IN 
        SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' 
        AND p.prosecdef = true 
        AND (p.proconfig IS NULL OR NOT ('search_path=public' = ANY(p.proconfig)))
    LOOP
        EXECUTE 'ALTER FUNCTION public.' || quote_ident(rec.proname) || '(' || rec.args || ') SET search_path = public';
    END LOOP;
END;
$$;
