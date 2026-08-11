import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';

export function docker(args, options = {}) {
    try {
        return execFileSync('docker', args, {
            encoding: 'utf8',
            stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
            ...options,
        });
    } catch (error) {
        const stdout = error.stdout?.toString?.() ?? '';
        const stderr = error.stderr?.toString?.() ?? '';
        throw new Error(
            [`Docker command failed: docker ${args.join(' ')}`, stdout, stderr]
                .filter(Boolean)
                .join('\n')
        );
    }
}

export function execPsql(containerName, args = [], options = {}) {
    return docker(
        [
            'exec',
            containerName,
            'psql',
            '-U',
            options.user ?? 'postgres',
            '-d',
            options.database ?? 'postgres',
            '-v',
            'ON_ERROR_STOP=1',
            ...args,
        ],
        options
    );
}

export function execSql(containerName, sql, options = {}) {
    return execPsql(containerName, ['-c', sql], options);
}

export function execSqlFile(containerName, localFilePath, options = {}) {
    if (!fs.existsSync(localFilePath)) {
        throw new Error(`SQL file not found: ${localFilePath}`);
    }

    const sql = fs.readFileSync(localFilePath);

    const result = spawnSync(
        'docker',
        [
            'exec',
            '-i',
            containerName,
            'psql',
            '-U',
            options.user ?? 'postgres',
            '-d',
            options.database ?? 'postgres',
            '-v',
            options.onErrorStop === false ? 'ON_ERROR_STOP=0' : 'ON_ERROR_STOP=1',
        ],
        {
            input: sql,
            encoding: 'buffer',
            maxBuffer: 1024 * 1024 * 50,
        }
    );

    const stdout = result.stdout?.toString('utf8') ?? '';
    const stderr = result.stderr?.toString('utf8') ?? '';

    if (result.status !== 0 && options.ignoreError !== true) {
        throw new Error(
            [`SQL execution failed: ${localFilePath}`, stdout, stderr]
                .filter(Boolean)
                .join('\n')
        );
    }

    return stdout;
}

export function query(containerName, sql, options = {}) {
    return execPsql(
        containerName,
        ['-q', '-At', '-c', sql],
        options
    ).trim();
}

export function removeContainer(containerName) {
    try {
        docker(['rm', '-f', containerName], { stdio: 'ignore' });
    } catch {
        // cleanup must not hide original test failure
    }
}

export function startPostgresContainer() {
    const timestamp = Date.now() + Math.floor(Math.random() * 1000);
    const containerName = `skillbridge-db-test-${timestamp}`;
    const port = Math.floor(Math.random() * (65000 - 10000) + 10000);

    console.log(`[docker] Starting PostgreSQL 16 container ${containerName} on port ${port}...`);
    
    docker([
        'run',
        '--name',
        containerName,
        '-e',
        'POSTGRES_USER=postgres',
        '-e',
        'POSTGRES_PASSWORD=postgres',
        '-e',
        'POSTGRES_DB=postgres',
        '-p',
        `127.0.0.1:${port}:5432`,
        '-d',
        'postgres:16',
    ]);

    let ready = false;
    const startTime = Date.now();
    const timeoutMs = 30000;

    while (Date.now() - startTime < timeoutMs) {
        try {
            docker(['exec', containerName, 'pg_isready', '-U', 'postgres', '-d', 'postgres'], { stdio: 'ignore' });
            ready = true;
            break;
        } catch {
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
        }
    }

    if (!ready) {
        removeContainer(containerName);
        throw new Error(`PostgreSQL failed to ready within 30 seconds: ${containerName}`);
    }

    // Inject Supabase mock schema & functions
    const mockSql = `
        CREATE SCHEMA IF NOT EXISTS auth;
        CREATE TABLE IF NOT EXISTS auth.users (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            email text,
            raw_app_meta_data jsonb DEFAULT '{}'::jsonb,
            raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
            created_at timestamptz DEFAULT now()
        );
        CREATE SCHEMA IF NOT EXISTS storage;
        CREATE TABLE IF NOT EXISTS storage.buckets (
          id text primary key,
          name text not null,
          public boolean,
          file_size_limit bigint,
          allowed_mime_types text[]
        );
        CREATE TABLE IF NOT EXISTS storage.objects (
          id uuid primary key,
          bucket_id text,
          name text
        );
        CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] AS $FUNC$
          SELECT string_to_array(name, '/');
        $FUNC$ LANGUAGE sql STABLE;

        DO $$
        BEGIN
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
        END
        $$;

        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $FUNC$
          SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
        $FUNC$ LANGUAGE sql STABLE;

        CREATE OR REPLACE FUNCTION auth.role() RETURNS text AS $FUNC$
          SELECT nullif(current_setting('request.jwt.claim.role', true), '')::text;
        $FUNC$ LANGUAGE sql STABLE;

        CREATE OR REPLACE FUNCTION auth.email() RETURNS text AS $FUNC$
          SELECT nullif(current_setting('request.jwt.claim.email', true), '')::text;
        $FUNC$ LANGUAGE sql STABLE;
    `;

    spawnSync(
        'docker',
        ['exec', '-i', containerName, 'psql', '-U', 'postgres', '-d', 'postgres'],
        { input: Buffer.from(mockSql, 'utf8'), encoding: 'buffer' }
    );

    console.log(`[docker] PostgreSQL ready in container ${containerName} on port ${port}`);

    return {
        containerName,
        port,
        dbUrl: `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`,
        cleanup: () => {
            console.log(`[docker] Removing container ${containerName}`);
            removeContainer(containerName);
        },
    };
}
