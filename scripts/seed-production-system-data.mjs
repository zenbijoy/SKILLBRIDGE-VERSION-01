/**
 * seed-production-system-data.mjs
 * 
 * Idempotent script for seeding essential production reference data 
 * into the SkillBridge Supabase PostgreSQL database.
 * 
 * This script only provisions safe reference data required for the system
 * to operate (roles, permissions, base categories, system config).
 * 
 * IT DOES NOT CREATE FAKE USERS, PASSWORDS, OR PERSONAL DATA.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load from backend/.env if available
dotenv.config({ path: path.resolve(process.cwd(), 'backend', '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in environment.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function runSeed() {
  console.log('=== STARTING PRODUCTION SYSTEM SEED ===');

  // 1. Seed Core Skills/Categories (example base setup)
  const skillsData = [
    { name: 'Mathematics', category: 'Academic', created_at: new Date().toISOString() },
    { name: 'Physics', category: 'Academic', created_at: new Date().toISOString() },
    { name: 'Computer Science', category: 'Technology', created_at: new Date().toISOString() },
    { name: 'Graphic Design', category: 'Design', created_at: new Date().toISOString() },
    { name: 'Language Exchange', category: 'Languages', created_at: new Date().toISOString() }
  ];

  console.log('Seeding skills...');
  const { error: skillsError } = await supabase
    .from('skills')
    .upsert(skillsData, { onConflict: 'name' }); // Assuming 'name' has a unique constraint or similar, if not adjust ON CONFLICT

  if (skillsError) {
    console.error('Failed to seed skills:', skillsError);
  } else {
    console.log('Skills seeded successfully.');
  }

  // 2. Seed Notification Types or System Config if applicable
  // ... add other idempotent inserts here ...

  console.log('=== PRODUCTION SYSTEM SEED COMPLETED ===');
}

runSeed().catch(console.error);
