import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.resolve(__dirname, "../infra/supabase/RUN_IN_SUPABASE_SQL_EDITOR.sql");
const sql = fs.readFileSync(sqlPath, "utf-8");

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error("Missing SUPABASE_ACCESS_TOKEN environment variable.");
  process.exit(1);
}
const projectRef = process.env.SUPABASE_PROJECT_REF || "wyqsoxkwmulhpcoslnoj";

console.log(`[Supabase CLI Runner] Applying master migration script (${Math.round(sql.length / 1024)} KB) to ${projectRef}...`);

async function run() {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query: sql })
  });

  const body = await res.json();
  if (!res.ok) {
    console.error("[Supabase CLI Runner] Migration execution failed:", JSON.stringify(body, null, 2));
    process.exit(1);
  }

  console.log("[Supabase CLI Runner] Migration script executed successfully!");
  console.log("[Supabase CLI Runner] Result summary:", Array.isArray(body) ? `${body.length} rows/messages returned` : body);
}

run().catch((err) => {
  console.error("[Supabase CLI Runner] Unexpected error:", err);
  process.exit(1);
});
