#!/usr/bin/env bash
# SkillBridge — Single VPS Deploy (Backend + Admin + Web Frontend)
# VPS   : 80.225.247.237
# API   : https://ruetskillbridge.duckdns.org
# Admin : https://ruetskillbridgeadmin.duckdns.org
# Web   : https://ruetskillbridgeweb.duckdns.org
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_DIR="$REPO_DIR/infra"

echo "========================================"
echo "  SkillBridge Full Deploy (API + Admin + Web)"
echo "  $(date)"
echo "========================================"

echo "[1/4] Pulling latest code..."
git -C "$REPO_DIR" pull --ff-only origin main

echo "[2/4] Building images..."
docker compose -f "$INFRA_DIR/docker-compose.yml" build --pull

echo "[3/4] Restarting services..."
docker compose -f "$INFRA_DIR/docker-compose.yml" up -d --remove-orphans

echo "[4/4] Status check..."
sleep 8
docker compose -f "$INFRA_DIR/docker-compose.yml" ps

echo ""
echo "✅ Done!"
echo "   API   : https://ruetskillbridge.duckdns.org/api/v1/health"
echo "   Admin : https://ruetskillbridgeadmin.duckdns.org"
echo "   Web   : https://ruetskillbridgeweb.duckdns.org"
