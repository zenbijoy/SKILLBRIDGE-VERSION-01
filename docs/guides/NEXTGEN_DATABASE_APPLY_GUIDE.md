# Next-Gen Database Apply Guide

This document provides step-by-step instructions for safely applying Next-Gen database migrations **028** and **029** to your Supabase project without downtime, data loss, or schema locking.

---

## Pre-Flight Checklist

1. **Backup Existing Data**:
   - Open your **Supabase Dashboard** -> **Settings** -> **Database** -> **Backups**.
   - Create a manual backup snapshot or confirm an automated daily backup exists.
2. **Review Pending Migrations**:
   - [`infra/supabase/migrations/028_nextgen_foundations.sql`](file:///c:/Users/24030/source/skillbridge-final/infra/supabase/migrations/028_nextgen_foundations.sql)
   - [`infra/supabase/migrations/029_nextgen_hardening.sql`](file:///c:/Users/24030/source/skillbridge-final/infra/supabase/migrations/029_nextgen_hardening.sql)
3. **Execution Order**:
   - **Step 1**: Run `028_nextgen_foundations.sql` (Creates base tables, RLS enablement, and initial policies).
   - **Step 2**: Run `029_nextgen_hardening.sql` (Adds uniqueness constraints, indexes, clash negotiation policies, and feature flags).

---

## Execution Instructions (Supabase Web Dashboard)

1. Navigate to: `https://supabase.com/dashboard/project/<your-project-id>/sql`
2. **Apply 028**:
   - Copy the entire contents of [`infra/supabase/migrations/028_nextgen_foundations.sql`](file:///c:/Users/24030/source/skillbridge-final/infra/supabase/migrations/028_nextgen_foundations.sql).
   - Paste into the SQL query box and click **Run**.
   - Ensure the query output says: `Success. No rows returned`.
3. **Apply 029**:
   - Copy the entire contents of [`infra/supabase/migrations/029_nextgen_hardening.sql`](file:///c:/Users/24030/source/skillbridge-final/infra/supabase/migrations/029_nextgen_hardening.sql).
   - Paste into the SQL query box and click **Run**.
   - Ensure the query output says: `Success. No rows returned`.

---

## Automated Verification

Once applied, run the repository verification script:
```bash
node scripts/verify-nextgen-schema.mjs
```
The script queries each table with `LIMIT 1` using your service role credentials to verify that tables, columns, and permissions are active.

---

## Post-Migration Verification Queries (SQL Editor)

Run this quick test query in your Supabase SQL Editor:
```sql
SELECT table_name, rowsecurity 
FROM information_schema.tables t
JOIN pg_tables p ON t.table_name = p.tablename
WHERE table_name IN (
  'room_questions', 
  'room_question_answers', 
  'room_question_votes', 
  'room_recordings', 
  'media_objects', 
  'campus_posts', 
  'campus_post_reactions', 
  'campus_post_comments', 
  'anonymous_author_map', 
  'club_clash_negotiations'
);
```
Expected: 10 rows returned, all with `rowsecurity = true`.

---

## Rollback & Repair Guidance

If you need to roll back these additions in a development or test environment:
```sql
DROP TABLE IF EXISTS public.club_clash_negotiations CASCADE;
DROP TABLE IF EXISTS public.anonymous_author_map CASCADE;
DROP TABLE IF EXISTS public.campus_post_comments CASCADE;
DROP TABLE IF EXISTS public.campus_post_reactions CASCADE;
DROP TABLE IF EXISTS public.campus_posts CASCADE;
DROP TABLE IF EXISTS public.media_objects CASCADE;
DROP TABLE IF EXISTS public.room_recordings CASCADE;
DROP TABLE IF EXISTS public.room_question_votes CASCADE;
DROP TABLE IF EXISTS public.room_question_answers CASCADE;
DROP TABLE IF EXISTS public.room_questions CASCADE;
```
*(Existing tables: `rooms`, `profiles`, `clubs`, `events`, `resources` will remain completely unaffected).*
