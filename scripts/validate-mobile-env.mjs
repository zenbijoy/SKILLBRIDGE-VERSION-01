#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const root = process.cwd();
const frontendEnvPath = path.join(root, 'frontend', '.env');
const fileEnv = loadEnvFile(frontendEnvPath);

const apiUrl = (process.env.EXPO_PUBLIC_API_URL || fileEnv.EXPO_PUBLIC_API_URL || '').trim();
const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || fileEnv.EXPO_PUBLIC_SUPABASE_URL || '').trim();
const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || fileEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();

const isProduction = process.env.NODE_ENV === 'production' || process.env.EXPO_PUBLIC_ENV === 'production' || process.argv.includes('--production');

console.log('=== SkillBridge Mobile Build Environment Validation ===');
console.log(`Mode: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT / BUILD'}`);

const errors = [];

// 1. Guard against service role keys in mobile env
const privilegedKeys = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY',
  'SERVICE_ROLE_KEY',
].filter((k) => Boolean(process.env[k] || fileEnv[k]));

if (privilegedKeys.length > 0) {
  errors.push(`CRITICAL: Privileged service role keys found in mobile env: ${privilegedKeys.join(', ')}`);
}

// 2. Validate API URL
if (!apiUrl) {
  errors.push('EXPO_PUBLIC_API_URL is missing or empty.');
} else {
  try {
    const parsed = new URL(apiUrl);
    if (isProduction && parsed.protocol !== 'https:') {
      errors.push(`EXPO_PUBLIC_API_URL must use HTTPS in production. Received: ${parsed.protocol}`);
    }
    if (isProduction && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
      errors.push('EXPO_PUBLIC_API_URL cannot target localhost in production.');
    }
    if (apiUrl.includes('skillbridge-api.onrender.com')) {
      errors.push('EXPO_PUBLIC_API_URL uses the obsolete onrender subdomain.');
    }
  } catch {
    errors.push(`EXPO_PUBLIC_API_URL is not a valid URL: ${apiUrl}`);
  }
}

// 3. Validate Supabase URL
let projectRef = 'unknown';
if (!supabaseUrl) {
  errors.push('EXPO_PUBLIC_SUPABASE_URL is missing or empty.');
} else {
  try {
    const parsed = new URL(supabaseUrl);
    if (isProduction && parsed.protocol !== 'https:') {
      errors.push(`EXPO_PUBLIC_SUPABASE_URL must use HTTPS in production. Received: ${parsed.protocol}`);
    }
    if (!parsed.hostname.endsWith('.supabase.co') && !parsed.hostname.includes('supabase')) {
      errors.push(`EXPO_PUBLIC_SUPABASE_URL must be a valid Supabase host. Received: ${parsed.hostname}`);
    }
    projectRef = parsed.hostname.split('.')[0] || 'unknown';
    if (projectRef.length < 5 || projectRef === 'your-project') {
      errors.push(`EXPO_PUBLIC_SUPABASE_URL contains placeholder project ref: ${projectRef}`);
    }
  } catch {
    errors.push(`EXPO_PUBLIC_SUPABASE_URL is not a valid URL: ${supabaseUrl}`);
  }
}

// 4. Validate Supabase Anon Key
if (!supabaseAnonKey) {
  errors.push('EXPO_PUBLIC_SUPABASE_ANON_KEY is missing or empty.');
} else if (supabaseAnonKey.length < 20 || supabaseAnonKey.includes('placeholder') || supabaseAnonKey.includes('your-anon-key')) {
  errors.push('EXPO_PUBLIC_SUPABASE_ANON_KEY is invalid or a placeholder.');
}

// Safe Reporting (No Secrets Logged)
console.log(`EXPO_PUBLIC_API_URL = ${apiUrl ? 'configured (' + apiUrl + ')' : 'MISSING'}`);
console.log(`EXPO_PUBLIC_SUPABASE_URL = ${supabaseUrl ? 'configured (project ref: ' + projectRef + ')' : 'MISSING'}`);
console.log(`EXPO_PUBLIC_SUPABASE_ANON_KEY = ${supabaseAnonKey ? 'configured' : 'MISSING'}`);

if (errors.length > 0) {
  console.error('\nMobile Environment Validation FAILED:');
  for (const err of errors) {
    console.error(` - [FAIL] ${err}`);
  }
  process.exit(1);
}

console.log('\n[PASS] Mobile build environment validation succeeded.\n');
