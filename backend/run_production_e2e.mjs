import { createClient } from '@supabase/supabase-js';


const SUPABASE_URL = 'https://swapno.duckdns.org';
// We need the anon key.
import fs from 'fs';
const envContent = fs.readFileSync('../frontend/.env', 'utf-8');
const anonKeyMatch = envContent.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
const SUPABASE_ANON_KEY = anonKeyMatch ? anonKeyMatch[1].trim() : '';

const API_URL = 'https://swapno.duckdns.org/api';

if (!SUPABASE_ANON_KEY) {
  console.error("No anon key found!");
  process.exit(1);
}

const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3ODM5Mjk5NjgsImV4cCI6MjA5OTI4OTk2OH0.dFUGFHhe5VwywimBcjawE96ZRaw7m7BTyzSs9Qha0tE';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function runE2E() {
  console.log("=== STARTING PRODUCTION E2E TESTS ===");
  
  // 1. AUTH E2E
  console.log("\\n--- AUTH E2E ---");
  const testEmail = `e2etest_${Date.now()}@example.com`;
  const testPassword = 'Password123!';
  
  console.log(`Creating user with admin API ${testEmail}...`);
  const { data: signUpData, error: signUpError } = await supabaseAdmin.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    email_confirm: true
  });
  if (signUpError) {
    console.error("User creation failed:", signUpError.message);
  } else {
    console.log("User creation success:", signUpData.user?.id);
  }

  console.log("Logging in...");
  const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword
  });
  if (loginError) {
    console.error("Login failed:", loginError.message);
  } else {
    console.log("Login success. Session acquired.");
  }
  
  // Duplicate account
  console.log("Testing duplicate account...");
  const { error: dupError } = await supabase.auth.signUp({
    email: testEmail,
    password: testPassword
  });
  if (dupError) {
    console.log("Duplicate account rejected properly:", dupError.message);
  } else {
    console.error("Duplicate account allowed (bad).");
  }

  // Invalid password
  console.log("Testing invalid password...");
  const { error: invPwdError } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: 'WrongPassword123'
  });
  if (invPwdError) {
    console.log("Invalid password rejected properly:", invPwdError.message);
  } else {
    console.error("Invalid password allowed (bad).");
  }
  
  // Refresh token
  console.log("Testing refresh token...");
  const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) {
    console.error("Refresh session failed:", refreshError.message);
  } else {
    console.log("Refresh session success.");
  }

  let sessionToken = loginData?.session?.access_token;
  
  // 2. PROFILE E2E
  console.log("\\n--- PROFILE / USER E2E ---");
  if (sessionToken) {
    console.log("Fetching profile from Express API...");
    const profileRes = await fetch(`${API_URL}/api/v1/profiles/me`, {
      headers: { Authorization: `Bearer ${sessionToken}` }
    });
    if (!profileRes.ok) {
      console.error("Failed to fetch profile. Status:", profileRes.status);
    } else {
      const profile = await profileRes.json();
      console.log("Profile fetched:", profile.id);
    }
  }

  // Search E2E
  console.log("\\n--- DISCOVER / SEARCH E2E ---");
  const searchRes = await fetch(`${API_URL}/api/v1/search?q=test`, {
     headers: { Authorization: `Bearer ${sessionToken}` }
  });
  if (!searchRes.ok) {
     console.error("Search failed. Status:", searchRes.status);
  } else {
     const searchBody = await searchRes.json();
     console.log("Search success. Found:", searchBody.data?.length || 0);
  }

  // Logout
  console.log("\\nLogging out...");
  const { error: logoutError } = await supabase.auth.signOut();
  if (logoutError) {
    console.error("Logout failed:", logoutError.message);
  } else {
    console.log("Logout success.");
  }
  
  console.log("\\n=== E2E COMPLETED ===");
}

runE2E().catch(console.error);
