# How to View Production Data Safely

This document outlines how to safely inspect your production data inside the Self-Hosted Supabase instance (`https://swapno.duckdns.org`).

## Accessing Supabase Studio

1. Navigate to your VPS domain on port 8000 (default Studio port in self-hosted deployments) or via your gateway proxy if configured (e.g., `https://swapno.duckdns.org/studio`).
2. If Studio is disabled in production for security reasons, you will need to query the database directly using `psql` inside the VPS.

## Direct Database Querying (VPS Internal)

To query the production database securely without exposing port 5432:

1. **SSH into the Oracle VPS**.
2. Run the `psql` client inside the Supabase Postgres Docker container:
   ```bash
   docker exec -it <supabase_db_container_name> psql -U postgres
   ```
   *(Usually the container is named `supabase-db` or similar)*

### Helpful SQL Queries

**View all public tables:**
```sql
SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public';
```

**Table Row Counts (Approximate & Fast):**
```sql
SELECT relname as table_name, reltuples as estimated_rows 
FROM pg_class 
WHERE relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public') 
  AND relkind = 'r' 
ORDER BY reltuples DESC;
```

**Indexes Status:**
```sql
SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public';
```

**RLS Status:**
```sql
SELECT relname, relrowsecurity, relforcerowsecurity 
FROM pg_class 
WHERE oid IN (
    SELECT c.oid
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
);
```

**View RLS Policies:**
```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE schemaname = 'public';
```

**View Migration History:**
```sql
SELECT * FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 10;
```

**View RPCs / Functions:**
```sql
SELECT p.proname AS function_name, pg_get_function_identity_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public';
```

**Note:** Never expose database passwords or keys in plain text. Always execute these queries internally on the VPS or via an authorized Studio connection.
