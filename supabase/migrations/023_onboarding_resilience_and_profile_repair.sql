-- Migration 023: Onboarding Resilience, Profile Provisioning Self-Healing & Race Protection
-- Ensures all profile columns exist, hardens handle_new_user against username collisions and races,
-- upgrades save_onboarding_progress_atomic to self-heal missing profile rows, and repairs existing orphaned auth users.

BEGIN;

-- 1. Ensure all required profile columns exist idempotently
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_locale text DEFAULT 'en' CHECK (preferred_locale IN ('en', 'bn')),
  ADD COLUMN IF NOT EXISTS onboarding_step text DEFAULT 'language',
  ADD COLUMN IF NOT EXISTS onboarding_status text DEFAULT 'not_started' CHECK (onboarding_status IN ('not_started', 'in_progress', 'completed', 'skipped')),
  ADD COLUMN IF NOT EXISTS onboarding_version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS onboarding_mission text DEFAULT 'both' CHECK (onboarding_mission IN ('learn', 'teach', 'both', 'research')),
  ADD COLUMN IF NOT EXISTS onboarding_push_opt_in boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS study_mode_preference text DEFAULT 'hybrid' CHECK (study_mode_preference IN ('online', 'offline', 'hybrid')),
  ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'Asia/Dhaka',
  ADD COLUMN IF NOT EXISTS profile_completion_percent integer DEFAULT 0 CHECK (profile_completion_percent BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS profile_missing_fields text[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;

-- 2. Upgrade handle_new_user with collision resistance and race safety
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
BEGIN
  v_full_name := coalesce(nullif(btrim(NEW.raw_user_meta_data->>'full_name'), ''), 'New member');
  v_base_username := 'user_' || substr(replace(NEW.id::text, '-', ''), 1, 10);
  v_final_username := v_base_username;

  -- Ensure username collision safety
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
    full_name = CASE WHEN public.profiles.full_name IS NULL OR public.profiles.full_name = 'New member' THEN EXCLUDED.full_name ELSE public.profiles.full_name END;

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

-- 3. Upgrade save_onboarding_progress_atomic with self-healing and atomic synchronization
CREATE OR REPLACE FUNCTION public.save_onboarding_progress_atomic(
  p_user_id uuid,
  p_profile jsonb,
  p_teach_skills text[],
  p_learn_skills text[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_skill_name text;
  v_skill_id uuid;
  v_missing text[] := ARRAY[]::text[];
  v_completed integer := 0;
  v_percent integer;
  v_profile public.profiles%ROWTYPE;
  v_known_count integer;
  v_wanted_count integer;
  v_was_completed boolean;
  v_existing_status text;
  v_requested_status text;
  v_base_username text;
  v_final_username text;
  v_suffix integer := 0;
BEGIN
  IF p_profile IS NULL OR jsonb_typeof(p_profile) <> 'object' THEN
    RAISE EXCEPTION 'Profile payload must be a JSON object';
  END IF;

  -- 3.1 Fetch existing profile with lock or self-heal missing record
  SELECT onboarding_completed OR onboarding_status IN ('completed', 'skipped'), onboarding_status
  INTO v_was_completed, v_existing_status
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    v_base_username := 'user_' || substr(replace(p_user_id::text, '-', ''), 1, 10);
    v_final_username := v_base_username;

    WHILE EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE lower(username) = lower(v_final_username) AND id <> p_user_id
    ) LOOP
      v_suffix := v_suffix + 1;
      v_final_username := substr(v_base_username, 1, 24) || '_' || v_suffix::text;
    END LOOP;

    INSERT INTO public.profiles (
      id,
      full_name,
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
      p_user_id,
      coalesce(nullif(btrim(p_profile->>'full_name'), ''), 'New member'),
      coalesce(nullif(lower(btrim(p_profile->>'username')), ''), v_final_username),
      coalesce(p_profile->>'preferred_locale', 'en'),
      coalesce(p_profile->>'study_mode_preference', 'hybrid'),
      coalesce(p_profile->>'onboarding_step', 'language'),
      coalesce(p_profile->>'onboarding_status', 'in_progress'),
      coalesce((p_profile->>'onboarding_version')::integer, 1),
      coalesce(p_profile->>'onboarding_mission', 'both'),
      coalesce((p_profile->>'onboarding_push_opt_in')::boolean, true),
      coalesce(p_profile->>'timezone', 'Asia/Dhaka'),
      0,
      ARRAY[]::text[],
      false
    )
    ON CONFLICT (id) DO NOTHING;

    SELECT onboarding_completed OR onboarding_status IN ('completed', 'skipped'), onboarding_status
    INTO v_was_completed, v_existing_status
    FROM public.profiles
    WHERE id = p_user_id
    FOR UPDATE;
  END IF;

  v_requested_status := p_profile->>'onboarding_status';

  -- 3.2 Check username conflict if explicitly supplied
  IF p_profile ? 'username' AND EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE lower(username) = lower(btrim(p_profile->>'username'))
      AND id <> p_user_id
  ) THEN
    RAISE EXCEPTION 'Username is already taken' USING ERRCODE = '23505';
  END IF;

  -- 3.3 Update profile fields
  UPDATE public.profiles
  SET
    full_name = CASE WHEN p_profile ? 'full_name' THEN btrim(p_profile->>'full_name') ELSE full_name END,
    username = CASE WHEN p_profile ? 'username' THEN lower(btrim(p_profile->>'username')) ELSE username END,
    bio = CASE WHEN p_profile ? 'bio' THEN nullif(btrim(p_profile->>'bio'), '') ELSE bio END,
    university = CASE WHEN p_profile ? 'university' THEN nullif(btrim(p_profile->>'university'), '') ELSE university END,
    department = CASE WHEN p_profile ? 'department' THEN nullif(btrim(p_profile->>'department'), '') ELSE department END,
    batch = CASE WHEN p_profile ? 'batch' THEN nullif(btrim(p_profile->>'batch'), '') ELSE batch END,
    study_mode_preference = CASE WHEN p_profile ? 'study_mode_preference' THEN p_profile->>'study_mode_preference' ELSE study_mode_preference END,
    profile_visibility = CASE WHEN p_profile ? 'profile_visibility' THEN p_profile->>'profile_visibility' ELSE profile_visibility END,
    preferred_locale = CASE WHEN p_profile ? 'preferred_locale' THEN p_profile->>'preferred_locale' ELSE preferred_locale END,
    onboarding_step = CASE WHEN p_profile ? 'onboarding_step' THEN p_profile->>'onboarding_step' ELSE onboarding_step END,
    onboarding_version = CASE WHEN p_profile ? 'onboarding_version' THEN (p_profile->>'onboarding_version')::integer ELSE onboarding_version END,
    onboarding_mission = CASE WHEN p_profile ? 'onboarding_mission' THEN p_profile->>'onboarding_mission' ELSE onboarding_mission END,
    onboarding_push_opt_in = CASE WHEN p_profile ? 'onboarding_push_opt_in' THEN (p_profile->>'onboarding_push_opt_in')::boolean ELSE onboarding_push_opt_in END,
    timezone = CASE WHEN p_profile ? 'timezone' THEN p_profile->>'timezone' ELSE timezone END,
    updated_at = now()
  WHERE id = p_user_id;

  -- 3.4 Synchronize teach skills only when p_teach_skills is explicitly provided (not null)
  IF p_teach_skills IS NOT NULL THEN
    DELETE FROM public.user_skills us
    USING public.skills s
    WHERE us.user_id = p_user_id
      AND us.kind = 'known'
      AND us.skill_id = s.id
      AND NOT us.verified
      AND NOT EXISTS (
        SELECT 1 FROM unnest(p_teach_skills) item
        WHERE lower(btrim(item)) = lower(s.name)
      );

    FOR v_skill_name IN
      SELECT min(btrim(item))
      FROM unnest(p_teach_skills) item
      WHERE char_length(btrim(item)) BETWEEN 1 AND 60
      GROUP BY lower(btrim(item))
    LOOP
      PERFORM pg_advisory_xact_lock(hashtext('skill:' || lower(v_skill_name)));
      v_skill_id := NULL;
      SELECT id INTO v_skill_id
      FROM public.skills
      WHERE lower(name) = lower(v_skill_name)
      ORDER BY created_at, id
      LIMIT 1;
      IF v_skill_id IS NULL THEN
        INSERT INTO public.skills(name, category)
        VALUES (v_skill_name, 'General')
        ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id INTO v_skill_id;
      END IF;

      INSERT INTO public.user_skills(user_id, skill_id, kind, proficiency)
      VALUES (p_user_id, v_skill_id, 'known', 4)
      ON CONFLICT (user_id, skill_id, kind)
      DO UPDATE SET proficiency = GREATEST(public.user_skills.proficiency, EXCLUDED.proficiency);
    END LOOP;
  END IF;

  -- 3.5 Synchronize learn skills only when p_learn_skills is explicitly provided (not null)
  IF p_learn_skills IS NOT NULL THEN
    DELETE FROM public.user_skills us
    USING public.skills s
    WHERE us.user_id = p_user_id
      AND us.kind = 'wanted'
      AND us.skill_id = s.id
      AND NOT EXISTS (
        SELECT 1 FROM unnest(p_learn_skills) item
        WHERE lower(btrim(item)) = lower(s.name)
      );

    FOR v_skill_name IN
      SELECT min(btrim(item))
      FROM unnest(p_learn_skills) item
      WHERE char_length(btrim(item)) BETWEEN 1 AND 60
      GROUP BY lower(btrim(item))
    LOOP
      PERFORM pg_advisory_xact_lock(hashtext('skill:' || lower(v_skill_name)));
      v_skill_id := NULL;
      SELECT id INTO v_skill_id
      FROM public.skills
      WHERE lower(name) = lower(v_skill_name)
      ORDER BY created_at, id
      LIMIT 1;
      IF v_skill_id IS NULL THEN
        INSERT INTO public.skills(name, category)
        VALUES (v_skill_name, 'General')
        ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id INTO v_skill_id;
      END IF;

      INSERT INTO public.user_skills(user_id, skill_id, kind, proficiency)
      VALUES (p_user_id, v_skill_id, 'wanted', 1)
      ON CONFLICT (user_id, skill_id, kind) DO NOTHING;
    END LOOP;
  END IF;

  -- 3.6 Recompute completeness metrics
  SELECT count(*)::integer INTO v_known_count
  FROM public.user_skills WHERE user_id = p_user_id AND kind = 'known';
  SELECT count(*)::integer INTO v_wanted_count
  FROM public.user_skills WHERE user_id = p_user_id AND kind = 'wanted';
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;

  IF nullif(btrim(v_profile.full_name), '') IS NOT NULL AND lower(btrim(v_profile.full_name)) <> 'new member' THEN v_completed := v_completed + 1; ELSE v_missing := array_append(v_missing, 'full_name'); END IF;
  IF nullif(btrim(v_profile.username), '') IS NOT NULL AND v_profile.username !~ '^user_[0-9a-f]{10}$' THEN v_completed := v_completed + 1; ELSE v_missing := array_append(v_missing, 'username'); END IF;
  IF nullif(btrim(v_profile.university), '') IS NOT NULL THEN v_completed := v_completed + 1; ELSE v_missing := array_append(v_missing, 'university'); END IF;
  IF nullif(btrim(v_profile.department), '') IS NOT NULL THEN v_completed := v_completed + 1; ELSE v_missing := array_append(v_missing, 'department'); END IF;
  IF v_profile.study_mode_preference IS NOT NULL THEN v_completed := v_completed + 1; ELSE v_missing := array_append(v_missing, 'study_mode_preference'); END IF;
  IF v_known_count > 0 THEN v_completed := v_completed + 1; ELSE v_missing := array_append(v_missing, 'teach_skills'); END IF;
  IF v_wanted_count > 0 THEN v_completed := v_completed + 1; ELSE v_missing := array_append(v_missing, 'learn_skills'); END IF;

  v_percent := round((v_completed::numeric / 7::numeric) * 100)::integer;

  UPDATE public.profiles
  SET profile_completion_percent = v_percent,
      profile_missing_fields = v_missing,
      onboarding_status = CASE
        WHEN v_was_completed THEN CASE WHEN v_existing_status = 'skipped' THEN 'skipped' ELSE 'completed' END
        WHEN v_requested_status IN ('completed', 'skipped')
          AND p_profile->>'onboarding_step' = 'completed'
          AND nullif(btrim(v_profile.full_name), '') IS NOT NULL AND lower(btrim(v_profile.full_name)) <> 'new member'
          AND nullif(btrim(v_profile.username), '') IS NOT NULL AND v_profile.username !~ '^user_[0-9a-f]{10}$'
          THEN v_requested_status
        WHEN v_requested_status IN ('not_started', 'in_progress') THEN v_requested_status
        ELSE onboarding_status
      END,
      onboarding_completed = CASE
        WHEN v_was_completed THEN true
        WHEN v_requested_status IN ('completed', 'skipped')
          AND p_profile->>'onboarding_step' = 'completed'
          AND nullif(btrim(v_profile.full_name), '') IS NOT NULL AND lower(btrim(v_profile.full_name)) <> 'new member'
          AND nullif(btrim(v_profile.username), '') IS NOT NULL AND v_profile.username !~ '^user_[0-9a-f]{10}$'
          THEN true
        WHEN v_requested_status IN ('not_started', 'in_progress') THEN false
        ELSE onboarding_completed
      END,
      updated_at = now()
  WHERE id = p_user_id
  RETURNING * INTO v_profile;

  RETURN jsonb_build_object(
    'profile', to_jsonb(v_profile),
    'completion_percent', v_percent,
    'missing_fields', to_jsonb(v_missing),
    'skills_known', (
      SELECT coalesce(jsonb_agg(s.name ORDER BY s.name), '[]'::jsonb)
      FROM public.user_skills us JOIN public.skills s ON s.id = us.skill_id
      WHERE us.user_id = p_user_id AND us.kind = 'known'
    ),
    'skills_wanted', (
      SELECT coalesce(jsonb_agg(s.name ORDER BY s.name), '[]'::jsonb)
      FROM public.user_skills us JOIN public.skills s ON s.id = us.skill_id
      WHERE us.user_id = p_user_id AND us.kind = 'wanted'
    )
  );
END;
$$;

-- 4. Set secure RPC permissions
REVOKE ALL ON FUNCTION public.save_onboarding_progress_atomic(uuid, jsonb, text[], text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_onboarding_progress_atomic(uuid, jsonb, text[], text[]) TO service_role;

-- 5. Safe idempotent repair of existing auth users without a profile row
INSERT INTO public.profiles (
  id,
  full_name,
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
SELECT
  u.id,
  coalesce(nullif(btrim(u.raw_user_meta_data->>'full_name'), ''), 'New member'),
  'user_' || substr(replace(u.id::text, '-', ''), 1, 10),
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
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

COMMIT;
