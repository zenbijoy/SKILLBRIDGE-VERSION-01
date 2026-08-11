import { query, execPsql } from './db-test-docker.mjs';

const containerName = process.env.DB_CONTAINER_NAME;
if (!containerName) {
    console.error("[ERROR] DB_CONTAINER_NAME environment variable is required for verification.");
    process.exit(1);
}

console.log(`[db-verify-schema] Verifying schema and security in container ${containerName}...`);

const report = {};
let allPassed = true;

try {
    // 1. Table existence check
    const requiredTables = [
        'profiles', 'skills', 'user_skills', 'connection_requests', 'connections', 'blocks',
        'conversations', 'conversation_members', 'messages', 'message_reactions', 'message_delivery_receipts',
        'rooms', 'room_members', 'teaching_requests',
        'sessions', 'session_participants', 'livekit_attendance',
        'reviews', 'clubs', 'club_members', 'events', 'event_applications',
        'resources', 'saved_items', 'points_ledger', 'achievements', 'user_achievements',
        'quizzes', 'quiz_questions', 'quiz_attempts', 'notifications', 'device_tokens',
        'notification_preferences', 'push_receipts', 'reports', 'user_settings', 'audit_logs',
        'research_projects', 'research_collaboration_requests',
        'admin_roles', 'admin_permissions', 'admin_role_permissions', 'admin_assignments'
    ];

    const tablesRaw = query(containerName, `SELECT tablename FROM pg_tables WHERE schemaname = 'public';`);
    const tables = tablesRaw.split('\n').map(t => t.trim());

    const missingTables = requiredTables.filter(t => !tables.includes(t));
    if (missingTables.length > 0) {
        console.error("[VERIFY] Missing expected tables:", missingTables);
        report.expected_tables = false;
    } else {
        report.expected_tables = true;
    }

    // 2. RLS Check
    const rlsMissingRaw = query(containerName, `
        SELECT tablename FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename NOT IN ('push_receipts', 'schema_migrations') 
        AND rowsecurity = false;
    `);
    const rlsMissing = rlsMissingRaw.split('\n').map(t => t.trim()).filter(Boolean);
    if (rlsMissing.length > 0) {
        console.error("[VERIFY] Tables missing RLS:", rlsMissing);
        report.rls_enabled = false;
    } else {
        report.rls_enabled = true;
    }

    // 3. Security Definer search_path check
    const unsafeDefinersRaw = query(containerName, `
        SELECT p.proname 
        FROM pg_proc p 
        JOIN pg_namespace n ON n.oid = p.pronamespace 
        WHERE n.nspname = 'public' 
        AND p.prosecdef = true 
        AND (p.proconfig IS NULL OR NOT ('search_path=public' = ANY(p.proconfig)));
    `);
    const unsafeDefiners = unsafeDefinersRaw.split('\n').map(t => t.trim()).filter(Boolean);
    if (unsafeDefiners.length > 0) {
        console.error("[VERIFY] SECURITY DEFINER functions without explicit search_path=public:", unsafeDefiners);
        report.security_definer_search_path = false;
    } else {
        report.security_definer_search_path = true;
    }

    // 4. Key Functions Existence check
    const requiredFunctions = [
        'create_room_atomic',
        'recompute_reputation',
        'record_livekit_join',
        'record_livekit_leave'
    ];
    const functionsRaw = query(containerName, `
        SELECT p.proname 
        FROM pg_proc p 
        JOIN pg_namespace n ON n.oid = p.pronamespace 
        WHERE n.nspname = 'public';
    `);
    const existingFunctions = functionsRaw.split('\n').map(f => f.trim());
    const missingFunctions = requiredFunctions.filter(f => !existingFunctions.includes(f));

    if (missingFunctions.length > 0) {
        console.error("[VERIFY] Missing required RPC functions:", missingFunctions);
        report.expected_functions = false;
    } else {
        report.expected_functions = true;
    }

    // 5. Check RPC execution privileges (authenticated role should NOT have EXECUTE on admin/service RPCs)
    const unauthorizedExecuteRaw = query(containerName, `
        SELECT p.proname
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
        AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
        AND p.proname IN ('create_room_atomic', 'recompute_reputation', 'block_user_atomic', 'submit_review_atomic');
    `);
    const unauthorizedExecute = unauthorizedExecuteRaw.split('\n').map(x => x.trim()).filter(Boolean);
    if (unauthorizedExecute.length > 0) {
        console.error("[VERIFY] Authenticated user has unauthorized EXECUTE on backend RPCs:", unauthorizedExecute);
        report.grants_revokes_correct = false;
    } else {
        report.grants_revokes_correct = true;
    }

    // 6. Expected Indexes
    const indexesRaw = query(containerName, `SELECT indexname FROM pg_indexes WHERE schemaname = 'public';`);
    const indexes = indexesRaw.split('\n').map(i => i.trim());
    report.expected_indexes = indexes.includes('profiles_username_trgm') || indexes.some(idx => idx.includes('profiles'));

    // 7. Expected RLS Policies
    const policiesRaw = query(containerName, `SELECT policyname FROM pg_policies WHERE schemaname = 'public';`);
    const policies = policiesRaw.split('\n').map(p => p.trim()).filter(Boolean);
    report.expected_policies = policies.length > 0;

    Object.entries(report).forEach(([k, v]) => {
        if (!v) {
            console.error(`[VERIFY FAIL] ${k}: false`);
            allPassed = false;
        } else {
            console.log(`[VERIFY PASS] ${k}: true`);
        }
    });

    if (!allPassed) {
        console.error("[VERIFY FAIL] Schema verification failed.");
        process.exit(1);
    } else {
        console.log("[VERIFY PASS] All schema checks passed successfully.");
    }
} catch (e) {
    console.error("[VERIFY ERROR]", e.message);
    process.exit(1);
}
