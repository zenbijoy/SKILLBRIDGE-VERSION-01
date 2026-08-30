-- Migration 024: Google OAuth Metadata, Avatar & Username Resilience
-- Hardens public.handle_new_user() to support both 'full_name' and 'name' as well as 'avatar_url' and 'picture' from OAuth providers.

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_username text;
  v_final_username text;
  v_suffix integer := 0;
  v_full_name text;
  v_avatar_url text;
BEGIN
  -- Safe extraction of full name across email/password and OAuth providers (Google, Facebook, etc.)
  v_full_name := coalesce(
    nullif(btrim(NEW.raw_user_meta_data->>'full_name'), ''),
    nullif(btrim(NEW.raw_user_meta_data->>'name'), ''),
    'New member'
  );

  -- Safe extraction of avatar URL
  v_avatar_url := coalesce(
    nullif(btrim(NEW.raw_user_meta_data->>'avatar_url'), ''),
    nullif(btrim(NEW.raw_user_meta_data->>'picture'), ''),
    null
  );

  -- Collision-resistant base username
  v_base_username := 'user_' || substr(replace(NEW.id::text, '-', ''), 1, 10);
  v_final_username := v_base_username;

  -- Ensure username uniqueness
  WHILE EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE lower(username) = lower(v_final_username) AND id <> NEW.id
  ) LOOP
    v_suffix := v_suffix + 1;
    v_final_username := substr(v_base_username, 1, 24) || '_' || v_suffix::text;
  END LOOP;

  INSERT INTO public.profiles (
    id,
    full_name,
    avatar_url,
    username,
    preferred_locale,
    study_mode_preference,
    onboarding_step,
    onboarding_status,
    onboarding_version,
    onboarding_mission,
    onboarding_push_opt_in,
    timezone,
    profile_completion_percent,
    profile_missing_fields,
    onboarding_completed
  )
  VALUES (
    NEW.id,
    v_full_name,
    v_avatar_url,
    v_final_username,
    'en',
    'hybrid',
    'language',
    'not_started',
    1,
    'both',
    true,
    'Asia/Dhaka',
    0,
    ARRAY['full_name', 'username', 'university', 'department', 'study_mode_preference', 'teach_skills', 'learn_skills']::text[],
    false
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = CASE
      WHEN public.profiles.full_name IS NULL OR public.profiles.full_name = 'New member'
      THEN EXCLUDED.full_name
      ELSE public.profiles.full_name
    END,
    avatar_url = CASE
      WHEN public.profiles.avatar_url IS NULL
      THEN EXCLUDED.avatar_url
      ELSE public.profiles.avatar_url
    END;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Prevent auth signup blocking on profile provisioning failure
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user();

COMMIT;
