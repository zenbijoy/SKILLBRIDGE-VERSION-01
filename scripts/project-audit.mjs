import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourceRoots = ['frontend/app', 'frontend/src', 'admin/src', 'backend/src', 'scripts'];
const sourceExts = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);
const ignored = new Set(['node_modules', 'dist', '.git', '.skillbridge-backup', '.skillbridge-v2-backups']);

const files = [];
function walk(relative) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) return;
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) walk(child);
    else if (sourceExts.has(path.extname(entry.name))) files.push(child.replaceAll('\\', '/'));
  }
}
for (const directory of sourceRoots) walk(directory);

const text = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const failures = [];
const warnings = [];
const checks = [];
function check(name, condition, detail) {
  checks.push({ name, pass: Boolean(condition), detail });
  if (!condition) failures.push(`${name}: ${detail}`);
}

check('Expected monorepo layout', ['frontend/package.json', 'backend/package.json', 'admin/package.json'].every((file) => fs.existsSync(path.join(root, file))), 'frontend/backend/admin package manifests must exist');
check('User report route contract', text('frontend/app/user/[id].tsx').includes('`/moderation/report`'), 'mobile user report must call POST /moderation/report');
check('Admin API port contract', text('admin/src/lib/api.ts').includes('localhost:4000/api/v1'), 'admin default API must match backend default port 4000');
check('Admin env port contract', text('admin/.env.example').includes('localhost:4000/api/v1'), 'admin .env.example must match backend default port 4000');
check('Smoke health route contract', text('scripts/smoke-test.mjs').includes("localhost:4000/health/ready") && !text('scripts/smoke-test.mjs').includes('/api/v1/health'), 'health router is mounted outside /api/v1');
check('No nonexistent verification update', !text('backend/src/routes/admin.ts').includes('update({ is_verified'), 'profiles.is_verified is not part of the current schema');
check('Role escalation is admin-only', /users\/:id\/roles[\s\S]{0,120}requireRole\("admin"\)/.test(text('backend/src/routes/admin.ts')), 'elevated role changes must require admin');
check('Admin is included in root validation', text('package.json').includes('npm run typecheck --prefix admin') && text('package.json').includes('npm run lint --prefix admin'), 'admin typecheck/lint must be part of repository validation');
check('Admin is included in CI', /\n\s*admin:\s*\n/.test(text('.github/workflows/ci.yml')), 'CI must build and validate admin app');
check('Runtime boolean parsing is explicit', text('backend/src/config/env.ts').includes('booleanFromEnv') && !text('backend/src/config/env.ts').includes('MAINTENANCE_MODE: z.coerce.boolean'), 'string "false" must not coerce to boolean true');
check('Fresh DB setup includes post-baseline migrations', text('scripts/setup-database.mjs').includes('postBaselineFiles') && text('scripts/setup-database.mjs').includes("migrationType: 'POST_BASELINE'"), 'fresh setup must apply migrations newer than the baseline snapshot');
check('DB tests use setup script as source of truth', !text('scripts/db-test-fresh.mjs').includes('execSqlFile(container, m13Path)') && !text('scripts/db-test-upgrade.mjs').includes('execSqlFile(container, m13Path)'), 'database tests must not hide required migrations in manual test-only steps');

const productionAdminPages = [
  'admin/src/pages/APIManagement.tsx',
  'admin/src/pages/DatabaseOperations.tsx',
  'admin/src/pages/RulesEngine.tsx',
  'admin/src/pages/SupportCenter.tsx',
  'admin/src/pages/VerificationOverride.tsx',
];
const fakeUiMarkers = ['mockTickets', 'mockMigrations', 'sk_live_', 'Simulate API call', "created: '2026-", "createdAt: '2023-"];
check('No simulated production admin data', productionAdminPages.every((file) => fakeUiMarkers.every((marker) => !text(file).includes(marker))), 'production admin pages must be backed by API data, not hard-coded operational records');

let lines = 0;
let anyCount = 0;
let consoleCount = 0;
let todoCount = 0;
const largeFiles = [];
for (const file of files) {
  const content = text(file);
  const fileLines = content.split(/\r?\n/).length;
  lines += fileLines;
  if (file !== 'scripts/project-audit.mjs') {
    anyCount += (content.match(/\bany\b/g) ?? []).length;
    consoleCount += (content.match(/\bconsole\.(log|warn|error|debug)\b/g) ?? []).length;
    todoCount += (content.match(/\b(TODO|FIXME|HACK)\b/g) ?? []).length;
  }
  if (fileLines > 500) largeFiles.push(`${file} (${fileLines})`);
}

if (anyCount) warnings.push(`${anyCount} occurrences of \"any\" remain (includes tests/integration boundaries).`);
if (consoleCount) warnings.push(`${consoleCount} console calls remain (many are CLI scripts/workers/tests; consider structured logging for backend runtime paths).`);
if (todoCount) warnings.push(`${todoCount} TODO/FIXME/HACK markers remain.`);
if (largeFiles.length) warnings.push(`Large source files >500 lines: ${largeFiles.slice(0, 8).join(', ')}${largeFiles.length > 8 ? '…' : ''}`);

console.log('=== SkillBridge V3 repository audit ===');
console.log(`Scanned ${files.length} source files / ${lines.toLocaleString()} lines.`);
for (const item of checks) console.log(`${item.pass ? '[PASS]' : '[FAIL]'} ${item.name}${item.pass ? '' : ` — ${item.detail}`}`);
if (warnings.length) {
  console.log('\nQuality warnings (non-blocking):');
  for (const warning of warnings) console.log(`[WARN] ${warning}`);
}
if (failures.length) {
  console.error(`\nAudit failed with ${failures.length} blocking regression(s).`);
  process.exit(1);
}
console.log('\nAudit passed: no known V3 contract regressions detected.');
