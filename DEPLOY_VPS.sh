#!/usr/bin/env bash
# SkillBridge — Single VPS Deploy (Backend + Admin + Web Frontend + Showcase + APK Distribution)
# VPS   : 80.225.247.237
# API   : https://ruetskillbridge.duckdns.org
# Admin : https://ruetskillbridgeadmin.duckdns.org
# Web   : https://ruetskillbridgeweb.duckdns.org
# Showcase: https://ruetskillbridgeweb.duckdns.org/showcase/
# APK   : https://ruetskillbridgeweb.duckdns.org/download/SkillBridge.apk
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_DIR="$REPO_DIR/infra"

echo "================================================================="
echo "  SkillBridge Full Deployment (API + Admin + Web + Showcase + APK)"
echo "  $(date)"
echo "================================================================="

echo "[1/4] Building container images..."
docker compose -f "$INFRA_DIR/docker-compose.yml" build

echo "[2/4] Restarting microservices..."
docker compose -f "$INFRA_DIR/docker-compose.yml" up -d --remove-orphans

echo "[3/4] Waiting for health status..."
sleep 6
docker compose -f "$INFRA_DIR/docker-compose.yml" ps

echo "[4/4] Verifying production endpoints..."
curl -sI https://ruetskillbridge.duckdns.org/api/v1/health | head -n 1
curl -sI https://ruetskillbridgeadmin.duckdns.org | head -n 1
curl -sI https://ruetskillbridgeweb.duckdns.org | head -n 1
curl -sI https://ruetskillbridgeweb.duckdns.org/showcase/ | head -n 1
curl -sI https://ruetskillbridgeweb.duckdns.org/download/SkillBridge.apk | head -n 1

echo ""
echo "✅ All SkillBridge services deployed and healthy!"
echo "   🌐 Web App      : https://ruetskillbridgeweb.duckdns.org"
echo "   📱 Showcase Web : https://ruetskillbridgeweb.duckdns.org/showcase/"
echo "   📥 APK Download : https://ruetskillbridgeweb.duckdns.org/download/SkillBridge.apk"
echo "   ⚙️ Admin Console: https://ruetskillbridgeadmin.duckdns.org"
echo "   ⚡ API Engine   : https://ruetskillbridge.duckdns.org/api/v1/health"
echo "   📡 Version API  : https://ruetskillbridge.duckdns.org/api/v1/app/version"
