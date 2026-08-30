#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function parseEnv(filePath) {
  if (!fs.existsSync(filePath)) return null;
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

function getProjectRef(url) {
  if (!url) return null;
  try {
    const hostname = new URL(url).hostname;
    return hostname.split('.')[0] || null;
  } catch {
    return null;
  }
}

const root = process.cwd();
const frontendEnv = parseEnv(path.join(root, 'frontend', '.env'));
const backendEnv = parseEnv(path.join(root, 'backend', '.env'));
const adminEnv = parseEnv(path.join(root, 'admin', '.env'));

console.log('===================================================');
console.log('       SKILLBRIDGE ENVIRONMENT CONSISTENCY CHECK');
console.log('===================================================');

const mobileProjectRef = getProjectRef(frontendEnv?.EXPO_PUBLIC_SUPABASE_URL);
const backendProjectRef = getProjectRef(backendEnv?.SUPABASE_URL);
const adminProjectRef = getProjectRef(adminEnv?.VITE_SUPABASE_URL);

const mobileApiUrl = frontendEnv?.EXPO_PUBLIC_API_URL || null;
const adminApiUrl = adminEnv?.VITE_API_URL || null;

console.log(`Mobile Supabase project:  ${mobileProjectRef || 'NOT CONFIGURED'}`);
console.log(`Backend Supabase project: ${backendProjectRef || 'NOT CONFIGURED'}`);
if (adminEnv) {
  console.log(`Admin Supabase project:   ${adminProjectRef || 'NOT CONFIGURED'}`);
}
console.log(`Mobile API URL:           ${mobileApiUrl || 'NOT CONFIGURED'}`);
if (adminEnv) {
  console.log(`Admin API URL:            ${adminApiUrl || 'NOT CONFIGURED'}`);
}

const issues = [];

if (!mobileProjectRef) issues.push('Mobile EXPO_PUBLIC_SUPABASE_URL is missing or invalid.');
if (!backendProjectRef) issues.push('Backend SUPABASE_URL is missing or invalid.');

if (mobileProjectRef && backendProjectRef && mobileProjectRef !== backendProjectRef) {
  issues.push(`Supabase Project Ref MISMATCH: Mobile (${mobileProjectRef}) != Backend (${backendProjectRef})`);
}

if (adminProjectRef && backendProjectRef && adminProjectRef !== backendProjectRef) {
  issues.push(`Supabase Project Ref MISMATCH: Admin (${adminProjectRef}) != Backend (${backendProjectRef})`);
}

if (mobileApiUrl && adminApiUrl && mobileApiUrl !== adminApiUrl) {
  issues.push(`API URL MISMATCH: Mobile (${mobileApiUrl}) != Admin (${adminApiUrl})`);
}

console.log('---------------------------------------------------');
if (issues.length === 0) {
  console.log('Status: MATCH (All environments aligned to project ref: ' + mobileProjectRef + ')');
  console.log('===================================================\n');
  process.exit(0);
} else {
  console.error('Status: MISMATCH');
  for (const issue of issues) {
    console.error(` - [FAIL] ${issue}`);
  }
  console.log('===================================================\n');
  process.exit(1);
}
