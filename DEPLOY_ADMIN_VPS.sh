#!/usr/bin/env bash
# SkillBridge — Admin Panel VPS Deploy
# Domain : ruetskillbridgeadmin.duckdns.org (118.179.110.189)
# Backend: ruetskillbridge.duckdns.org     (118.179.110.183)
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_DIR="$REPO_DIR/infra"

echo "========================================"
echo "  SkillBridge Admin Panel Deploy"
echo "  $(date)"
echo "========================================"

echo "[1/4] Pulling latest code..."
git -C "$REPO_DIR" pull --ff-only origin main

echo "[2/4] Building Admin image..."
docker compose -f "$INFRA_DIR/docker-compose.admin.yml" build --pull admin

echo "[3/4] Restarting services..."
docker compose -f "$INFRA_DIR/docker-compose.admin.yml" up -d --remove-orphans

echo "[4/4] Status check..."
sleep 8
docker compose -f "$INFRA_DIR/docker-compose.admin.yml" ps

echo ""
echo "✅ Done!"
echo "   Admin: https://ruetskillbridgeadmin.duckdns.org"
