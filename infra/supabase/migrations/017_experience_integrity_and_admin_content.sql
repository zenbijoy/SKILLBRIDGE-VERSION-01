-- 017_experience_integrity_and_admin_content.sql
-- Forward-only corrections for the experience-expansion implementation.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS study_mode_preference text NOT NULL DEFAULT 'hybrid'
    CHECK (study_mode_preference IN ('online', 'offline', 'hybrid')),
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_mission text NOT NULL DEFAULT 'both'
    CHECK (onboarding_mission IN ('learn', 'teach', 'both', 'research')),
  ADD COLUMN IF NOT EXISTS onboarding_push_opt_in boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Dhaka';

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS is_dismissible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS target_roles text[] NOT NULL DEFAULT ARRAY['student', 'tutor', 'peer_tutor', 'club_admin', 'researcher', 'moderator', 'admin']::text[],
  ADD COLUMN IF NOT EXISTS target_campus text;

ALTER TABLE public.dashboard_configs
  ALTER COLUMN target_roles SET DEFAULT ARRAY['student', 'tutor', 'peer_tutor', 'club_admin', 'researcher', 'moderator', 'admin']::text[];
ALTER TABLE public.feature_flags
  ALTER COLUMN target_roles SET DEFAULT ARRAY['student', 'tutor', 'peer_tutor', 'club_admin', 'researcher', 'moderator', 'admin']::text[];
ALTER TABLE public.announcements
  ALTER COLUMN target_roles SET DEFAULT ARRAY['student', 'tutor', 'peer_tutor', 'club_admin', 'researcher', 'moderator', 'admin']::text[];

UPDATE public.dashboard_configs
SET target_roles = coalesce(
  nullif(ARRAY(SELECT role FROM unnest(dashboard_configs.target_roles) AS role WHERE role = ANY(ARRAY['student', 'tutor', 'peer_tutor', 'club_admin', 'researcher', 'moderator', 'admin']::text[])), ARRAY[]::text[]),
  ARRAY['student', 'tutor', 'peer_tutor', 'club_admin', 'researcher', 'moderator', 'admin']::text[]
)
WHERE target_roles IS NOT NULL;
UPDATE public.feature_flags
SET target_roles = coalesce(
  nullif(ARRAY(SELECT role FROM unnest(feature_flags.target_roles) AS role WHERE role = ANY(ARRAY['student', 'tutor', 'peer_tutor', 'club_admin', 'researcher', 'moderator', 'admin']::text[])), ARRAY[]::text[]),
  ARRAY['student', 'tutor', 'peer_tutor', 'club_admin', 'researcher', 'moderator', 'admin']::text[]
)
WHERE target_roles IS NOT NULL;
UPDATE public.announcements
SET target_roles = coalesce(
  nullif(ARRAY(SELECT role FROM unnest(announcements.target_roles) AS role WHERE role = ANY(ARRAY['student', 'tutor', 'peer_tutor', 'club_admin', 'researcher', 'moderator', 'admin']::text[])), ARRAY[]::text[]),
  ARRAY['student', 'tutor', 'peer_tutor', 'club_admin', 'researcher', 'moderator', 'admin']::text[]
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dashboard_configs_target_roles_valid' AND conrelid = 'public.dashboard_configs'::regclass) THEN
    ALTER TABLE public.dashboard_configs ADD CONSTRAINT dashboard_configs_target_roles_valid
      CHECK (target_roles IS NULL OR (cardinality(target_roles) > 0 AND target_roles <@ ARRAY['student', 'tutor', 'peer_tutor', 'club_admin', 'researcher', 'moderator', 'admin']::text[]));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feature_flags_target_roles_valid' AND conrelid = 'public.feature_flags'::regclass) THEN
    ALTER TABLE public.feature_flags ADD CONSTRAINT feature_flags_target_roles_valid
      CHECK (target_roles IS NULL OR (cardinality(target_roles) > 0 AND target_roles <@ ARRAY['student', 'tutor', 'peer_tutor', 'club_admin', 'researcher', 'moderator', 'admin']::text[]));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'announcements_target_roles_valid' AND conrelid = 'public.announcements'::regclass) THEN
    ALTER TABLE public.announcements ADD CONSTRAINT announcements_target_roles_valid
      CHECK (cardinality(target_roles) > 0 AND target_roles <@ ARRAY['student', 'tutor', 'peer_tutor', 'club_admin', 'researcher', 'moderator', 'admin']::text[]);
  END IF;
END;
$$;

UPDATE public.announcements
SET ends_at = NULL
WHERE ends_at IS NOT NULL AND ends_at <= starts_at;
UPDATE public.announcements
SET action_url = NULL,
    action_label_en = NULL,
    action_label_bn = NULL
WHERE action_url IS NOT NULL
  AND NOT ((left(action_url, 1) = '/' AND left(action_url, 2) <> '//') OR left(action_url, 8) = 'https://');
UPDATE public.announcements
SET action_label_en = coalesce(action_label_en, title_en),
    action_label_bn = coalesce(action_label_bn, title_bn)
WHERE action_url IS NOT NULL;
UPDATE public.announcements
SET action_label_en = NULL,
    action_label_bn = NULL
WHERE action_url IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'announcements_time_order'
      AND conrelid = 'public.announcements'::regclass
  ) THEN
    ALTER TABLE public.announcements
      ADD CONSTRAINT announcements_time_order CHECK (ends_at IS NULL OR ends_at > starts_at);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'announcements_action_complete'
      AND conrelid = 'public.announcements'::regclass
  ) THEN
    ALTER TABLE public.announcements
      ADD CONSTRAINT announcements_action_complete CHECK (
        (action_url IS NULL AND action_label_en IS NULL AND action_label_bn IS NULL)
        OR (action_url IS NOT NULL AND action_label_en IS NOT NULL AND action_label_bn IS NOT NULL)
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'announcements_action_url_safe'
      AND conrelid = 'public.announcements'::regclass
  ) THEN
    ALTER TABLE public.announcements
      ADD CONSTRAINT announcements_action_url_safe CHECK (
        action_url IS NULL
        OR (left(action_url, 1) = '/' AND left(action_url, 2) <> '//')
        OR left(action_url, 8) = 'https://'
      );
  END IF;
END;
$$;

UPDATE public.profiles
SET onboarding_completed = onboarding_status IN ('completed', 'skipped')
WHERE onboarding_completed IS DISTINCT FROM (onboarding_status IN ('completed', 'skipped'));

CREATE TABLE IF NOT EXISTS public.announcement_dismissals (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, announcement_id)
);

CREATE TABLE IF NOT EXISTS public.experience_content_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type text NOT NULL CHECK (content_type IN ('welcome', 'onboarding', 'tour')),
  locale text NOT NULL CHECK (locale IN ('en', 'bn')),
  version integer NOT NULL CHECK (version > 0),
  content jsonb NOT NULL CHECK (jsonb_typeof(content) IN ('array', 'object')),
  is_active boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_type, locale, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS experience_content_sets_one_active
  ON public.experience_content_sets(content_type, locale)
  WHERE is_active;

ALTER TABLE public.announcement_dismissals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experience_content_sets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS announcement_dismissals_self_read ON public.announcement_dismissals;
CREATE POLICY announcement_dismissals_self_read
  ON public.announcement_dismissals FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS experience_content_sets_active_read ON public.experience_content_sets;
CREATE POLICY experience_content_sets_active_read
  ON public.experience_content_sets FOR SELECT
  USING (is_active);

DROP POLICY IF EXISTS "Anyone can read active announcements" ON public.announcements;
CREATE POLICY "Anyone can read active announcements"
  ON public.announcements FOR SELECT
  USING (
    is_active = true
    AND starts_at <= now()
    AND (ends_at IS NULL OR ends_at > now())
  );

-- Experience mutations are backend-only. RLS is defense in depth, not the
-- authorization boundary for service-role API calls.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.user_dashboard_layouts FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.announcement_dismissals FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.experience_content_sets FROM anon, authenticated;
REVOKE SELECT ON TABLE public.dashboard_configs FROM anon, authenticated;
REVOKE SELECT ON TABLE public.feature_flags FROM anon, authenticated;
REVOKE SELECT ON TABLE public.announcements FROM anon, authenticated;

DROP POLICY IF EXISTS "Users can update own layout" ON public.user_dashboard_layouts;
DROP POLICY IF EXISTS "Anyone can read feature flags" ON public.feature_flags;

INSERT INTO public.feature_flags (key, description, is_enabled, rollout_percentage)
VALUES
  ('dashboard_customization', 'Allow users to customize dashboard widgets and density.', true, 100),
  ('guided_tour', 'Enable the versioned guided product tour.', true, 100),
  ('progressive_onboarding', 'Enable resumable progressive onboarding.', true, 100)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.experience_content_sets (content_type, locale, version, content)
VALUES
  (
    'welcome',
    'en',
    1,
    '[{"id":"discover","title":"Your learning journey, your way","body":"Discover campus skills, study rooms, mentors, and research opportunities."},{"id":"connect","title":"Learn better, together","body":"Connect with peers, chat in groups, and join live classes."},{"id":"level_up","title":"Turn progress into momentum","body":"Earn verified badges, build reputation, and climb the leaderboard."},{"id":"launch","title":"Launch your SkillBridge journey","body":"Build a trusted skill passport and reach your academic goals."}]'::jsonb
  ),
  (
    'welcome',
    'bn',
    1,
    '[{"id":"discover","title":"আপনার শেখার যাত্রা, আপনার মতো করে","body":"ক্যাম্পাসের স্কিল, স্টাডি রুম, মেন্টর ও গবেষণার সুযোগ খুঁজুন।"},{"id":"connect","title":"একসাথে শিখুন, আরও ভালোভাবে","body":"সহপাঠীদের সাথে যুক্ত হোন, গ্রুপে চ্যাট করুন এবং লাইভ ক্লাসে যোগ দিন।"},{"id":"level_up","title":"অগ্রগতিকে শক্তিতে পরিণত করুন","body":"ভেরিফায়েড ব্যাজ অর্জন করুন, রেপুটেশন গড়ুন এবং লিডারবোর্ডে এগিয়ে যান।"},{"id":"launch","title":"SkillBridge যাত্রা শুরু করুন","body":"একটি বিশ্বস্ত স্কিল পাসপোর্ট তৈরি করে একাডেমিক লক্ষ্য অর্জন করুন।"}]'::jsonb
  ),
  (
    'onboarding',
    'en',
    1,
    '{"language":{"title":"Language & region","body":"Choose your app language and confirm your timezone."},"identity":{"title":"Your identity","body":"Set your display name and a unique username."},"academic":{"title":"Academic profile","body":"Add your university, department, and batch."},"mission":{"title":"Learning mission","body":"Tell us how you plan to use SkillBridge."},"skills":{"title":"Skills & expertise","body":"Choose what you can teach and what you want to learn."},"preferences":{"title":"Study preferences","body":"Choose online, offline, or hybrid collaboration."},"privacy":{"title":"Privacy & safety","body":"Control who can discover your profile."},"notifications":{"title":"Notification alerts","body":"Choose whether to receive study-room and live-class alerts."},"review":{"title":"Review & launch","body":"Confirm your details and enter SkillBridge."}}'::jsonb
  ),
  (
    'onboarding',
    'bn',
    1,
    '{"language":{"title":"ভাষা ও অঞ্চল","body":"অ্যাপের ভাষা বেছে নিয়ে টাইমজোন নিশ্চিত করুন।"},"identity":{"title":"আপনার পরিচয়","body":"পূর্ণ নাম ও একটি অনন্য ইউজারনেম নির্ধারণ করুন।"},"academic":{"title":"একাডেমিক প্রোফাইল","body":"বিশ্ববিদ্যালয়, বিভাগ ও ব্যাচ যোগ করুন।"},"mission":{"title":"শেখার উদ্দেশ্য","body":"SkillBridge কীভাবে ব্যবহার করতে চান তা জানান।"},"skills":{"title":"স্কিল ও দক্ষতা","body":"যা শেখাতে পারেন এবং যা শিখতে চান তা বেছে নিন।"},"preferences":{"title":"পড়ার ধরন","body":"অনলাইন, অফলাইন বা হাইব্রিড মাধ্যম বেছে নিন।"},"privacy":{"title":"প্রাইভেসি ও নিরাপত্তা","body":"কারা আপনার প্রোফাইল খুঁজে পাবে তা নিয়ন্ত্রণ করুন।"},"notifications":{"title":"নোটিফিকেশন সতর্কতা","body":"স্টাডি রুম ও লাইভ ক্লাসের সতর্কতা বেছে নিন।"},"review":{"title":"পর্যালোচনা ও শুরু","body":"তথ্য নিশ্চিত করে SkillBridge শুরু করুন।"}}'::jsonb
  ),
  (
    'tour',
    'en',
    1,
    '[{"id":"dashboard","route":"/(tabs)","title":"Dynamic dashboard","body":"Reorder widgets and focus the home screen on your goals."},{"id":"search","route":"/search","title":"Universal search","body":"Find peers, rooms, events, skills, and research."},{"id":"rooms","route":"/rooms","title":"Study rooms","body":"Learn in groups and join live sessions."},{"id":"chat","route":"/(tabs)/inbox","title":"Persistent chat","body":"Message peers and stay connected when your network is unreliable."},{"id":"livekit","route":"/schedule","title":"Live classrooms","body":"Join video classes and participate with role-aware controls."},{"id":"quests","route":"/leaderboard","title":"Quests and leaderboards","body":"Build verified skills and reputation through real activity."},{"id":"settings","route":"/settings","title":"Settings and replay","body":"Adjust the app and replay this tour whenever you need it."}]'::jsonb
  ),
  (
    'tour',
    'bn',
    1,
    '[{"id":"dashboard","route":"/(tabs)","title":"ডাইনামিক ড্যাশবোর্ড","body":"নিজের লক্ষ্য অনুযায়ী হোম স্ক্রিনের উইজেট সাজান।"},{"id":"search","route":"/search","title":"সার্বজনীন অনুসন্ধান","body":"সহপাঠী, রুম, ইভেন্ট, স্কিল ও গবেষণা খুঁজুন।"},{"id":"rooms","route":"/rooms","title":"স্টাডি রুম","body":"গ্রুপে শিখুন এবং লাইভ সেশনে যোগ দিন।"},{"id":"chat","route":"/(tabs)/inbox","title":"নিরবচ্ছিন্ন চ্যাট","body":"দুর্বল নেটওয়ার্কেও সহপাঠীদের সাথে যুক্ত থাকুন।"},{"id":"livekit","route":"/schedule","title":"লাইভ ক্লাসরুম","body":"ভিডিও ক্লাসে যোগ দিয়ে ভূমিকা অনুযায়ী অংশ নিন।"},{"id":"quests","route":"/leaderboard","title":"কোয়েস্ট ও লিডারবোর্ড","body":"বাস্তব কার্যক্রমে ভেরিফায়েড স্কিল ও রেপুটেশন গড়ুন।"},{"id":"settings","route":"/settings","title":"সেটিংস ও রিপ্লে","body":"অ্যাপ নিজের মতো সাজান এবং প্রয়োজন হলে ট্যুর আবার দেখুন।"}]'::jsonb
  )
ON CONFLICT (content_type, locale, version) DO NOTHING;

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
BEGIN
  IF p_profile IS NULL OR jsonb_typeof(p_profile) <> 'object' THEN
    RAISE EXCEPTION 'Profile payload must be a JSON object';
  END IF;

  SELECT onboarding_completed OR onboarding_status IN ('completed', 'skipped'), onboarding_status
  INTO v_was_completed, v_existing_status
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  v_requested_status := p_profile->>'onboarding_status';

  IF p_profile ? 'username' AND EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE lower(username) = lower(btrim(p_profile->>'username'))
      AND id <> p_user_id
  ) THEN
    RAISE EXCEPTION 'Username is already taken' USING ERRCODE = '23505';
  END IF;

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

CREATE OR REPLACE FUNCTION public.save_notification_preferences_atomic(
  p_user_id uuid,
  p_patch jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_preferences public.notification_preferences%ROWTYPE;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'Preference patch must be a JSON object';
  END IF;
  IF (p_patch ? 'quiet_hours_start' AND (p_patch->>'quiet_hours_start') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
    OR (p_patch ? 'quiet_hours_end' AND (p_patch->>'quiet_hours_end') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') THEN
    RAISE EXCEPTION 'Quiet hours must use HH:MM 24-hour format';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  INSERT INTO public.notification_preferences(
    user_id, messages, connections, rooms, sessions, teaching, system, updated_at
  ) VALUES (
    p_user_id,
    coalesce((p_patch->>'messages')::boolean, true),
    coalesce((p_patch->>'connections')::boolean, true),
    coalesce((p_patch->>'rooms')::boolean, true),
    coalesce((p_patch->>'sessions')::boolean, true),
    coalesce((p_patch->>'teaching')::boolean, true),
    coalesce((p_patch->>'system')::boolean, true),
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    messages = coalesce((p_patch->>'messages')::boolean, public.notification_preferences.messages),
    connections = coalesce((p_patch->>'connections')::boolean, public.notification_preferences.connections),
    rooms = coalesce((p_patch->>'rooms')::boolean, public.notification_preferences.rooms),
    sessions = coalesce((p_patch->>'sessions')::boolean, public.notification_preferences.sessions),
    teaching = coalesce((p_patch->>'teaching')::boolean, public.notification_preferences.teaching),
    system = coalesce((p_patch->>'system')::boolean, public.notification_preferences.system),
    updated_at = now()
  RETURNING * INTO v_preferences;

  UPDATE public.profiles
  SET quiet_hours_start = CASE WHEN p_patch ? 'quiet_hours_start' THEN p_patch->>'quiet_hours_start' ELSE quiet_hours_start END,
      quiet_hours_end = CASE WHEN p_patch ? 'quiet_hours_end' THEN p_patch->>'quiet_hours_end' ELSE quiet_hours_end END,
      onboarding_push_opt_in = CASE WHEN p_patch ? 'push_enabled' THEN (p_patch->>'push_enabled')::boolean ELSE onboarding_push_opt_in END,
      updated_at = now()
  WHERE id = p_user_id
  RETURNING * INTO v_profile;

  RETURN jsonb_build_object(
    'preferences', to_jsonb(v_preferences) - 'user_id' - 'updated_at',
    'quietHours', jsonb_build_object(
      'start', v_profile.quiet_hours_start,
      'end', v_profile.quiet_hours_end,
      'timezone', v_profile.timezone
    ),
    'onboardingPushOptIn', v_profile.onboarding_push_opt_in
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_guided_tour_step_atomic(
  p_user_id uuid,
  p_step text,
  p_is_last boolean,
  p_version integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_reward jsonb;
BEGIN
  IF p_version < 1 THEN
    RAISE EXCEPTION 'Invalid guided tour version';
  END IF;

  IF p_is_last THEN
    v_status := 'completed';
    v_reward := public.award_reputation_atomic(p_user_id, 'tour_completed', 5, 'tour', p_user_id);
  ELSE
    v_status := 'in_progress';
  END IF;

  UPDATE public.profiles
  SET guided_tour_version = p_version,
      guided_tour_last_step = p_step,
      guided_tour_status = v_status,
      updated_at = now()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  RETURN jsonb_build_object('step', p_step, 'status', v_status, 'version', p_version, 'reward', v_reward);
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_experience_content_atomic(
  p_actor_id uuid,
  p_content_type text,
  p_locale text,
  p_content jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version integer;
  v_row public.experience_content_sets%ROWTYPE;
BEGIN
  IF p_content_type NOT IN ('welcome', 'onboarding', 'tour') THEN
    RAISE EXCEPTION 'Invalid content type';
  END IF;
  IF p_locale NOT IN ('en', 'bn') THEN
    RAISE EXCEPTION 'Invalid locale';
  END IF;
  IF p_content IS NULL OR jsonb_typeof(p_content) NOT IN ('array', 'object') THEN
    RAISE EXCEPTION 'Content must be a JSON array or object';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_content_type || ':' || p_locale));
  SELECT coalesce(max(version), 0) + 1 INTO v_version
  FROM public.experience_content_sets
  WHERE content_type = p_content_type AND locale = p_locale;

  UPDATE public.experience_content_sets
  SET is_active = false, updated_at = now()
  WHERE content_type = p_content_type AND locale = p_locale AND is_active;

  INSERT INTO public.experience_content_sets(content_type, locale, version, content, is_active, updated_by)
  VALUES (p_content_type, p_locale, v_version, p_content, true, p_actor_id)
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE ALL ON FUNCTION public.save_onboarding_progress_atomic(uuid, jsonb, text[], text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_onboarding_progress_atomic(uuid, jsonb, text[], text[]) TO service_role;

REVOKE ALL ON FUNCTION public.save_notification_preferences_atomic(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_notification_preferences_atomic(uuid, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.complete_guided_tour_step_atomic(uuid, text, boolean, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_guided_tour_step_atomic(uuid, text, boolean, integer) TO service_role;

REVOKE ALL ON FUNCTION public.publish_experience_content_atomic(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_experience_content_atomic(uuid, text, text, jsonb) TO service_role;

COMMIT;
