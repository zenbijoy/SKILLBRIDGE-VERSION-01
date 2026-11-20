import { createClient } from '../backend/node_modules/@supabase/supabase-js/dist/main/index.js';

const url = 'https://wyqsoxkwmulhpcoslnoj.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5cXNveGt3bXVsaHBjb3Nsbm9qIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjI4MDEzNSwiZXhwIjoyMTAxODU2MTM1fQ.KfIgPUQU3p-NxpG_9Me4B9gT9WZcXdBj3ohQQYV_5oc';
const admin = createClient(url, key);

async function test() {
  const university = 'Campus';
  const filter = `title.ilike.%${university}%Help%,title.ilike.%Academic Help%,title.ilike.%Campus Help%`;
  const res = await admin
    .from('rooms')
    .select('id, title')
    .or(filter)
    .limit(1)
    .maybeSingle();
  console.log('PostgREST or query result:', res);
}
test();
