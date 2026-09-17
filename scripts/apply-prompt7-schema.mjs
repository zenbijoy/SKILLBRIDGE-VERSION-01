import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRequire = createRequire(path.resolve(__dirname, "../backend/package.json"));
const { createClient } = backendRequire("@supabase/supabase-js");
const dotenv = backendRequire("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../backend/.env") });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log("Checking Supabase connection...");
  const { data, error } = await supabase.from("conversation_members").select("conversation_id, user_id, is_pinned, is_archived, muted_until").limit(1);
  if (error) {
    console.log("Error querying columns on conversation_members:", error.message);
  } else {
    console.log("Columns already exist on conversation_members! Sample:", data);
  }
}

run();
