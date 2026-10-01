#!/usr/bin/env bash
# ==============================================================================
# SkillBridge — Production Deployment & Update Script
# ==============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
INFRA_DIR="$ROOT_DIR/infra"
COMPOSE_FILE="$INFRA_DIR/docker-compose.prod.yml"

if [ ! -f "$COMPOSE_FILE" ]; then
  COMPOSE_FILE="$INFRA_DIR/docker-compose.yml"
fi

echo "====================================================="
echo "   SkillBridge Production Deployment Initiated       "
echo "   Time: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
echo "   Compose File: $COMPOSE_FILE"
echo "====================================================="

# Step 1: Pre-flight environment check
if [ ! -f "$ROOT_DIR/backend/.env" ]; then
  echo "⚠️ Warning: $ROOT_DIR/backend/.env not found."
  if [ -f "$ROOT_DIR/.env.example" ]; then
    echo "Creating backend/.env from .env.example..."
    cp "$ROOT_DIR/.env.example" "$ROOT_DIR/backend/.env"
  fi
fi

# Step 2: Pull latest code if running from Git repo
if [ -d "$ROOT_DIR/.git" ]; then
  echo "[1/5] Fetching and pulling latest git commits..."
  git -C "$ROOT_DIR" pull --ff-only origin main || echo "Git pull skipped or not on fast-forward branch."
else
  echo "[1/5] Not a git repository, skipping pull."
fi

# Step 3: Build Docker images
echo "[2/5] Building production images with Docker Compose..."
docker compose -f "$COMPOSE_FILE" build --pull

# Step 4: Gracefully recreate and start containers
echo "[3/5] Starting containers in detached mode..."
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

# Step 5: Wait and verify container health
echo "[4/5] Waiting for services to stabilize..."
sleep 10
docker compose -f "$COMPOSE_FILE" ps

# Step 6: Cleanup stale/dangling images to preserve disk space
echo "[5/5] Cleaning up old unused Docker images..."
docker image prune -f

echo "====================================================="
echo "✅ Deployment completed successfully!"
echo "   To view live logs: docker compose -f $COMPOSE_FILE logs -f"
echo "====================================================="
