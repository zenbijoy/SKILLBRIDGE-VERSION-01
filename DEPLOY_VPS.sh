#!/usr/bin/env bash
# SkillBridge — Single VPS Deploy (Backend + Admin + Web Frontend + Showcase + APK Distribution)
# VPS   : 80.225.247.237
# API   : https://ruetskillbridge.duckdns.org
# Admin : https://ruetskillbridgeadmin.duckdns.org
# Web   : https://ruetskillbridgeweb.duckdns.org
# App Downloader : https://skillbridgeapk.duckdns.org
# APK   : https://skillbridgeapk.duckdns.org/download/SkillBridge.apk
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_DIR="$REPO_DIR/infra"

echo "================================================================="
echo "  SkillBridge Full Deployment (API + Admin + Web + Showcase + APK)"
echo "  $(date)"
echo "================================================================="

echo "[1/6] Fetching and fast-forwarding to latest git commits..."
if [ -d "$REPO_DIR/.git" ]; then
  git -C "$REPO_DIR" pull origin main || echo "Git pull completed or working tree updated."
fi

echo "[2/6] Pulling latest production APK from Cloudflare R2 CDN..."
mkdir -p "$REPO_DIR/release-apk"
curl -fSL -o "$REPO_DIR/release-apk/SkillBridge.apk" "https://pub-44498fcb7a6f4c4b83da4e693454b891.r2.dev/releases/SkillBridge.apk" || true
cp -f "$REPO_DIR/release-apk/SkillBridge.apk" "$REPO_DIR/SkillBridge.apk" || true

echo "[3/6] Building container images..."
docker compose -f "$INFRA_DIR/docker-compose.yml" build

echo "[4/6] Restarting microservices..."
docker compose -f "$INFRA_DIR/docker-compose.yml" up -d --remove-orphans

echo "[5/6] Waiting for health status..."
sleep 6
docker compose -f "$INFRA_DIR/docker-compose.yml" ps

echo "[6/6] Verifying production endpoints..."
curl -sI https://ruetskillbridge.duckdns.org/api/v1/health | head -n 1
curl -sI https://ruetskillbridgeadmin.duckdns.org | head -n 1
curl -sI https://ruetskillbridgeweb.duckdns.org | head -n 1
curl -sI https://skillbridgeapk.duckdns.org | head -n 1
curl -sI https://skillbridgeapk.duckdns.org/download/SkillBridge.apk | head -n 1

echo ""
echo "✅ All SkillBridge services deployed and healthy!"
echo "   📱 App Downloader: https://skillbridgeapk.duckdns.org"
echo "   📥 APK Direct    : https://skillbridgeapk.duckdns.org/download/SkillBridge.apk"
echo "   🌐 Web App       : https://ruetskillbridgeweb.duckdns.org"
echo "   ⚙️ Admin Console : https://ruetskillbridgeadmin.duckdns.org"
echo "   ⚡ API Engine    : https://ruetskillbridge.duckdns.org/api/v1/health"
echo "   📡 Version API   : https://ruetskillbridge.duckdns.org/api/v1/app/version"
