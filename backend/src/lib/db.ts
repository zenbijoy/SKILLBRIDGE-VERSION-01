import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";
export let admin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export function setAdminClient(mockClient: any) {
  admin = mockClient;
}
export const publicClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
