import { startPostgresContainer, execSql, execSqlFile, query } from './db-test-docker.mjs';
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
    console.log("=== REAL LEGACY UPGRADE DATABASE TEST ===");
    const db = startPostgresContainer();
    const container = db.containerName;
    process.env.DB_CONTAINER_NAME = container;

    try {
        console.log(`[db-test-upgrade] Container ${container} started on port ${db.port}`);

        const migrationsDir = path.resolve(__dirname, '../infra/supabase/migrations');
        const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

        console.log("[db-test-upgrade] Applying initial historical migrations 001-011...");
        for (const file of files) {
            const num = parseInt(file.split('_')[0], 10);
            if (num <= 11) {
                const filePath = path.join(migrationsDir, file);
                console.log(`[db-test-upgrade] Executing legacy ${file}...`);
                execSqlFile(container, filePath, { onErrorStop: false, ignoreError: true });
            }
        }

        // Insert representative legacy data BEFORE 012
        console.log("[db-test-upgrade] Inserting representative legacy data...");
        const legacyUserId = '33333333-3333-4333-8333-333333333333';
        const legacyConvId = '44444444-4444-4444-8444-444444444444';
        const legacyRoomId = '55555555-5555-4555-8555-555555555555';
        const legacySessionId = '66666666-6666-4666-8666-666666666666';

        execSql(container, `
            INSERT INTO auth.users (id, email) VALUES ('${legacyUserId}', 'legacy@test.com') ON CONFLICT DO NOTHING;
            INSERT INTO public.profiles (id, username, full_name) VALUES ('${legacyUserId}', 'legacyuser', 'Legacy User') ON CONFLICT DO NOTHING;
            INSERT INTO public.conversations (id, kind, title, created_by) VALUES ('${legacyConvId}', 'room', 'Legacy Room Conv', '${legacyUserId}') ON CONFLICT DO NOTHING;
            INSERT INTO public.rooms (id, title, description, topic, visibility, mode, capacity, owner_id, conversation_id)
            VALUES ('${legacyRoomId}', 'Legacy Room', 'Legacy Room Description', 'General', 'public', 'online', 20, '${legacyUserId}', '${legacyConvId}') ON CONFLICT DO NOTHING;
            INSERT INTO public.messages (conversation_id, sender_id, body) VALUES ('${legacyConvId}', '${legacyUserId}', 'Legacy message content') ON CONFLICT DO NOTHING;
            INSERT INTO public.sessions (id, room_id, teacher_id, starts_at, ends_at, mode, status)
            VALUES ('${legacySessionId}', '${legacyRoomId}', '${legacyUserId}', now() + interval '1 hour', now() + interval '2 hours', 'online', 'draft') ON CONFLICT DO NOTHING;
        `);

        const initialProfileCount = query(container, `SELECT count(*) FROM public.profiles;`);
        const initialRoomCount = query(container, `SELECT count(*) FROM public.rooms;`);
        console.log(`[db-test-upgrade] Pre-upgrade counts - Profiles: ${initialProfileCount}, Rooms: ${initialRoomCount}`);

        // Run setup-database.mjs --upgrade
        console.log("[db-test-upgrade] Running setup-database.mjs --upgrade");
        execFileSync('node', [
            path.resolve(__dirname, 'setup-database.mjs'),
            '--upgrade',
            '--executor',
            'docker',
            '--container',
            container
        ], {
            env: { ...process.env, DATABASE_URL: db.dbUrl, DB_CONTAINER_NAME: container },
            stdio: 'inherit'
        });

        // setup-database --upgrade applies every required corrective migration itself.

        // Verify schema after upgrade
        console.log("[db-test-upgrade] Running db-verify-schema.mjs");
        execFileSync('node', [path.resolve(__dirname, 'db-verify-schema.mjs')], {
            env: { ...process.env, DATABASE_URL: db.dbUrl, DB_CONTAINER_NAME: container },
            stdio: 'inherit'
        });

        // Verify data preservation
        console.log("[db-test-upgrade] Verifying legacy data preservation...");
        const postProfileCount = query(container, `SELECT count(*) FROM public.profiles;`);
        const postRoomCount = query(container, `SELECT count(*) FROM public.rooms;`);

        if (postProfileCount !== initialProfileCount || postRoomCount !== initialRoomCount) {
            throw new Error(`Data loss detected during upgrade! Pre: profiles=${initialProfileCount}, rooms=${initialRoomCount}. Post: profiles=${postProfileCount}, rooms=${postRoomCount}`);
        }

        // Verify rules column exists on rooms table
        const rulesColumnCheck = query(container, `
            SELECT column_name FROM information_schema.columns 
            WHERE table_name='rooms' AND column_name='rules';
        `);
        if (rulesColumnCheck !== 'rules') {
            throw new Error("Upgrade verification failed: rooms.rules column missing!");
        }

        // Verify create_room_atomic function signature and execution after upgrade
        const newRoomId = query(container, `
            SELECT public.create_room_atomic(
                'Upgraded Room',
                'Post-upgrade room desc',
                'Engineering',
                'public',
                'online',
                15,
                'Post upgrade rules',
                ARRAY['upgrade', 'test'],
                'North Building',
                '${legacyUserId}'::uuid
            );
        `);
        if (!newRoomId || newRoomId.length < 30) {
            throw new Error(`Upgraded create_room_atomic failed to execute: ${newRoomId}`);
        }

        console.log("=== LEGACY UPGRADE DATABASE TEST PASSED ===");
    } catch (e) {
        console.error("=== LEGACY UPGRADE DATABASE TEST FAILED ===", e.message);
        process.exitCode = 1;
    } finally {
        db.cleanup();
    }
}

run();
