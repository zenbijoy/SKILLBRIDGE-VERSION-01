#!/usr/bin/env bash
# SkillBridge — VPS Backend Deploy (Render alternative)
# Usage: bash DEPLOY_VPS.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_DIR="$REPO_DIR/infra"

echo "========================================"
echo "  SkillBridge Backend Deploy"
echo "  $(date)"
echo "========================================"

echo "[1/4] Pulling latest code..."
git -C "$REPO_DIR" pull --ff-only origin main

echo "[2/4] Building API image..."
docker compose -f "$INFRA_DIR/docker-compose.yml" build --pull api

echo "[3/4] Restarting services..."
docker compose -f "$INFRA_DIR/docker-compose.yml" up -d --remove-orphans

echo "[4/4] Status check..."
sleep 5
docker compose -f "$INFRA_DIR/docker-compose.yml" ps

echo ""
echo "✅ Done! API running at https://api.YOUR_DOMAIN.com"
