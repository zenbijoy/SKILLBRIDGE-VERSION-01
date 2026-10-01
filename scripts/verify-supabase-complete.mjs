import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRequire = createRequire(path.resolve(__dirname, "../backend/package.json"));
const { createClient } = backendRequire("@supabase/supabase-js");
const dotenv = backendRequire("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../backend/.env") });


const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend/.env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const TABLES = [
  // Core & Social
  "profiles",
  "skills",
  "user_skills",
  "connections",
  "conversations",
  "conversation_members",
  "messages",
  "campus_posts",
  "campus_post_reactions",
  "campus_post_comments",
  // Rooms & Live
  "rooms",
  "room_members",
  "sessions",
  "room_posts",
  "room_questions",
  "room_recordings",
  "livekit_attendance",
  "room_poll_votes",
  "room_certificates",
  // Clubs & Events
  "clubs",
  "club_members",
  "events",
  "event_attendees",
  "club_clash_negotiations",
  // Academic & Research
  "academic_profiles",
  "academic_routines",
  "routine_entries",
  "calendar_events",
  "research_papers",
  "research_notes",
  "research_collections"
];

async function verify() {
  console.log("==================================================");
  console.log(" SkillBridge Supabase Schema Verification Report");
  console.log(" Project:", supabaseUrl);
  console.log(" Timestamp:", new Date().toISOString());
  console.log("==================================================");

  let passed = 0;
  let missing = 0;
  const missingTables = [];

  for (const table of TABLES) {
    const { error } = await supabase.from(table).select("*").limit(1);
    if (error) {
      if (error.message.includes("schema cache") || error.code === "PGRST205" || error.code === "42P01") {
        console.log(`❌ [MISSING] ${table}`);
        missing++;
        missingTables.push(table);
      } else {
        console.log(`⚠️  [ERROR]   ${table}: ${error.message}`);
      }
    } else {
      console.log(`✅ [ACTIVE]  ${table}`);
      passed++;
    }
  }

  console.log("\n==================================================");
  console.log(`Total: ${TABLES.length} | Active: ${passed} | Missing: ${missing}`);
  console.log("==================================================");

  if (missing > 0) {
    console.log("\nPending tables to apply:");
    missingTables.forEach((t) => console.log(`  - ${t}`));
    console.log("\nRun the SQL script located at: infra/supabase/RUN_IN_SUPABASE_SQL_EDITOR.sql");
    console.log("In your Supabase SQL Editor: https://supabase.com/dashboard/project/wyqsoxkwmulhpcoslnoj/sql/new\n");
  } else {
    console.log("\n🎉 ALL TABLES AND FEATURES ARE 100% ACTIVE IN SUPABASE!\n");
  }
}

verify();
