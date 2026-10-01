#!/usr/bin/env bash
# ==============================================================================
# SkillBridge — 1-Click Complete Production VPS Setup Script
# Repository: https://github.com/zenbijoy/SKILLBRIDGE-VERSION-01.git
# Domains   : ruetskillbridge.duckdns.org (API)
#             ruetskillbridgeadmin.duckdns.org (Admin)
# ==============================================================================
set -euo pipefail

# ANSI Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${BLUE}==================================================================${NC}"
echo -e "${GREEN}     SkillBridge 1-Click Full Production VPS Provisioning        ${NC}"
echo -e "${BLUE}==================================================================${NC}"

# 1. Root verification
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[ERROR] This setup script must be executed as root.${NC}"
  echo "Usage: sudo bash $0"
  exit 1
fi

APP_DIR="/opt/skillbridge"
REPO_URL="https://github.com/zenbijoy/SKILLBRIDGE-VERSION-01.git"

# 2. Update System Packages
echo -e "\n${BLUE}[1/8] Updating apt packages and installing base dependencies...${NC}"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold"
apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  gnupg \
  lsb-release \
  git \
  ufw \
  fail2ban \
  htop \
  jq \
  wget \
  tar \
  software-properties-common

# 3. Create 2GB Swap Memory (Prevents Out-Of-Memory killed during Docker build)
echo -e "\n${BLUE}[2/8] Configuring 2GB Swap memory...${NC}"
if [ $(swapon --show | wc -l) -le 1 ]; then
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  if ! grep -q '/swapfile' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
  echo -e "${GREEN}Swap activated.${NC}"
else
  echo -e "${GREEN}Swap already active.${NC}"
fi

# Kernel Optimization
cat > /etc/sysctl.d/99-skillbridge.conf << 'EOF'
vm.swappiness=10
vm.vfs_cache_pressure=50
vm.overcommit_memory=1
net.core.somaxconn=1024
EOF
sysctl -p /etc/sysctl.d/99-skillbridge.conf > /dev/null 2>&1 || true

# 4. Install Docker Engine & Docker Compose Plugin
echo -e "\n${BLUE}[3/8] Installing Docker Engine & Compose plugin...${NC}"
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
else
  echo -e "${GREEN}Docker is already installed: $(docker --version)${NC}"
fi


# Docker Log Rotation (Crucial to prevent disk space exhaustion)
mkdir -p /etc/docker
cat > /etc/docker/daemon.json << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF
systemctl restart docker
systemctl enable docker

# 5. Configure UFW Firewall & Fail2ban
echo -e "\n${BLUE}[4/8] Securing host with UFW Firewall & Fail2ban...${NC}"
ufw --force reset > /dev/null 2>&1
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable

# Free port 80/443 from host-level apache2/nginx if installed by default
systemctl stop apache2 nginx > /dev/null 2>&1 || true
systemctl disable apache2 nginx > /dev/null 2>&1 || true


cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
port = 22
filter = sshd
backend = systemd
EOF
systemctl restart fail2ban
systemctl enable fail2ban

# 6. Clone or Update SkillBridge Repository
echo -e "\n${BLUE}[5/8] Synchronizing repository at $APP_DIR...${NC}"
if [ -d "$APP_DIR/.git" ]; then
  echo "Updating existing repository..."
  git -C "$APP_DIR" fetch origin main
  git -C "$APP_DIR" reset --hard origin/main
elif [ -d "$PWD/.git" ] && [ "$PWD" != "$APP_DIR" ]; then
  echo "Copying current workspace to $APP_DIR..."
  mkdir -p "$APP_DIR"
  cp -r "$PWD/." "$APP_DIR/"
else
  echo "Cloning from $REPO_URL..."
  mkdir -p "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"

# 7. Write Full Production Environment Files
echo -e "\n${BLUE}[6/8] Writing full production environment configuration...${NC}"

# Backend .env
cat > "$APP_DIR/backend/.env" << 'EOF'
# -----------------------------------------------------------------------------
# SkillBridge Backend — VPS Production Environment
# Domain: ruetskillbridge.duckdns.org | IP: 118.179.110.183
# -----------------------------------------------------------------------------

NODE_ENV=production
PORT=4000
LOG_LEVEL=info

# ── Supabase ──────────────────────────────────────────────────────────────────
SUPABASE_URL=https://wyqsoxkwmulhpcoslnoj.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5cXNveGt3bXVsaHBjb3Nsbm9qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyODAxMzUsImV4cCI6MjEwMTg1NjEzNX0.KFiTn-UCZoL_TWHMjOTums4Fs_DoMK_iGF3v-mdv6_o
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5cXNveGt3bXVsaHBjb3Nsbm9qIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjI4MDEzNSwiZXhwIjoyMTAxODU2MTM1fQ.KfIgPUQU3p-NxpG_9Me4B9gT9WZcXdBj3ohQQYV_5oc

# ── CORS Origins ──────────────────────────────────────────────────────────────
WEB_ORIGINS=http://localhost:8081,http://127.0.0.1:8081,http://localhost:5173,http://127.0.0.1:5173,https://skillbridge-frontend.vercel.app,https://skillbridge-admin.vercel.app,https://ruetskillbridge.duckdns.org,https://ruetskillbridgeadmin.duckdns.org

# ── Redis (Upstash Cloud) ─────────────────────────────────────────────────────
REDIS_URL=rediss://default:gQAAAAAAAS19AAIgcDE5NmY5NzVmZTc1MTY0OGY1OWQxNGI5MDFiNjAxZWU5ZQ@above-sparrow-77181.upstash.io:6379
UPSTASH_REDIS_REST_URL=https://above-sparrow-77181.upstash.io
UPSTASH_REDIS_REST_TOKEN=gQAAAAAAAS19AAIgcDE5NmY5NzVmZTc1MTY0OGY1OWQxNGI5MDFiNjAxZWU5ZQ
REDIS_REQUIRED=false

# ── LiveKit (Cloud) ───────────────────────────────────────────────────────────
LIVEKIT_URL=wss://skillbridge-rrx7e4cd.livekit.cloud
LIVEKIT_API_KEY=APIErCJDpRFfLiw
LIVEKIT_API_SECRET=VY2e95PotVa6WNMVuM65JzhbwNO34gb4JI9cVbDVaNd

# ── Push Notifications ────────────────────────────────────────────────────────
EXPO_PUSH_ACCESS_TOKEN=pA22IrkC5uHH2Hixwcqit9IXELklzlpEE5z3-SBH

# ── Cloudflare TURN ───────────────────────────────────────────────────────────
P2P_CALLS_ENABLED=true
CLOUDFLARE_TURN_ENABLED=true
CLOUDFLARE_TURN_KEY_ID=f88f1e972915d2de98b07d84ac236daa
CLOUDFLARE_TURN_API_TOKEN=fcd51659cd7e4144dda682a7344545ab7fb0779959c73972fbd69b467e9c06bd
TURN_CREDENTIAL_TTL_SECONDS=3600
CALL_RING_TIMEOUT_SECONDS=40
CALL_MAX_RECONNECT_ATTEMPTS=3

# ── Cloudflare R2 Storage ─────────────────────────────────────────────────────
R2_ACCOUNT_ID=67f44ec178f1789db2a9c6a999b2e859
R2_ACCESS_KEY_ID=0b5eb29178500056bd24d8ff6cf81c30
R2_SECRET_ACCESS_KEY=7fecf15674497bd486269c5049604cc04c308f65ec2e19dafb0905cc7c763839
R2_BUCKET_NAME=skillbridge-media
R2_PUBLIC_DOMAIN=https://pub-44498fcb7a6f4c4b83da4e693454b891.r2.dev

# ── App Config ────────────────────────────────────────────────────────────────
MAX_ROOM_CAPACITY=250
GLOBAL_RATE_LIMIT_PER_MINUTE=120
MAINTENANCE_MODE=false

# ── Admin ─────────────────────────────────────────────────────────────────────
ADMIN_BOOTSTRAP_ENABLED=false
ADMIN_BOOTSTRAP_EMAIL=admin@skillbridge.com
ADMIN_BOOTSTRAP_TEMP_PASSWORD=SkillBridgeAdmin2026!
ADMIN_BOOTSTRAP_EXPIRES_AT=2026-12-31T23:59:59Z
ADMIN_REQUIRE_MFA=false
ADMIN_APP_URL=https://skillbridge-admin.vercel.app
EOF

# AI: Gemini Multi-Account Failover Pool
GEM_K1=$(echo "QVEuQWI4Uk42SmtSYWJEVzBrQnZaRmM0Q3JXcFpUT3hfTk5YN2Ftdk1tbWlHeVJjb2xId2c=" | base64 -d 2>/dev/null || true)
GEM_KALL=$(echo "QVEuQWI4Uk42SmtSYWJEVzBrQnZaRmM0Q3JXcFpUT3hfTk5YN2Ftdk1tbWlHeVJjb2xId2csQVEuQWI4Uk42S0trZEVTOWNHM1B3V0dYVjE3akduTHhkaWtGSHZ0WW9xQ2FxWE91NHdPaFEsQVEuQWI4Uk42TFlnS21ZT0dFZlBxWVUtVURfNmVlcEdfVk5STmNPb2NmT3h6WTdWSHFmM1E=" | base64 -d 2>/dev/null || true)

cat >> "$APP_DIR/backend/.env" << EOF
GEMINI_API_KEY=${GEM_K1}
GEMINI_API_KEYS=${GEM_KALL}
QUIZ_SESSION_SECRET=e6b219e2786a34cd1b98ac9e223b2c918ef0a5d218204642ab6ecdb4c5eeff80
EOF


# Admin .env
cat > "$APP_DIR/admin/.env" << 'EOF'
VITE_SUPABASE_URL=https://wyqsoxkwmulhpcoslnoj.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5cXNveGt3bXVsaHBjb3Nsbm9qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyODAxMzUsImV4cCI6MjEwMTg1NjEzNX0.KFiTn-UCZoL_TWHMjOTums4Fs_DoMK_iGF3v-mdv6_o
VITE_API_URL=https://ruetskillbridge.duckdns.org/api/v1
EOF
chmod 600 "$APP_DIR/backend/.env" "$APP_DIR/admin/.env" || true

# Caddy Reverse Proxy Configuration
mkdir -p "$APP_DIR/infra/caddy"
cat > "$APP_DIR/infra/caddy/Caddyfile" << 'EOF'
# ── SkillBridge Backend API ────────────────────────────────────────────────────
ruetskillbridge.duckdns.org {
    @ws {
        header Connection *Upgrade*
        header Upgrade    websocket
    }
    reverse_proxy @ws api:4000
    reverse_proxy api:4000

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options    "nosniff"
        X-Frame-Options           "DENY"
        Referrer-Policy           "strict-origin-when-cross-origin"
        -Server
    }

    encode gzip zstd
}

# ── SkillBridge Admin Panel ────────────────────────────────────────────────────
ruetskillbridgeadmin.duckdns.org {
    reverse_proxy admin:80

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options    "nosniff"
        X-Frame-Options           "DENY"
        Referrer-Policy           "strict-origin-when-cross-origin"
        -Server
    }

    encode gzip zstd
}
EOF

# Ensure docker-compose.yml uses correct context
cat > "$APP_DIR/infra/docker-compose.yml" << 'EOF'
services:
  # ── SkillBridge Backend API ───────────────────────────────────────────────────
  api:
    build:
      context: ..
      dockerfile: Dockerfile
    env_file: ../backend/.env
    restart: unless-stopped
    ports:
      - "127.0.0.1:4000:4000"
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://127.0.0.1:4000/api/v1/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "5"

  # ── SkillBridge Admin Panel ───────────────────────────────────────────────────
  admin:
    build:
      context: ../admin
      dockerfile: Dockerfile
      args:
        VITE_SUPABASE_URL: https://wyqsoxkwmulhpcoslnoj.supabase.co
        VITE_SUPABASE_ANON_KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5cXNveGt3bXVsaHBjb3Nsbm9qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyODAxMzUsImV4cCI6MjEwMTg1NjEzNX0.KFiTn-UCZoL_TWHMjOTums4Fs_DoMK_iGF3v-mdv6_o
        VITE_API_URL: https://ruetskillbridge.duckdns.org/api/v1
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:80"
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://127.0.0.1:80/"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
    logging:
      driver: "json-file"
      options:
        max-size: "5m"
        max-file: "3"

  # ── Caddy (Auto HTTPS for both domains) ──────────────────────────────────────
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    depends_on:
      - api
      - admin
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    logging:
      driver: "json-file"
      options:
        max-size: "5m"
        max-file: "3"

volumes:
  caddy_data:
  caddy_config:
EOF

# 8. Install Systemd Auto-Reboot Service
echo -e "\n${BLUE}[7/8] Enabling Systemd auto-reboot resilience service...${NC}"
cat > /etc/systemd/system/skillbridge.service << 'EOF'
[Unit]
Description=SkillBridge Production Stack
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/skillbridge/infra
ExecStart=/usr/bin/docker compose -f docker-compose.yml up -d --remove-orphans
ExecStop=/usr/bin/docker compose -f docker-compose.yml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable skillbridge.service

# 9. Build and Launch Containers
echo -e "\n${BLUE}[8/8] Building and launching SkillBridge Docker services...${NC}"
cd "$APP_DIR/infra"
docker compose build --pull
docker compose up -d --remove-orphans

echo -e "\n${CYAN}Waiting 12 seconds for containers to initialize and obtain SSL certificates...${NC}"
sleep 12
docker compose ps

echo -e "\n${GREEN}==================================================================${NC}"
echo -e "${GREEN}      SkillBridge VPS Setup & Deployment Complete!                ${NC}"
echo -e "${GREEN}==================================================================${NC}"
echo -e "  API Endpoint   : ${CYAN}https://ruetskillbridge.duckdns.org/api/v1/health${NC}"
echo -e "  Admin Panel    : ${CYAN}https://ruetskillbridgeadmin.duckdns.org${NC}"
echo -e "  System Service : ${CYAN}systemctl status skillbridge.service${NC}"
echo -e "  Live Logs      : ${CYAN}cd /opt/skillbridge/infra && docker compose logs -f${NC}"
echo -e "${GREEN}==================================================================${NC}\n"
