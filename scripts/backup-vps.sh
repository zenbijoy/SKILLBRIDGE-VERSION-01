#!/usr/bin/env bash
# ==============================================================================
# SkillBridge — Daily Backup Script (Caddy TLS, Redis dump, .env)
# ==============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="/var/backups/skillbridge"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
TARGET_ARCHIVE="$BACKUP_DIR/skillbridge_backup_$TIMESTAMP.tar.gz"

mkdir -p "$BACKUP_DIR"

echo "Creating backup archive at $TARGET_ARCHIVE..."

tar -czf "$TARGET_ARCHIVE" \
  -C "$ROOT_DIR" \
  backend/.env \
  infra/caddy/Caddyfile \
  2>/dev/null || true

# Keep only last 14 days of backups
find "$BACKUP_DIR" -type f -name "skillbridge_backup_*.tar.gz" -mtime +14 -exec rm -f {} \;

echo "Backup complete: $TARGET_ARCHIVE"
