#!/usr/bin/env bash
# SkillBridge — Full VPS Deploy Script
# Usage: bash DEPLOY_VPS.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_DIR="$REPO_DIR/infra"

echo "========================================"
echo "  SkillBridge VPS Deploy"
echo "  $(date)"
echo "========================================"

# Pull latest code
echo "[1/5] Pulling latest code from GitHub..."
git -C "$REPO_DIR" pull --ff-only origin main

# Pull latest Docker base images
echo "[2/5] Pulling latest Docker base images..."
docker compose -f "$INFRA_DIR/docker-compose.yml" pull --quiet

# Build API image
echo "[3/5] Building API Docker image..."
docker compose -f "$INFRA_DIR/docker-compose.yml" build --pull api

# Start / restart services
echo "[4/5] Starting / restarting services..."
docker compose -f "$INFRA_DIR/docker-compose.yml" up -d --remove-orphans

# Health check
echo "[5/5] Verifying service health..."
sleep 8
docker compose -f "$INFRA_DIR/docker-compose.yml" ps

echo ""
echo "✅ Deploy complete!  $(date)"
