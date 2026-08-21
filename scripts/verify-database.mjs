import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import crypto from 'crypto';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.resolve(__dirname, '../infra/supabase/migrations');
const BASELINE_DIR = path.resolve(__dirname, '../infra/supabase/baseline');
const BASELINE_SCHEMA_VERSION = 12;

function psqlCmd(dbUrl, query) {
    try {
        if (process.env.DB_CONTAINER_NAME) {
            return execFileSync('docker', [
                'exec',
                process.env.DB_CONTAINER_NAME,
                'psql',
                '-U',
                'postgres',
                '-d',
                'postgres',
                '-tA',
                '-c',
                query
            ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
        } else {
            return execFileSync('psql', [dbUrl, '-tA', '-c', query], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
        }
    } catch (e) {
        throw new Error(`psql command failed: ${e.message}`);
    }
}

function getExpectedMigrations(dir) {
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
    return files.map(file => {
        const content = fs.readFileSync(path.join(dir, file), 'utf8');
        const checksum = crypto.createHash('sha256').update(content).digest('hex').toLowerCase();
        return { filename: file, checksum };
    });
}

export function determineState(dbUrl) {
    try {
        // check tables
        const tablesResult = psqlCmd(dbUrl, `SELECT tablename FROM pg_tables WHERE schemaname = 'public';`);
        const tables = tablesResult.split('\n').map(t => t.trim());
        const hasProfiles = tables.includes('profiles');

        // check meta
        let hasMeta = false;
        let applied = [];
        try {
            const metaResult = psqlCmd(dbUrl, `SELECT tablename FROM pg_tables WHERE schemaname = 'skillbridge_meta';`);
            const metaTables = metaResult.split('\n').map(t => t.trim());
            hasMeta = metaTables.includes('schema_migrations');
            
            if (hasMeta) {
                const appliedRaw = psqlCmd(dbUrl, `SELECT filename, checksum_sha256 FROM skillbridge_meta.schema_migrations ORDER BY filename;`);
                applied = appliedRaw.split('\n').filter(l => l.trim()).map(line => {
                    const [filename, checksum] = line.split('|');
                    return { filename, checksum };
                });
            }
        } catch {
            hasMeta = false;
        }

        if (!hasProfiles && !hasMeta) return 'EMPTY';
        if (hasProfiles && !hasMeta) return 'LEGACY';

        if (hasMeta) {
            if (applied.length === 0) {
                return hasProfiles ? 'UNKNOWN' : 'EMPTY';
            }

            const expectedUpgrade = getExpectedMigrations(MIGRATIONS_DIR);
            const expectedBaseline = getExpectedMigrations(BASELINE_DIR);
            const expectedPostBaseline = expectedUpgrade.filter(({ filename }) => {
                const number = Number.parseInt(filename.split('_')[0], 10);
                return Number.isFinite(number) && number > BASELINE_SCHEMA_VERSION;
            });
            const expectedFresh = [...expectedBaseline, ...expectedPostBaseline];

            // Check against Upgrade Chain
            let matchUpgrade = true;
            for (let i = 0; i < applied.length; i++) {
                const exp = expectedUpgrade.find(e => e.filename === applied[i].filename);
                if (!exp || exp.checksum !== applied[i].checksum) matchUpgrade = false;
            }
            if (matchUpgrade) {
                if (applied.length === expectedUpgrade.length) return 'CURRENT';
                const isPrefix = applied.every((app, idx) => app.filename === expectedUpgrade[idx].filename && app.checksum === expectedUpgrade[idx].checksum);
                if (isPrefix) return 'BASELINE_V1';
            }

            // Check against Fresh Chain (baseline snapshot + migrations newer than the snapshot).
            const matchesFreshPrefix = applied.every((app, index) => {
                const expected = expectedFresh[index];
                return expected && app.filename === expected.filename && app.checksum === expected.checksum;
            });
            if (matchesFreshPrefix) {
                if (applied.length === expectedFresh.length) return 'CURRENT';
                return 'BASELINE_V1';
            }

            return 'UNKNOWN';
        }

    } catch {
        return 'UNKNOWN';
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
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
    if (!dbUrl && !process.env.DB_CONTAINER_NAME) {
        console.error("[SKIP] DATABASE_URL not set. Skipping live DB verification.");
        process.exit(0);
    }

    if (!process.env.DB_CONTAINER_NAME) {
        try {
            execFileSync('psql', ['--version'], { stdio: 'ignore' });
        } catch {
            console.error("[SKIP] psql not found in PATH. Skipping live DB verification.");
            process.exit(0);
        }
    }

    console.log("=== DATABASE VERIFICATION ===");
    const state = determineState(dbUrl);
    console.log(`Database State: ${state}`);
    
    if (state === 'UNKNOWN') {
        console.error("DATABASE STATE UNKNOWN. MANUAL RECONCILIATION REQUIRED.");
        process.exit(1);
    }
}
