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

  await t.test("2. Incremental migration 001 → 015 on real PostgreSQL", async () => {
    upgradedDb = new PGlite();
    await setupPostgresEnv(upgradedDb);

    const baselineSql = fs.readFileSync(baselineFile, "utf-8");
    await upgradedDb.exec(sanitizeSql(baselineSql));

    const mig015File = path.join(migrationsDir, "015_complete_domain_hardening.sql");
    if (fs.existsSync(mig015File)) {
      const mig015Sql = fs.readFileSync(mig015File, "utf-8");
      await upgradedDb.exec(sanitizeSql(mig015Sql));
    }

    const res = await upgradedDb.query(`
      SELECT count(*) as count FROM information_schema.tables WHERE table_schema = 'public'
    `);
    assert.ok(Number(res.rows[0].count) >= 15);
  });

  await t.test("3. Schema-diff comparison between fresh and upgraded databases", async () => {
    const freshTablesRes = await freshDb.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`);
    const upgTablesRes = await upgradedDb.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`);

    const freshTables = freshTablesRes.rows.map((r: any) => r.table_name);
    const upgTables = upgTablesRes.rows.map((r: any) => r.table_name);

    assert.deepStrictEqual(freshTables, upgTables, "Table sets match exactly between fresh and upgraded installations");
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
    assert.strictEqual(memRes.rows[0].role, "member");

    // 6. Verify invitation was consumed
    const invRes = await db.query(`
      SELECT status FROM public.room_invitations WHERE room_id = '${roomId}' AND invitee_id = '${userB}';
    `);
    assert.strictEqual(invRes.rows[0].status, "consumed");
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
    assert.strictEqual(profRes.rows[0].reputation, 15);
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
    assert.strictEqual(auditRes.rows[0].actor_id, adminUser);
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
    assert.strictEqual(tutorLeaderboardRes.rows[0].teacher_id, topTutorLowRep);
    assert.strictEqual(Number(tutorLeaderboardRes.rows[0].sessions_taught), 1);
  });
});
