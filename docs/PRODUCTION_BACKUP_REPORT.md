# Production Database Backup Procedure & Manifest

## Backup Strategy & Policy

Before any production database migration is executed against `swapno.duckdns.org`, a full timestamped backup must be captured:

### Backup Command Specification
```bash
# Executed on VPS Host inside Supabase docker compose directory
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/skillbridge/${TIMESTAMP}"
mkdir -p "${BACKUP_DIR}"

# 1. PostgreSQL Schema + Data Dump
docker exec -t supabase-db pg_dumpall -U postgres | gzip > "${BACKUP_DIR}/supabase_db_full.sql.gz"

# 2. Schema-only snapshot
docker exec -t supabase-db pg_dump -U postgres -d postgres --schema-only | gzip > "${BACKUP_DIR}/schema_only.sql.gz"

# 3. Migration Metadata Snapshot
docker exec -t supabase-db psql -U postgres -d postgres -c "SELECT * FROM skillbridge_meta.schema_migrations;" > "${BACKUP_DIR}/migration_history.txt"

# 4. Generate SHA-256 Checksums
sha256sum "${BACKUP_DIR}"/* > "${BACKUP_DIR}/manifest.sha256"
```

## Restoration Procedure

```bash
# In the event of an unexpected migration failure:
gunzip -c "${BACKUP_DIR}/supabase_db_full.sql.gz" | docker exec -i supabase-db psql -U postgres -d postgres
```

## Backup Safety Verification Rule
No write migration (`012` / `013`) may be applied to production unless `manifest.sha256` is verified and non-empty.
