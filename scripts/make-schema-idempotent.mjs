import fs from "node:fs";
import path from "node:path";

const filePath = "c:/Users/24030/source/skillbridge-final/infra/supabase/migrations/full_schema_fresh.sql";
let content = fs.readFileSync(filePath, "utf8");

// 1. Add DROP POLICY IF EXISTS before CREATE POLICY
content = content.replace(/create policy\s+([a-zA-Z0-9_"]+)\s+on\s+([a-zA-Z0-9_."]+)/gi, (match, policyName, tableName) => {
  return `drop policy if exists ${policyName} on ${tableName};\n${match}`;
});

// 2. Add DROP TRIGGER IF EXISTS before CREATE TRIGGER
content = content.replace(/create trigger\s+([a-zA-Z0-9_"]+)\s+(before|after|instead of)\s+([a-zA-Z0-9_\s]+)\s+on\s+([a-zA-Z0-9_."]+)/gi, (match, triggerName, timing, event, tableName) => {
  return `drop trigger if exists ${triggerName} on ${tableName};\n${match}`;
});

// 3. Ensure extensions use IF NOT EXISTS
content = content.replace(/create extension\s+([a-zA-Z0-9_"]+)/gi, "create extension if not exists $1");

fs.writeFileSync(filePath, content, "utf8");
console.log("Successfully hardened full_schema_fresh.sql with DROP IF EXISTS clauses!");
