import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../");
const migrationsDir = path.join(rootDir, "infra/supabase/migrations");
const baselineFile = path.join(rootDir, "infra/supabase/baseline/001_skillbridge_baseline.sql");

// Helper to prepare SQL for PGlite in-process Postgres
function sanitizeSql(rawSql: string): string {
  return rawSql
    .replace(/create extension if not exists pgcrypto;/gi, "-- pgcrypto built-in")
    .replace(/create extension if not exists pg_trgm;/gi, "-- pg_trgm")
    .replace(/using\s+gin\s*\(([^)]+)\s+gin_trgm_ops\)/gi, "using btree ($1)");
}

// Helper to setup mock Supabase environment in real PostgreSQL
async function setupPostgresEnv(db: PGlite) {
  await db.exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
    END $$;

    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text,
      raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
      created_at timestamptz DEFAULT now()
    );

    CREATE SCHEMA IF NOT EXISTS storage;
    CREATE TABLE IF NOT EXISTS storage.buckets (
      id text PRIMARY KEY,
      name text NOT NULL,
      owner uuid,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      public boolean DEFAULT false,
      avif_autodetection boolean DEFAULT false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    CREATE TABLE IF NOT EXISTS storage.objects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      bucket_id text REFERENCES storage.buckets(id),
      name text,
      owner uuid,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      last_accessed_at timestamptz DEFAULT now(),
      metadata jsonb,
      path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/')) STORED
    );

    CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
      SELECT string_to_array(name, '/');
    $$;
    CREATE OR REPLACE FUNCTION storage.filename(name text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
      SELECT split_part(name, '/', array_length(string_to_array(name, '/'), 1));
    $$;
    CREATE OR REPLACE FUNCTION storage.extension(name text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
      SELECT split_part(name, '.', array_length(string_to_array(name, '.'), 1));
    $$;

    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;

    CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
      SELECT coalesce(current_setting('request.jwt.claim.role', true), 'anon');
    $$;
  `);
}

test("SkillBridge V3 Real PostgreSQL Integration Suite", async (t) => {
  let freshDb: PGlite;
  let upgradedDb: PGlite;

  t.after(async () => {
    await freshDb?.close();
    await upgradedDb?.close();
  });

  await t.test("1. Fresh baseline installation on real PostgreSQL", async () => {
    freshDb = new PGlite();
    await setupPostgresEnv(freshDb);

    const baselineSql = fs.readFileSync(baselineFile, "utf-8");
    await freshDb.exec(sanitizeSql(baselineSql));

    // Verify critical tables exist
    const res = await freshDb.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    const tables = new Set(res.rows.map((r: any) => r.table_name));

    assert.ok(tables.has("profiles"), "profiles table exists");
    assert.ok(tables.has("rooms"), "rooms table exists");
    assert.ok(tables.has("room_members"), "room_members table exists");
    assert.ok(tables.has("room_invitations"), "room_invitations table exists");
    assert.ok(tables.has("points_ledger"), "points_ledger table exists");
    assert.ok(tables.has("audit_logs"), "audit_logs table exists");
    assert.ok(tables.has("sessions"), "sessions table exists");
    assert.ok(tables.has("session_participants"), "session_participants table exists");
  });

  await t.test("2. Forward migration 016 → 017 on real PostgreSQL", async () => {
    upgradedDb = new PGlite();
    await setupPostgresEnv(upgradedDb);

    const baselineSql = fs.readFileSync(baselineFile, "utf-8");
    const migrationMarker = baselineSql.indexOf("-- BEGIN MIGRATION 017 BASELINE SYNC");
    assert.ok(migrationMarker > 0, "baseline contains a marked 017 synchronization section");
    const pre017Baseline = baselineSql.slice(0, migrationMarker);
    await upgradedDb.exec(sanitizeSql(pre017Baseline));
    await upgradedDb.exec(`
      INSERT INTO public.announcements(title_en,title_bn,body_en,body_bn,action_url,starts_at,ends_at)
      VALUES ('Legacy notice','Legacy notice BN','Legacy body','Legacy body BN','http://unsafe.example','2026-08-20T10:00:00Z','2026-08-20T09:00:00Z');
      INSERT INTO public.dashboard_configs(widget_key,title_en,title_bn,target_roles)
      VALUES ('legacy_target_fixture','Legacy target','Legacy target BN',ARRAY['unknown_legacy_role']::text[]);
    `);

    const mig017File = path.join(migrationsDir, "017_experience_integrity_and_admin_content.sql");
    const mig017Sql = fs.readFileSync(mig017File, "utf-8");
    await upgradedDb.exec(sanitizeSql(mig017Sql));

    const mig018File = path.join(migrationsDir, "018_learning_growth_hub.sql");
    const mig018Sql = fs.readFileSync(mig018File, "utf-8");
    await upgradedDb.exec(sanitizeSql(mig018Sql));

    await upgradedDb.exec(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO public.schema_migrations(version)
      VALUES ('017_experience_integrity_and_admin_content'), ('018_learning_growth_hub')
      ON CONFLICT DO NOTHING;
    `);

    const res = await upgradedDb.query(`
      SELECT count(*) as count FROM information_schema.tables WHERE table_schema = 'public'
    `);
    assert.ok(Number((res.rows[0] as any).count) >= 18);
    const repairedAnnouncement = await upgradedDb.query(`
      SELECT action_url, action_label_en, action_label_bn, ends_at
      FROM public.announcements WHERE title_en = 'Legacy notice';
    `);
    assert.strictEqual((repairedAnnouncement.rows[0] as any).action_url, null);
    assert.strictEqual((repairedAnnouncement.rows[0] as any).action_label_en, null);
    assert.strictEqual((repairedAnnouncement.rows[0] as any).ends_at, null);
    const repairedAudience = await upgradedDb.query(`SELECT target_roles FROM public.dashboard_configs WHERE widget_key = 'legacy_target_fixture';`);
    assert.ok((repairedAudience.rows[0] as any).target_roles.includes("researcher"));
  });

  await t.test("3. Schema-diff comparison between fresh and upgraded databases", async () => {
    const freshTablesRes = await freshDb.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`);
    const upgTablesRes = await upgradedDb.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`);

    const freshTables = freshTablesRes.rows.map((r: any) => r.table_name);
    const upgTables = upgTablesRes.rows.map((r: any) => r.table_name);

    assert.deepStrictEqual(freshTables, upgTables, "Table sets match exactly between fresh and upgraded installations");

    const schemaQuery = `
      SELECT table_name, column_name, data_type, is_nullable, coalesce(column_default, '') AS column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position;
    `;
    const freshColumns = await freshDb.query(schemaQuery);
    const upgradedColumns = await upgradedDb.query(schemaQuery);
    assert.deepStrictEqual(freshColumns.rows, upgradedColumns.rows, "Column definitions match exactly");

    const functionQuery = `
      SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS arguments,
             pg_get_function_result(p.oid) AS result, p.prosecdef
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
      ORDER BY p.proname, arguments;
    `;
    const freshFunctions = await freshDb.query(functionQuery);
    const upgradedFunctions = await upgradedDb.query(functionQuery);
    assert.deepStrictEqual(freshFunctions.rows, upgradedFunctions.rows, "RPC signatures match exactly");

    const roomRpc = await freshDb.query(`
      SELECT
        to_regprocedure('public.create_room_atomic(text,text,text,text,text,integer,text,text[],text,uuid)') IS NOT NULL AS canonical_exists,
        to_regprocedure('public.create_room_atomic(text,text,text,integer,text,text[],uuid)') IS NULL AS obsolete_removed;
    `);
    assert.deepStrictEqual(roomRpc.rows, [{ canonical_exists: true, obsolete_removed: true }], "room creation exposes only the backend-compatible signature");

    const protectedFunctions = [
      "create_room_atomic",
      "save_user_dashboard_layout_atomic",
      "save_onboarding_progress_atomic",
      "save_notification_preferences_atomic",
      "complete_guided_tour_step_atomic",
      "publish_experience_content_atomic",
    ];
    const privilegeRows = await freshDb.query(`
      SELECT p.proname, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS can_execute
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = ANY($1::text[])
      ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);
    `, [protectedFunctions]);
    assert.ok(privilegeRows.rows.length >= protectedFunctions.length);
    assert.ok(privilegeRows.rows.every((row: any) => row.can_execute === false), "experience mutations are service-role only");
  });

  await t.test("4. Room Invitations Lifecycle & Constraints", async () => {
    const db = freshDb;
    const userA = "11111111-1111-4111-8111-111111111111";
    const userB = "22222222-2222-4222-8222-222222222222";
    const roomId = "33333333-3333-4333-8333-333333333333";

    // Setup profiles and room
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${userA}', 'host@test.com'), ('${userB}', 'invitee@test.com') ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.profiles (id, username, full_name, account_status, profile_visibility)
      VALUES 
        ('${userA}', 'host_user', 'Host User', 'active', 'public'),
        ('${userB}', 'invitee_user', 'Invitee User', 'active', 'public')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.rooms (id, title, topic, description, owner_id, visibility, capacity, member_count, status)
      VALUES ('${roomId}', 'Invite Only Room', 'Calculus', 'Math room', '${userA}', 'invite_only', 10, 1, 'open')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.room_members (room_id, user_id, role)
      VALUES ('${roomId}', '${userA}', 'owner')
      ON CONFLICT (room_id, user_id) DO NOTHING;
    `);

    // 1. Attempt join without invitation -> MUST FAIL
    await assert.rejects(
      async () => {
        await db.query(`SELECT public.join_room_service_atomic('${roomId}'::uuid, '${userB}'::uuid);`);
      },
      /invitation/i
    );

    // 2. Issue invitation
    await db.exec(`
      INSERT INTO public.room_invitations (room_id, inviter_id, invitee_id, status)
      VALUES ('${roomId}', '${userA}', '${userB}', 'pending');
    `);

    // 3. Unique pending invite constraint: Duplicate pending invite -> MUST FAIL
    await assert.rejects(
      async () => {
        await db.exec(`
          INSERT INTO public.room_invitations (room_id, inviter_id, invitee_id, status)
          VALUES ('${roomId}', '${userA}', '${userB}', 'pending');
        `);
      },
      /unique|duplicate/i
    );

    // 4. Now join -> MUST SUCCEED and consume invite
    const joinRes = await db.query(`
      SELECT public.join_room_service_atomic('${roomId}'::uuid, '${userB}'::uuid) as result;
    `);
    const resObj = (joinRes.rows[0] as any).result;
    assert.strictEqual(resObj.joined, true);
    assert.strictEqual(resObj.member_count, 2);

    // 5. Verify room_members role is 'member' (NOT 'learner')
    const memRes = await db.query(`
      SELECT role FROM public.room_members WHERE room_id = '${roomId}' AND user_id = '${userB}';
    `);
    assert.strictEqual((memRes.rows[0] as any).role, "member");

    // 6. Verify invitation was consumed
    const invRes = await db.query(`
      SELECT status FROM public.room_invitations WHERE room_id = '${roomId}' AND invitee_id = '${userB}';
    `);
    assert.strictEqual((invRes.rows[0] as any).status, "consumed");
  });

  await t.test("5. Room Capacity Boundary Enforcement", async () => {
    const db = freshDb;
    const ownerId = "44444444-4444-4444-8444-444444444444";
    const user1 = "55555555-5555-4555-8555-555555555555";
    const user2 = "66666666-6666-4666-8666-666666666666";
    const capRoomId = "77777777-7777-4777-8777-777777777777";

    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${ownerId}', 'owner@test.com'), ('${user1}', 'u1@test.com'), ('${user2}', 'u2@test.com') ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.profiles (id, username, full_name, account_status, profile_visibility)
      VALUES 
        ('${ownerId}', 'cap_owner', 'Cap Owner', 'active', 'public'),
        ('${user1}', 'cap_user1', 'Cap User 1', 'active', 'public'),
        ('${user2}', 'cap_user2', 'Cap User 2', 'active', 'public')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.rooms (id, title, topic, description, owner_id, visibility, capacity, member_count, status)
      VALUES ('${capRoomId}', 'Small Room', 'Physics', '2-person max', '${ownerId}', 'public', 2, 1, 'open')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.room_members (room_id, user_id, role)
      VALUES ('${capRoomId}', '${ownerId}', 'owner')
      ON CONFLICT (room_id, user_id) DO NOTHING;
    `);

    // User 1 joins (now 2/2 full)
    await db.query(`SELECT public.join_room_service_atomic('${capRoomId}'::uuid, '${user1}'::uuid);`);

    // User 2 attempts to join -> MUST FAIL with capacity error
    await assert.rejects(
      async () => {
        await db.query(`SELECT public.join_room_service_atomic('${capRoomId}'::uuid, '${user2}'::uuid);`);
      },
      /capacity/i
    );
  });

  await t.test("6. Idempotent Reputation Rewards & Points Ledger", async () => {
    const db = freshDb;
    const testUser = "88888888-8888-4888-8888-888888888888";
    const quizId = "99999999-9999-4999-8999-999999999999";

    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${testUser}', 'rep@test.com') ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.profiles (id, username, full_name, account_status, profile_visibility, reputation)
      VALUES ('${testUser}', 'rep_user', 'Rep User', 'active', 'public', 0)
      ON CONFLICT (id) DO NOTHING;
    `);

    // Award 15 points
    const res1 = await db.query(`
      SELECT public.award_reputation_atomic('${testUser}'::uuid, 'skill_verified', 15, 'quiz', '${quizId}'::uuid) as result;
    `);
    const obj1 = (res1.rows[0] as any).result;
    assert.strictEqual(obj1.awarded, true);
    assert.strictEqual(obj1.new_reputation, 15);

    // Duplicate award attempt with same reference -> MUST be idempotent (awarded: false)
    const res2 = await db.query(`
      SELECT public.award_reputation_atomic('${testUser}'::uuid, 'skill_verified', 15, 'quiz', '${quizId}'::uuid) as result;
    `);
    const obj2 = (res2.rows[0] as any).result;
    assert.strictEqual(obj2.awarded, false);
    assert.strictEqual(obj2.reason, "already_awarded");
    assert.strictEqual(obj2.reputation, 15);

    // Check profiles table reputation cache matches points_ledger sum
    const profRes = await db.query(`SELECT reputation FROM public.profiles WHERE id = '${testUser}';`);
    assert.strictEqual((profRes.rows[0] as any).reputation, 15);
  });

  await t.test("7. Transactional Admin Moderation & Audit Logging", async () => {
    const db = freshDb;
    const adminUser = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const modUser = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const targetUser = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

    await db.exec(`
      INSERT INTO auth.users (id, email) 
      VALUES ('${adminUser}', 'admin@test.com'), ('${modUser}', 'mod@test.com'), ('${targetUser}', 'bad@test.com') 
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.profiles (id, username, full_name, account_status, roles)
      VALUES 
        ('${adminUser}', 'sys_admin', 'System Admin', 'active', ARRAY['admin']),
        ('${modUser}', 'mod_user', 'Moderator', 'active', ARRAY['moderator']),
        ('${targetUser}', 'bad_actor', 'Bad Actor', 'active', ARRAY['student'])
      ON CONFLICT (id) DO UPDATE SET roles = EXCLUDED.roles, account_status = EXCLUDED.account_status;
    `);

    // Moderator attempts to ban an Admin -> MUST FAIL
    await assert.rejects(
      async () => {
        await db.query(`
          SELECT public.admin_mutate_user_status_atomic(
            '${modUser}'::uuid,
            '${adminUser}'::uuid,
            'banned',
            'Cannot ban admin'
          );
        `);
      },
      /Moderators cannot modify administrator/i
    );

    // Admin bans target user -> MUST SUCCEED and write audit log
    const banRes = await db.query(`
      SELECT public.admin_mutate_user_status_atomic(
        '${adminUser}'::uuid,
        '${targetUser}'::uuid,
        'banned',
        'Spam activity'
      ) as result;
    `);
    const banObj = (banRes.rows[0] as any).result;
    assert.strictEqual(banObj.success, true);
    assert.strictEqual(banObj.status, "banned");

    // Verify audit_logs table received audit entry
    const auditRes = await db.query(`
      SELECT action, actor_id, target_id, metadata 
      FROM public.audit_logs 
      WHERE target_id = '${targetUser}' AND action = 'moderation.user.status';
    `);
    assert.strictEqual(auditRes.rows.length, 1);
    assert.strictEqual((auditRes.rows[0] as any).actor_id, adminUser);
  });

  await t.test("8. Leaderboard Activity Aggregation without Reputation Truncation", async () => {
    const db = freshDb;
    const topTutorLowRep = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const highRepNoTutor = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const sessId = "ffffffff-ffff-4fff-8fff-ffffffffffff";

    await db.exec(`
      INSERT INTO auth.users (id, email) 
      VALUES ('${topTutorLowRep}', 'tutor@test.com'), ('${highRepNoTutor}', 'idle@test.com') 
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.profiles (id, username, full_name, account_status, profile_visibility, reputation)
      VALUES 
        ('${topTutorLowRep}', 'top_tutor', 'Top Tutor', 'active', 'public', 10),
        ('${highRepNoTutor}', 'high_rep', 'High Rep Idle', 'active', 'public', 500)
      ON CONFLICT (id) DO UPDATE SET reputation = EXCLUDED.reputation;

      INSERT INTO public.sessions (id, teacher_id, room_id, status, starts_at, mode)
      VALUES ('${sessId}', '${topTutorLowRep}', (SELECT id FROM public.rooms LIMIT 1), 'completed', now(), 'online')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Query completed sessions taught grouped by teacher
    const tutorLeaderboardRes = await db.query(`
      SELECT s.teacher_id, count(s.id) as sessions_taught, p.username, p.reputation
      FROM public.sessions s
      JOIN public.profiles p ON p.id = s.teacher_id
      WHERE s.status = 'completed' AND p.account_status = 'active'
      GROUP BY s.teacher_id, p.username, p.reputation
      ORDER BY sessions_taught DESC, p.reputation DESC;
    `);

    assert.ok(tutorLeaderboardRes.rows.length >= 1);
    assert.strictEqual((tutorLeaderboardRes.rows[0] as any).teacher_id, topTutorLowRep);
    assert.strictEqual(Number((tutorLeaderboardRes.rows[0] as any).sessions_taught), 1);
  });

  await t.test("9. User Dashboard Layout Atomic Save & Persistence", async () => {
    const db = freshDb;
    const testUser = "11111111-1111-4111-8111-111111111111";

    const customWidgets = JSON.stringify([
      { widget_key: "greeting_hero", visible: true, order: 1 },
      { widget_key: "quick_actions", visible: true, order: 2 },
      { widget_key: "profile_quest", visible: false, order: 3 },
    ]);

    const res = await db.query(`
      SELECT public.save_user_dashboard_layout_atomic(
        '${testUser}'::uuid,
        'learner',
        'compact',
        '${customWidgets}'::jsonb
      ) as result;
    `);

    const resultObj = (res.rows[0] as any).result;
    assert.strictEqual(resultObj.preset, "learner");
    assert.strictEqual(resultObj.density, "compact");
    assert.strictEqual(resultObj.widgets.length, 3);
  });

  await t.test("10. Guided Tour Step Tracking & Idempotent Completion Reward", async () => {
    const db = freshDb;
    const testUser = "22222222-2222-4222-8222-222222222222";

    // Step 1: Intermediate step
    const step1Res = await db.query(`
      SELECT public.complete_guided_tour_step_atomic(
        '${testUser}'::uuid,
        'dashboard_customizer',
        false,
        2
      ) as result;
    `);
    const step1 = (step1Res.rows[0] as any).result;
    assert.strictEqual(step1.status, "in_progress");
    assert.strictEqual(step1.step, "dashboard_customizer");
    assert.strictEqual(step1.version, 2);

    // Step 2: Final step (Awards +5 reputation)
    const stepFinalRes = await db.query(`
      SELECT public.complete_guided_tour_step_atomic(
        '${testUser}'::uuid,
        'finish_tour',
        true,
        2
      ) as result;
    `);
    const stepFinal = (stepFinalRes.rows[0] as any).result;
    assert.strictEqual(stepFinal.status, "completed");
    assert.strictEqual(stepFinal.reward.awarded, true);
    assert.strictEqual(stepFinal.reward.points, 5);

    // Step 3: Replay/Repeat completion -> MUST NOT double-award
    const stepRepeatRes = await db.query(`
      SELECT public.complete_guided_tour_step_atomic(
        '${testUser}'::uuid,
        'finish_tour',
        true,
        2
      ) as result;
    `);
    const stepRepeat = (stepRepeatRes.rows[0] as any).result;
    assert.strictEqual(stepRepeat.status, "completed");
    assert.strictEqual(stepRepeat.reward.awarded, false);
    assert.strictEqual(stepRepeat.reward.reason, "already_awarded");
  });

  await t.test("11. Atomic onboarding save, skill synchronization, and rollback", async () => {
    const db = freshDb;
    const user = "12121212-1212-4212-8212-121212121212";
    const conflictingUser = "13131313-1313-4313-8313-131313131313";
    const placeholderUser = "14141414-1414-4414-8414-141414141414";
    await db.exec(`
      INSERT INTO auth.users(id, email) VALUES
        ('${user}', 'onboarding@test.com'),
        ('${conflictingUser}', 'existing@test.com'),
        ('${placeholderUser}', 'placeholder@test.com');
      INSERT INTO public.profiles(id, username, full_name) VALUES
        ('${user}', 'onboarding_old', 'Onboarding Old'),
        ('${conflictingUser}', 'reserved_name', 'Reserved Name'),
        ('${placeholderUser}', 'user_0123456789', 'New member')
      ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        full_name = EXCLUDED.full_name;
    `);

    const placeholderAttempt = await db.query(`
      SELECT public.save_onboarding_progress_atomic(
        '${placeholderUser}'::uuid,
        '{"university":"SkillBridge University","department":"Computer Science","onboarding_step":"completed","onboarding_status":"completed"}'::jsonb,
        ARRAY['Python']::text[],
        ARRAY['Data Science']::text[]
      ) AS result;
    `);
    assert.strictEqual((placeholderAttempt.rows[0] as any).result.profile.onboarding_completed, false);
    assert.notStrictEqual((placeholderAttempt.rows[0] as any).result.profile.onboarding_status, "completed");
    assert.ok((placeholderAttempt.rows[0] as any).result.missing_fields.includes("full_name"));
    assert.ok((placeholderAttempt.rows[0] as any).result.missing_fields.includes("username"));

    const saved = await db.query(`
      SELECT public.save_onboarding_progress_atomic(
        '${user}'::uuid,
        '{"full_name":"Onboarding User","username":"onboarding_user","university":"SkillBridge University","department":"Computer Science","study_mode_preference":"hybrid","preferred_locale":"bn","onboarding_step":"completed","onboarding_status":"completed","onboarding_version":1}'::jsonb,
        ARRAY['Python','React']::text[],
        ARRAY['Data Science']::text[]
      ) AS result;
    `);
    const savedResult = (saved.rows[0] as any).result;
    assert.strictEqual(savedResult.profile.onboarding_completed, true);
    assert.strictEqual(savedResult.profile.onboarding_status, "completed");
    assert.strictEqual(savedResult.completion_percent, 100);
    assert.deepStrictEqual(savedResult.skills_known, ["Python", "React"]);

    await db.exec(`
      UPDATE public.user_skills SET verified = true
      WHERE user_id = '${user}' AND skill_id = (SELECT id FROM public.skills WHERE name = 'Python') AND kind = 'known';
    `);
    const resaved = await db.query(`
      SELECT public.save_onboarding_progress_atomic(
        '${user}'::uuid,
        '{"onboarding_step":"skills","onboarding_status":"in_progress"}'::jsonb,
        ARRAY['react','TypeScript']::text[],
        NULL
      ) AS result;
    `);
    const known = (resaved.rows[0] as any).result.skills_known as string[];
    assert.ok(known.includes("Python"), "verified skills survive onboarding edits");
    assert.ok(known.includes("React"), "case-insensitive skill matching reuses canonical skill");
    assert.ok(known.includes("TypeScript"));
    assert.strictEqual((resaved.rows[0] as any).result.profile.onboarding_status, "completed", "completed onboarding is not reopened by profile edits");

    await assert.rejects(
      () => db.query(`
        SELECT public.save_onboarding_progress_atomic(
          '${user}'::uuid,
          '{"full_name":"Must Roll Back","username":"reserved_name"}'::jsonb,
          ARRAY['Should Not Persist']::text[],
          NULL
        );
      `),
      /already taken|duplicate/i,
    );
    const rollback = await db.query(`SELECT full_name FROM public.profiles WHERE id = '${user}';`);
    assert.strictEqual((rollback.rows[0] as any).full_name, "Onboarding User");
    const leakedSkill = await db.query(`SELECT count(*)::int AS count FROM public.skills WHERE name = 'Should Not Persist';`);
    assert.strictEqual((leakedSkill.rows[0] as any).count, 0);
  });

  await t.test("12. Atomic notification preferences preserve concurrent fields", async () => {
    const db = freshDb;
    const user = "12121212-1212-4212-8212-121212121212";
    const first = await db.query(`
      SELECT public.save_notification_preferences_atomic(
        '${user}'::uuid,
        '{"messages":false,"quiet_hours_start":"23:30","quiet_hours_end":"06:15","push_enabled":false}'::jsonb
      ) AS result;
    `);
    assert.strictEqual((first.rows[0] as any).result.preferences.messages, false);
    assert.strictEqual((first.rows[0] as any).result.quietHours.start, "23:30");
    assert.strictEqual((first.rows[0] as any).result.onboardingPushOptIn, false);

    const second = await db.query(`
      SELECT public.save_notification_preferences_atomic('${user}'::uuid, '{"rooms":false}'::jsonb) AS result;
    `);
    assert.strictEqual((second.rows[0] as any).result.preferences.messages, false);
    assert.strictEqual((second.rows[0] as any).result.preferences.rooms, false);
  });

  await t.test("13. Versioned experience publishing activates exactly one version", async () => {
    const db = freshDb;
    const actor = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const published = await db.query(`
      SELECT public.publish_experience_content_atomic(
        '${actor}'::uuid,
        'tour',
        'en',
        '[{"id":"new-tour","route":"/(tabs)","title":"New tour","body":"Updated content"}]'::jsonb
      ) AS result;
    `);
    assert.strictEqual((published.rows[0] as any).result.version, 2);
    const active = await db.query(`
      SELECT version FROM public.experience_content_sets
      WHERE content_type = 'tour' AND locale = 'en' AND is_active
      ORDER BY version;
    `);
    assert.deepStrictEqual(active.rows.map((row: any) => row.version), [2]);
  });
});
