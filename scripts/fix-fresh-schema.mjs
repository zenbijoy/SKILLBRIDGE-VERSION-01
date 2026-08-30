import fs from "node:fs";

const filePath = "c:/Users/24030/source/skillbridge-final/infra/supabase/migrations/full_schema_fresh.sql";
let content = fs.readFileSync(filePath, "utf8");

// 1. Fix recompute_reputation() -> recompute_reputation(uuid)
content = content.replace(/public\.recompute_reputation\(\)/g, "public.recompute_reputation(uuid)");

// 2. Add RLS to push_receipts
content = content.replace(
  /CREATE TABLE IF NOT EXISTS public\.push_receipts \([\s\S]*?\);/g,
  (match) => {
    return `${match}\n\nALTER TABLE public.push_receipts ENABLE ROW LEVEL SECURITY;\nDROP POLICY IF EXISTS push_receipts_service_role ON public.push_receipts;\nCREATE POLICY push_receipts_service_role ON public.push_receipts TO service_role USING (true) WITH CHECK (true);`;
  }
);

// 3. Fix 005_rpc_security_hardening.sql as well
const file005 = "c:/Users/24030/source/skillbridge-final/infra/supabase/migrations/005_rpc_security_hardening.sql";
let content005 = fs.readFileSync(file005, "utf8");
content005 = content005.replace(/public\.recompute_reputation\(\)/g, "public.recompute_reputation(uuid)");
fs.writeFileSync(file005, content005, "utf8");

fs.writeFileSync(filePath, content, "utf8");
console.log("Successfully fixed recompute_reputation signature and enabled RLS on push_receipts!");
