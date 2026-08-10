import fs from 'fs';
import path from 'path';

const MIGRATIONS_DIR = path.join(process.cwd(), 'infra/supabase/migrations');
const ORDER_FILE = path.join(process.cwd(), 'docs/MIGRATION_ORDER.md');

console.log("=== MIGRATION VERIFICATION ===");

let orderText = "";
try {
  orderText = fs.readFileSync(ORDER_FILE, 'utf-8');
} catch (e) {
  console.error(`Warning: Could not read ${ORDER_FILE}`);
}

const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'));

// Extract prefixes
const prefixes = files.map(f => {
  const match = f.match(/^(\d+)_/);
  return match ? { file: f, prefix: match[1] } : null;
}).filter(x => x !== null);

const prefixCounts = {};
prefixes.forEach(p => {
  prefixCounts[p.prefix] = (prefixCounts[p.prefix] || 0) + 1;
});

let duplicatesFound = false;
for (const [prefix, count] of Object.entries(prefixCounts)) {
  if (count > 1) {
    duplicatesFound = true;
    console.warn(`[WARNING] Duplicate migration prefix found: ${prefix}_`);
    const duplicateFiles = prefixes.filter(p => p.prefix === prefix).map(p => p.file);
    duplicateFiles.forEach(f => console.warn(`  - ${f}`));
  }
}

console.log("\n=== DOCUMENTED EXECUTION ORDER ===");
const orderLines = orderText.split('\n').filter(l => l.match(/^\d+\.\s+`.*\.sql`/));
orderLines.forEach(l => console.log(l.trim()));

if (duplicatesFound) {
  console.log("\n[ACTION REQUIRED] Ensure you apply migrations EXACTLY in the order defined in docs/MIGRATION_ORDER.md because alphanumeric sorting will execute them out of order!");
} else {
  console.log("\n[OK] No duplicate migration prefixes detected.");
}
