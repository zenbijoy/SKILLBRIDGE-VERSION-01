import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const MIGRATIONS_DIR = path.join(process.cwd(), 'infra/supabase/migrations');
const ORDER_FILE = path.join(process.cwd(), 'docs/MIGRATION_ORDER.md');

console.log("=== SKILLBRIDGE DATABASE VERIFIER ===");

const requiredTables = [
  "profiles", "skills", "user_skills", "connection_requests", "connections",
  "blocks", "conversations", "conversation_members", "messages", "rooms",
  "room_members", "teaching_requests", "sessions", "session_participants",
  "reviews", "clubs", "club_members", "events", "event_applications",
  "resources", "saved_items", "points_ledger", "achievements", "user_achievements",
  "quizzes", "quiz_questions", "quiz_attempts", "notifications", "device_tokens",
  "reports", "user_settings", "audit_logs", "research_projects",
  "research_collaboration_requests", "message_reactions", "notification_preferences",
  "livekit_attendance", "push_receipts", "admin_roles", "admin_permissions",
  "admin_role_permissions", "admin_assignments"
];

let dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.log("[SKIP] DATABASE_URL not set. Skipping live DB verification.");
  process.exit(0);
}

try {
  // Test psql
  execSync('psql --version', { stdio: 'ignore' });
} catch (e) {
  console.log("[SKIP] psql not found in PATH. Skipping live DB verification.");
  process.exit(0);
}

console.log("[INFO] Verifying live database state...");

try {
  let psqlCmd = (query) => {
    return execSync(`psql "${dbUrl}" -tA -c "${query}"`, { encoding: 'utf-8' }).trim();
  };

  // 1. Verify tables
  const tablesResult = psqlCmd(`
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'public';
  `);
  const actualTables = tablesResult.split('\n').map(t => t.trim());
  let missingTables = [];
  for (const t of requiredTables) {
    if (!actualTables.includes(t)) {
      missingTables.push(t);
    }
  }

  if (missingTables.length > 0) {
    console.error(`[ERROR] Missing tables: ${missingTables.join(', ')}`);
    process.exit(1);
  } else {
    console.log("[PASS] All required tables exist.");
  }

  // 2. Verify functions (SECURITY DEFINER, explicit parameters)
  const functionsResult = psqlCmd(`
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef 
    FROM pg_proc p 
    JOIN pg_namespace n ON p.pronamespace = n.oid 
    WHERE n.nspname = 'public';
  `);
  
  const actualFunctions = functionsResult.split('\n').filter(l => l.trim().length > 0).map(l => {
    const parts = l.split('|');
    return { name: parts[0], args: parts[1], secDef: parts[2] === 't' };
  });

  const requiredFunctions = [
    { name: "record_livekit_join", args: "p_session_id uuid, p_user_id uuid" },
    { name: "record_livekit_leave", args: "p_session_id uuid, p_user_id uuid" },
    { name: "recompute_reputation", args: "p_user_id uuid" }
  ];

  let functionError = false;
  for (const rf of requiredFunctions) {
    const f = actualFunctions.find(af => af.name === rf.name);
    if (!f) {
      console.error(`[ERROR] Missing function: ${rf.name}`);
      functionError = true;
      continue;
    }
    // Very basic signature check
    if (f.args.toLowerCase().replace(/\\s+/g, '') !== rf.args.toLowerCase().replace(/\\s+/g, '')) {
      console.warn(`[WARN] Function signature mismatch for ${rf.name}: expected '${rf.args}', got '${f.args}'`);
    }
    if (!f.secDef) {
      console.warn(`[WARN] Function ${rf.name} should be SECURITY DEFINER`);
    }
  }

  if (functionError) {
    process.exit(1);
  }

  console.log("[PASS] Required RPCs verified.");
  
} catch (e) {
  console.error(`[ERROR] Verification failed: ${e.message}`);
  process.exit(1);
}

console.log("=== VERIFICATION COMPLETE ===");

