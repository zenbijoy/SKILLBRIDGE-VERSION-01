import { createClient } from '../backend/node_modules/@supabase/supabase-js/dist/index.mjs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from '../backend/node_modules/dotenv/lib/main.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load backend .env
const envPath = path.resolve(__dirname, '../backend/.env');
dotenv.config({ path: envPath });

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('[ERROR] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend/.env');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const targetEmail = process.argv[2] || process.env.ADMIN_BOOTSTRAP_EMAIL || 'admin@skillbridge.com';
const targetPassword = process.argv[3] || process.env.ADMIN_BOOTSTRAP_TEMP_PASSWORD || 'SkillBridgeAdmin2026!';

async function setupAdmin() {
  console.log('====================================================');
  console.log('       SKILLBRIDGE ADMIN PROVISIONING SCRIPT         ');
  console.log('====================================================\n');
  console.log(`Target Email:    ${targetEmail}`);
  console.log(`Target Password: ${targetPassword}\n`);

  try {
    // 1. Check if user already exists in auth.users
    console.log('[1/4] Checking existing Supabase Auth users...');
    const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) throw listError;

    let user = usersData.users.find((u) => u.email?.toLowerCase() === targetEmail.toLowerCase());

    if (!user) {
      console.log(`[2/4] Creating new Supabase Auth user: ${targetEmail}...`);
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email: targetEmail,
        password: targetPassword,
        email_confirm: true,
        user_metadata: { full_name: 'System Administrator', is_admin: true },
      });
      if (createError) throw createError;
      user = created.user;
      console.log(`      User created successfully with ID: ${user.id}`);
    } else {
      console.log(`[2/4] User already exists (ID: ${user.id}). Updating password...`);
      const { data: updated, error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
        password: targetPassword,
        email_confirm: true,
      });
      if (updateError) throw updateError;
      console.log('      Password updated successfully.');
    }

    // 2. Grant admin_account in public.admin_accounts
    console.log('[3/4] Registering admin record in public.admin_accounts...');
    const { error: adminAccError } = await supabase
      .from('admin_accounts')
      .upsert({
        user_id: user.id,
        role: 'owner',
        status: 'active',
        must_change_credentials: false,
        mfa_required: false,
        activated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (adminAccError) {
      if (adminAccError.code === '42501' || adminAccError.message.includes('permission denied')) {
        console.warn('\n[!] NOTICE: Database table permissions need to be granted in Supabase.');
        console.warn('    Please run this 1-minute SQL grant in Supabase SQL Editor:');
        console.warn('    https://supabase.com/dashboard/project/wyqsoxkwmulhpcoslnoj/sql/new\n');
        console.warn(`
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

INSERT INTO public.admin_accounts (user_id, role, status, must_change_credentials, mfa_required)
VALUES ('${user.id}', 'owner', 'active', false, false)
ON CONFLICT (user_id) DO UPDATE SET role = 'owner', status = 'active', must_change_credentials = false;
        `);
      } else {
        throw adminAccError;
      }
    } else {
      console.log('      Owner account registered successfully in admin_accounts.');
    }

    // 3. Update public.profiles roles
    console.log('[4/4] Updating user roles in public.profiles...');
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        full_name: 'System Administrator',
        roles: ['student', 'teacher', 'admin', 'owner'],
        account_status: 'active',
      }, { onConflict: 'id' });

    if (profileError && profileError.code !== '42501') {
      console.warn(`      Note on profile update: ${profileError.message}`);
    } else if (!profileError) {
      console.log('      Profile roles updated with ["owner", "admin"].');
    }

    console.log('\n====================================================');
    console.log('             ADMIN SETUP COMPLETE!                   ');
    console.log('====================================================');
    console.log(`Portal URL: http://localhost:5173/login`);
    console.log(`Email:      ${targetEmail}`);
    console.log(`Password:   ${targetPassword}`);
    console.log('====================================================\n');
  } catch (err) {
    console.error('[FAILED] Error provisioning admin:', err.message || err);
    process.exit(1);
  }
}

setupAdmin();
