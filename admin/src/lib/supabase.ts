import { createClient } from '@supabase/supabase-js';

export function sanitizeEnvString(value: unknown): string {
  if (typeof value !== 'string') return '';
  // If multiple lines were accidentally pasted into Vercel, take only the first line
  const firstLine = value.split(/[\r\n]/)[0].trim();
  // Strip any surrounding single or double quotation marks
  return firstLine.replace(/^["']|["']$/g, '').trim();
}

const supabaseUrl = sanitizeEnvString(import.meta.env.VITE_SUPABASE_URL);
const supabaseAnonKey = sanitizeEnvString(import.meta.env.VITE_SUPABASE_ANON_KEY);

if (!supabaseUrl || !supabaseAnonKey) {
  const msg = '[SkillBridge Admin] VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set. Add them to Vercel environment variables for the admin deployment.';
  console.error(msg);
  throw new Error(msg);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

