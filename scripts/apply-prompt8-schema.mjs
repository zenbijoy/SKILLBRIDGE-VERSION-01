import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRequire = createRequire(path.resolve(__dirname, "../backend/package.json"));
const { createClient } = backendRequire("@supabase/supabase-js");
const dotenv = backendRequire("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../backend/.env") });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log("Checking Supabase connection and privacy columns...");
  const { data, error } = await supabase
    .from("profiles")
    .select("id, who_can_message, who_can_call, presence_visibility")
    .limit(1);

  if (error) {
    console.log("Privacy columns do not exist yet or error:", error.message);
  } else {
    console.log("Privacy columns already queryable on profiles! Sample:", data);
  }
}

run();
