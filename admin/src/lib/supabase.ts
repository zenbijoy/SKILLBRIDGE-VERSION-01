import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  const msg = '[SkillBridge Admin] VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set. Add them to Vercel environment variables for the admin deployment.';
  console.error(msg);
  throw new Error(msg);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

