import fs from 'fs';
import path from 'path';
import { execFileSync, spawnSync } from 'child_process';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { determineState } from './verify-database.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// parse args
const args = process.argv.slice(2);
const isFresh = args.includes('--fresh') || args.includes('-Fresh');
const isUpgrade = args.includes('--upgrade') || args.includes('-Upgrade');
const allowChecksumMismatch = args.includes('--allow-checksum-mismatch') || args.includes('-AllowChecksumMismatch');
const allowProduction = args.includes('--allow-production') || args.includes('-AllowProduction');

let executor = 'external';
const executorIdx = args.indexOf('--executor');
if (executorIdx !== -1 && args[executorIdx + 1]) {
    executor = args[executorIdx + 1].toLowerCase();
}

let containerName = process.env.DB_CONTAINER_NAME || null;
const containerIdx = args.indexOf('--container');
if (containerIdx !== -1 && args[containerIdx + 1]) {
    containerName = args[containerIdx + 1];
}

if (executor === 'docker') {
    if (!containerName) {
        console.error("[ERROR] --executor docker requires --container <container_name> or DB_CONTAINER_NAME env.");
        process.exit(1);
    }
    process.env.DB_CONTAINER_NAME = containerName;
}

const BASELINE_DIR = path.resolve(__dirname, '../infra/supabase/baseline');
const UPGRADE_DIR = path.resolve(__dirname, '../infra/supabase/migrations');
const BASELINE_SCHEMA_VERSION = 12;

if (!isFresh && !isUpgrade) {
    console.error("[ERROR] Must specify either --fresh or --upgrade mode.");
    process.exit(1);
}

if (isFresh && isUpgrade) {
    console.error("[ERROR] Cannot specify both --fresh and --upgrade.");
    process.exit(1);
}

// load env
const envPath = path.resolve(__dirname, '../backend/.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const match = line.match(/^([^#\s][^=]+)="?(.*?)"?$/);
        if (match) {
            process.env[match[1]] = match[2];
        }
    });
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl && !containerName) {
    console.error("[ERROR] DATABASE_URL is required.");
    process.exit(1);
}

const env = process.env.NODE_ENV || process.env.APP_ENV;
if ((env === 'production') && !allowProduction && process.env.ALLOW_PRODUCTION_MIGRATION !== 'true') {
    console.error("[ERROR] Refusing production migration without explicit approval.");
    process.exit(1);
}

if (!containerName && executor !== 'docker') {
    try {
        execFileSync('psql', ['--version'], { stdio: 'ignore' });
    } catch {
        console.error("[ERROR] psql is required for external execution mode.");
        process.exit(1);
    }
}

const state = determineState(dbUrl);
console.log(`[INFO] Current Database State: ${state}`);

if (state === 'UNKNOWN') {
    console.error("DATABASE STATE UNKNOWN. MANUAL RECONCILIATION REQUIRED.");
    process.exit(1);
}

if (isFresh && state !== 'EMPTY') {
    console.error(`[ERROR] --fresh mode requires an EMPTY database. Current state is ${state}.`);
    process.exit(1);
}

if (isUpgrade && state === 'EMPTY') {
    console.error(`[ERROR] --upgrade mode requires an existing database. Current state is EMPTY. Use --fresh instead.`);
    process.exit(1);
}

if (isUpgrade && state === 'CURRENT') {
    console.log("[PASS] Database is already CURRENT. No upgrade needed.");
    process.exit(0);
}

function psqlCmdExec(query, ignoreError = false) {
    try {
        if (containerName) {
            execFileSync('docker', [
                'exec',
                '-i',
                containerName,
                'psql',
                '-U',
                'postgres',
                '-d',
                'postgres',
                '-v',
                'ON_ERROR_STOP=1',
                '-c',
                query
            ], { stdio: 'inherit' });
        } else {
            execFileSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-c', query], { stdio: 'inherit' });
        }
    } catch (e) {
        if (!ignoreError) {
            console.error(`[ERROR] Execution failed: ${e.message}`);
            process.exit(1);
        }
    }
}

function psqlFileExec(filePath) {
    if (containerName) {
        const sql = fs.readFileSync(filePath);
        const res = spawnSync('docker', [
            'exec',
            '-i',
            containerName,
            'psql',
            '-U',
            'postgres',
            '-d',
            'postgres',
            '-v',
            'ON_ERROR_STOP=1'
        ], { input: sql, stdio: ['pipe', 'inherit', 'inherit'] });

        if (res.status !== 0) {
            throw new Error(`Failed to apply SQL file: ${filePath}`);
        }
    } else {
        execFileSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-1', '-f', filePath], { stdio: 'inherit' });
    }
}

// Create meta schema and table with migration_type
psqlCmdExec(`
CREATE SCHEMA IF NOT EXISTS skillbridge_meta;
CREATE TABLE IF NOT EXISTS skillbridge_meta.schema_migrations (
  filename text PRIMARY KEY,
  checksum_sha256 text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  migration_type text
);
`);

// Add migration_type column if it doesn't exist
psqlCmdExec(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'skillbridge_meta'
    AND table_name = 'schema_migrations'
    AND column_name = 'migration_type'
  ) THEN
    ALTER TABLE skillbridge_meta.schema_migrations ADD COLUMN migration_type text;
  END IF;
END
$$;
`);

const baselineFiles = fs.readdirSync(BASELINE_DIR).filter(f => f.endsWith('.sql')).sort();
const upgradeFiles = fs.readdirSync(UPGRADE_DIR).filter(f => f.endsWith('.sql')).sort();
const postBaselineFiles = upgradeFiles.filter((file) => {
    const number = Number.parseInt(file.split('_')[0], 10);
    return Number.isFinite(number) && number > BASELINE_SCHEMA_VERSION;
});
const plan = isFresh
    ? [
        ...baselineFiles.map((file) => ({ file, directory: BASELINE_DIR, migrationType: 'BASELINE' })),
        ...postBaselineFiles.map((file) => ({ file, directory: UPGRADE_DIR, migrationType: 'POST_BASELINE' })),
      ]
    : upgradeFiles.map((file) => ({ file, directory: UPGRADE_DIR, migrationType: 'UPGRADE' }));

for (const item of plan) {
    const { file, directory, migrationType } = item;
    const pathSql = path.join(directory, file);
    const content = fs.readFileSync(pathSql, 'utf8');
    const checksum = crypto.createHash('sha256').update(content).digest('hex').toLowerCase();

    // Check existing
    let existing = '';
    try {
        if (containerName) {
            const out = execFileSync('docker', [
                'exec',
                containerName,
                'psql',
                '-U',
                'postgres',
                '-d',
                'postgres',
                '-tA',
                '-c',
                `SELECT checksum_sha256 FROM skillbridge_meta.schema_migrations WHERE filename='${file}';`
            ], { encoding: 'utf8' }).trim();
            existing = out;
        } else {
            const out = execFileSync('psql', [
                dbUrl,
                '-tA',
                '-c',
                `SELECT checksum_sha256 FROM skillbridge_meta.schema_migrations WHERE filename='${file}';`
            ], { encoding: 'utf8' }).trim();
            existing = out;
        }
    } catch {
        existing = '';
    }

    if (existing) {
        if (existing === checksum) {
            console.log(`[SKIP] ${file}`);
            continue;
        }

        console.error(`[ERROR] Applied migration changed: ${file}`);
        if (!allowChecksumMismatch) {
            console.log("Create a NEW corrective migration instead.");
            process.exit(1);
        }
    } else if (state === 'LEGACY') {
        const num = parseInt(file.split('_')[0], 10);
        if (num <= 11) {
            console.log(`[ASSUMED APPLIED] ${file}`);
            psqlCmdExec(`
                INSERT INTO skillbridge_meta.schema_migrations(filename, checksum_sha256, migration_type)
                VALUES('${file}', '${checksum}', 'LEGACY_IMPORT')
                ON CONFLICT(filename)
                DO UPDATE SET checksum_sha256 = EXCLUDED.checksum_sha256, migration_type = EXCLUDED.migration_type;
            `);
            continue;
        }
    }

    console.log(`[APPLY] ${file}`);
    try {
        psqlFileExec(pathSql);
    } catch (e) {
        console.error(`[ERROR] Failed to apply ${file}: ${e.message}`);
        process.exit(1);
    }

    psqlCmdExec(`
        INSERT INTO skillbridge_meta.schema_migrations(filename, checksum_sha256, migration_type)
        VALUES('${file}', '${checksum}', '${migrationType}')
        ON CONFLICT(filename)
        DO UPDATE SET checksum_sha256 = EXCLUDED.checksum_sha256, applied_at = now(), migration_type = EXCLUDED.migration_type;
    `);
}

console.log("[PASS] Migration chain applied.");
