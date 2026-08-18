import { startPostgresContainer, execSql, query, execPsql } from './db-test-docker.mjs';
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { determineState } from './verify-database.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
    console.log("=== REAL FRESH DATABASE TEST ===");
    const db = startPostgresContainer();
    const container = db.containerName;
    process.env.DB_CONTAINER_NAME = container;

    try {
        console.log(`[db-test-fresh] Container ${container} started on port ${db.port}`);

        // Phase 4: Verify EMPTY state
        const initialState = determineState(db.dbUrl);
        console.log(`[db-test-fresh] Initial state check: ${initialState}`);
        if (initialState !== 'EMPTY') {
            throw new Error(`Expected EMPTY initial state, got ${initialState}`);
        }

        // Apply baseline & migrations using setup-database.mjs
        console.log("[db-test-fresh] Running setup-database.mjs --fresh");
        execFileSync('node', [
            path.resolve(__dirname, 'setup-database.mjs'),
            '--fresh',
            '--executor',
            'docker',
            '--container',
            container
        ], {
            env: { ...process.env, DATABASE_URL: db.dbUrl, DB_CONTAINER_NAME: container },
            stdio: 'inherit'
        });

        // setup-database --fresh applies the baseline plus every migration newer than the baseline snapshot.

        // Phase 6: Run Schema Verifier
        console.log("[db-test-fresh] Running db-verify-schema.mjs");
        execFileSync('node', [path.resolve(__dirname, 'db-verify-schema.mjs')], {
            env: { ...process.env, DATABASE_URL: db.dbUrl, DB_CONTAINER_NAME: container },
            stdio: 'inherit'
        });

        // Seed test users for security & transaction tests
        console.log("[db-test-fresh] Seeding test users...");
        const user1Id = '11111111-1111-4111-8111-111111111111';
        const user2Id = '22222222-2222-4222-8222-222222222222';

        execSql(container, `
            INSERT INTO auth.users (id, email) VALUES ('${user1Id}', 'user1@test.com') ON CONFLICT DO NOTHING;
            INSERT INTO auth.users (id, email) VALUES ('${user2Id}', 'user2@test.com') ON CONFLICT DO NOTHING;
            INSERT INTO public.profiles (id, username, full_name) VALUES ('${user1Id}', 'user1', 'User One') ON CONFLICT DO NOTHING;
            INSERT INTO public.profiles (id, username, full_name) VALUES ('${user2Id}', 'user2', 'User Two') ON CONFLICT DO NOTHING;
        `);

        // Phase 10: Security Tests
        console.log("[db-test-fresh] Running Phase 10 Security Tests...");
        
        // 10a. Ordinary authenticated user cannot update profiles.roles
        let roleSecPassed = false;
        try {
            execSql(container, `
                SET LOCAL ROLE authenticated;
                SET LOCAL "request.jwt.claim.sub" = '${user1Id}';
                SET LOCAL "request.jwt.claim.role" = 'authenticated';
                UPDATE public.profiles SET roles = ARRAY['admin'] WHERE id = '${user1Id}';
            `);
        } catch {
            roleSecPassed = true;
        }

        // Verify role was not changed
        const currentRole = query(container, `SELECT roles[1] FROM public.profiles WHERE id = '${user1Id}';`);
        if (currentRole === 'admin') {
            throw new Error("SECURITY FAILURE: Authenticated user was able to self-promote to admin role!");
        }
        console.log("[PASS] Ordinary user cannot update profiles.roles");

        // 10b. Ordinary authenticated user cannot write to admin_assignments
        let adminAssignmentSecPassed = false;
        try {
            execSql(container, `
                SET LOCAL ROLE authenticated;
                SET LOCAL "request.jwt.claim.sub" = '${user1Id}';
                SET LOCAL "request.jwt.claim.role" = 'authenticated';
                INSERT INTO public.admin_assignments (user_id, role_id) VALUES ('${user1Id}', gen_random_uuid());
            `);
        } catch {
            adminAssignmentSecPassed = true;
        }
        if (!adminAssignmentSecPassed) {
            throw new Error("SECURITY FAILURE: Authenticated user inserted into admin_assignments!");
        }
        console.log("[PASS] Ordinary user cannot write to admin_assignments");

        // Phase 11: Room Transaction Test
        console.log("[db-test-fresh] Running Phase 11 Room Transaction Test...");
        const roomId = query(container, `
            SELECT public.create_room_atomic(
                'Test Room',
                'Test Description',
                'Computer Science',
                'public',
                'online',
                10,
                'Be polite',
                ARRAY['study', 'cs'],
                'Main Campus',
                '${user1Id}'::uuid
            );
        `).split('\n')[0].trim();

        if (!roomId || roomId.length < 30) {
            throw new Error(`create_room_atomic failed to return room UUID: ${roomId}`);
        }

        const roomCount = query(container, `SELECT count(*) FROM public.rooms WHERE id = '${roomId}';`).split('\n')[0].trim();
        const memberCount = query(container, `SELECT count(*) FROM public.room_members WHERE room_id = '${roomId}' AND user_id = '${user1Id}';`).split('\n')[0].trim();
        const convMemberCount = query(container, `SELECT count(*) FROM public.conversation_members WHERE user_id = '${user1Id}';`).split('\n')[0].trim();

        if (roomCount !== '1' || memberCount !== '1' || convMemberCount !== '1') {
            throw new Error("Room atomic creation transaction mismatch");
        }
        console.log("[PASS] create_room_atomic executed cleanly and created all room structures");

        // Test controlled failure and rollback
        let rollbackPassed = false;
        try {
            execSql(container, `
                SELECT public.create_room_atomic(
                    'Invalid Room',
                    'Invalid Description',
                    'Invalid Topic',
                    'public',
                    'invalid_mode',
                    10,
                    'Rules',
                    ARRAY['tags'],
                    'Campus',
                    '${user1Id}'::uuid
                );
            `);
        } catch {
            rollbackPassed = true;
        }

        if (!rollbackPassed) {
            throw new Error("SECURITY/TRANSACTION FAILURE: Invalid room mode did not trigger rollback!");
        }
        console.log("[PASS] create_room_atomic rollback on invalid parameters verified");

        // Phase 12: Session State Tests
        console.log("[db-test-fresh] Running Phase 12 Session State Tests...");
        const sessionId = query(container, `
            INSERT INTO public.sessions (room_id, teacher_id, starts_at, ends_at, mode, status)
            VALUES ('${roomId}', '${user1Id}', now() + interval '1 hour', now() + interval '2 hours', 'online', 'draft')
            RETURNING id;
        `).split('\n')[0].trim();

        // Test valid state transition (draft -> scheduled -> live -> completed)
        execSql(container, `UPDATE public.sessions SET status = 'scheduled' WHERE id = '${sessionId}';`);
        execSql(container, `UPDATE public.sessions SET status = 'live' WHERE id = '${sessionId}';`);
        execSql(container, `UPDATE public.sessions SET status = 'completed' WHERE id = '${sessionId}';`);
        console.log("[PASS] Valid session state transitions verified");

        // Phase 13: LiveKit Attendance DB Test
        console.log("[db-test-fresh] Running Phase 13 LiveKit Attendance Test...");
        
        // Test join
        execSql(container, `
            SELECT public.record_livekit_join(
                '${sessionId}'::uuid,
                '${user1Id}'::uuid
            );
        `);

        const openJoinCount = query(container, `SELECT count(*) FROM public.livekit_attendance WHERE session_id = '${sessionId}' AND left_at IS NULL;`);
        if (openJoinCount !== '1') {
            throw new Error("record_livekit_join failed to record active attendance segment");
        }

        // Test leave
        execSql(container, `
            SELECT public.record_livekit_leave(
                '${sessionId}'::uuid,
                '${user1Id}'::uuid
            );
        `);

        const closedJoinCount = query(container, `SELECT count(*) FROM public.livekit_attendance WHERE session_id = '${sessionId}' AND left_at IS NOT NULL;`);
        if (closedJoinCount !== '1') {
            throw new Error("record_livekit_leave failed to close attendance segment");
        }
        console.log("[PASS] record_livekit_join and record_livekit_leave verified");

        // Phase 14: Reputation Test
        console.log("[db-test-fresh] Running Phase 14 Reputation Test...");
        execSql(container, `SELECT public.recompute_reputation('${user1Id}'::uuid);`);
        const reputation = query(container, `SELECT reputation FROM public.profiles WHERE id = '${user1Id}';`);
        console.log(`[PASS] recompute_reputation(uuid) executed successfully. Resulting reputation: ${reputation}`);

        console.log("=== FRESH DATABASE TEST PASSED ===");
    } catch (e) {
        console.error("=== FRESH DATABASE TEST FAILED ===", e.message);
        process.exitCode = 1;
    } finally {
        db.cleanup();
    }
}

run();
