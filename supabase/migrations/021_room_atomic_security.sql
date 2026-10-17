-- Migration 021: Clean up obsolete RPCs and secure atomic room functions

-- 1. Revoke all from PUBLIC, anon, and authenticated
REVOKE ALL ON FUNCTION public.create_room_atomic FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_room_atomic FROM anon;
REVOKE ALL ON FUNCTION public.create_room_atomic FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_room_atomic TO service_role;

REVOKE ALL ON FUNCTION public.join_room_service_atomic FROM PUBLIC;
REVOKE ALL ON FUNCTION public.join_room_service_atomic FROM anon;
REVOKE ALL ON FUNCTION public.join_room_service_atomic FROM authenticated;
GRANT EXECUTE ON FUNCTION public.join_room_service_atomic TO service_role;

REVOKE ALL ON FUNCTION public.leave_room_service_atomic FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leave_room_service_atomic FROM anon;
REVOKE ALL ON FUNCTION public.leave_room_service_atomic FROM authenticated;
GRANT EXECUTE ON FUNCTION public.leave_room_service_atomic TO service_role;

-- 2. Drop obsolete overloads of create_room_atomic if they exist
-- (The most up-to-date has p_campus_location as text)
-- Drop previous versions missing parameters to avoid ambiguous function calls

DO $$
BEGIN
  -- We use dynamic SQL or try-catch for dropping if exists since function arguments changed over time
  -- Previous version without campus_location
  DROP FUNCTION IF EXISTS public.create_room_atomic(
    text, text, text, text, integer, text, text[], text, uuid
  );
  
  -- Version without topic, mode, campus_location
  DROP FUNCTION IF EXISTS public.create_room_atomic(
    text, text, text, integer, text[], text, uuid
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
