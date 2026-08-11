import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.resolve(__dirname, '../infra/supabase/migrations');

function psqlCmd(dbUrl, query) {
    try {
        return execSync(`psql "${dbUrl}" -tA -c "${query}"`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    } catch (e) {
        throw new Error(`psql command failed: ${e.message}`);
    }
}

function getExpectedMigrations() {
    if (!fs.existsSync(MIGRATIONS_DIR)) return [];
    const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
    return files.map(file => {
        const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
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
                // Ensure migration_type column exists
                const columnsResult = psqlCmd(dbUrl, `SELECT column_name FROM information_schema.columns WHERE table_schema = 'skillbridge_meta' AND table_name = 'schema_migrations';`);
                const columns = columnsResult.split('\n').map(c => c.trim());
                if (!columns.includes('migration_type')) {
                    // It has the old meta table without migration_type, still consider it hasMeta
                }

                const appliedRaw = psqlCmd(dbUrl, `SELECT filename, checksum_sha256 FROM skillbridge_meta.schema_migrations ORDER BY filename;`);
                applied = appliedRaw.split('\n').filter(l => l.trim()).map(line => {
                    const [filename, checksum] = line.split('|');
                    return { filename, checksum };
                });
            }
        } catch (e) {
            hasMeta = false;
        }

        if (!hasProfiles && !hasMeta) return 'EMPTY';
        if (hasProfiles && !hasMeta) return 'LEGACY';

        if (hasMeta) {
            const expected = getExpectedMigrations();
            
            if (applied.length === 0) {
                return hasProfiles ? 'UNKNOWN' : 'EMPTY'; // Meta exists but no migrations, and no profiles = EMPTY (just initialized meta). If profiles = UNKNOWN.
            }

            let isCurrent = true;
            if (applied.length !== expected.length) isCurrent = false;
            
            for (let i = 0; i < applied.length; i++) {
                const exp = expected.find(e => e.filename === applied[i].filename);
                if (!exp || exp.checksum !== applied[i].checksum) {
                    return 'UNKNOWN'; // Checksum mismatch or unknown file applied
                }
            }

            if (isCurrent) return 'CURRENT';

            // Check if it's a valid prefix
            const isPrefix = applied.every((app, idx) => app.filename === expected[idx].filename && app.checksum === expected[idx].checksum);
            if (isPrefix) {
                return 'BASELINE_V1';
            }

            return 'UNKNOWN';
        }

    } catch (e) {
        return 'UNKNOWN';
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
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

    const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_URL; // fallback if needed, but dbUrl is pg connection string
    if (!process.env.DATABASE_URL) {
        console.error("[SKIP] DATABASE_URL not set. Skipping live DB verification.");
        process.exit(0);
    }

    try {
        execSync('psql --version', { stdio: 'ignore' });
    } catch (e) {
        console.error("[SKIP] psql not found in PATH. Skipping live DB verification.");
        process.exit(0);
    }

    console.log("=== DATABASE VERIFICATION ===");
    const state = determineState(process.env.DATABASE_URL);
    console.log(`Database State: ${state}`);
    
    if (state === 'UNKNOWN') {
        console.error("DATABASE STATE UNKNOWN. MANUAL RECONCILIATION REQUIRED.");
        process.exit(1);
    }
}
