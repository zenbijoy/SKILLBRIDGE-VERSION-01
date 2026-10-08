import fs from "node:fs";
import path from "node:path";

const filesToHarden = [
  "c:/Users/24030/source/skillbridge-final/infra/supabase/migrations/full_schema_fresh.sql",
  "c:/Users/24030/source/skillbridge-final/infra/supabase/RUN_IN_SUPABASE_SQL_EDITOR.sql"
];

for (const filePath of filesToHarden) {
  if (!fs.existsSync(filePath)) continue;
  let content = fs.readFileSync(filePath, "utf8");

  // 1. Add DROP POLICY IF EXISTS before CREATE POLICY (matching quoted names with spaces)
  content = content.replace(/(?:drop\s+policy\s+if\s+exists\s+("[^"]+"|[a-zA-Z0-9_]+)\s+on\s+([a-zA-Z0-9_."]+);\s+)*create\s+policy\s+("[^"]+"|[a-zA-Z0-9_]+)\s+on\s+([a-zA-Z0-9_."]+)/gi, (match, _dp, _dt, policyName, tableName) => {
    return `DROP POLICY IF EXISTS ${policyName} ON ${tableName};\nCREATE POLICY ${policyName} ON ${tableName}`;
  });

  // 2. Add DROP TRIGGER IF EXISTS before CREATE TRIGGER
  content = content.replace(/(?:drop\s+trigger\s+if\s+exists\s+("[^"]+"|[a-zA-Z0-9_]+)\s+on\s+([a-zA-Z0-9_."]+);\s+)*create\s+trigger\s+("[^"]+"|[a-zA-Z0-9_]+)\s+(before|after|instead\s+of)\s+([a-zA-Z0-9_\s]+)\s+on\s+([a-zA-Z0-9_."]+)/gi, (match, _dt, _dtab, triggerName, timing, event, tableName) => {
    return `DROP TRIGGER IF EXISTS ${triggerName} ON ${tableName};\nCREATE TRIGGER ${triggerName} ${timing} ${event} ON ${tableName}`;
  });

  // 3. Ensure extensions use IF NOT EXISTS
  content = content.replace(/create\s+extension\s+(?!if\s+not\s+exists)([a-zA-Z0-9_"]+)/gi, "CREATE EXTENSION IF NOT EXISTS $1");

  fs.writeFileSync(filePath, content, "utf8");
  console.log(`Successfully hardened ${path.basename(filePath)} with idempotent DROP IF EXISTS clauses!`);
}

