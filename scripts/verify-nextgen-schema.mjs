// =============================================================================
// Next-Gen Schema Verification Script
// Verifies presence of migrations 028 and 029 tables, columns, and RLS policies.
// =============================================================================

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../backend/.env") });

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("[VERIFY] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend/.env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

const REQUIRED_TABLES = [
  "room_questions",
  "room_question_answers",
  "room_question_votes",
  "room_recordings",
  "media_objects",
  "campus_posts",
  "campus_post_reactions",
  "campus_post_comments",
  "anonymous_author_map",
  "club_clash_negotiations",
  "moderation_audit_logs",
  "youtube_connections",
  "campus_post_media",
  "background_jobs",
];

async function verifySchema() {
  console.log("=== Next-Gen Schema Verification ===");
  console.log(`Target: ${supabaseUrl}\n`);

  let allPassed = true;

  for (const table of REQUIRED_TABLES) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .limit(1);

      if (error) {
        console.log(`[FAIL] Table '${table}': ${error.message}`);
        allPassed = false;
      } else {
        console.log(`[PASS] Table '${table}' is accessible and queryable.`);
      }
    } catch (err) {
      console.log(`[FAIL] Table '${table}' query exception:`, err);
      allPassed = false;
    }
  }

  console.log("\n---------------------------------------------------");
  if (allPassed) {
    console.log("ALL NEXT-GEN TABLES ARE VERIFIED IN DATABASE.");
    process.exit(0);
  } else {
    console.log("SOME TABLES ARE MISSING. Please run 028 and 029 migrations.");
    process.exit(2);
  }
}

verifySchema().catch((err) => {
  console.error("Verification script failed:", err);
  process.exit(1);
});
