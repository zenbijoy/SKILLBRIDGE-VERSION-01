#!/usr/bin/env bash
# ==============================================================================
# SkillBridge — Complete Automated VPS Provisioning Script
# Target OS: Ubuntu 22.04 LTS / 24.04 LTS or Debian 12
# ==============================================================================
set -euo pipefail

# Text colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}=====================================================${NC}"
echo -e "${GREEN}   SkillBridge VPS Initial Setup & Hardening${NC}"
echo -e "${BLUE}=====================================================${NC}"

# 1. Require Root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[ERROR] This script must be run as root.${NC}"
  echo "Please run: sudo bash $0"
  exit 1
fi

DEPLOY_USER="${DEPLOY_USER:-deploy}"
SWAP_SIZE_GB="${SWAP_SIZE_GB:-2}"
INSTALL_DIR="${INSTALL_DIR:-/opt/skillbridge}"

echo -e "\n${YELLOW}>>> Configuration:${NC}"
echo " - Non-root user : $DEPLOY_USER"
echo " - Swap size     : ${SWAP_SIZE_GB} GB"
echo " - App directory : $INSTALL_DIR"
echo ""

# 2. Update System Packages
echo -e "${BLUE}[1/8] Updating package index and system packages...${NC}"
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
  unzip \
  wget \
  tar \
  software-properties-common

# 3. Configure Swap Memory (Critical for 1GB-2GB VPS to prevent build OOM)
echo -e "\n${BLUE}[2/8] Checking swap space...${NC}"
if [ $(swapon --show | wc -l) -le 1 ]; then
  echo -e "${YELLOW}Creating ${SWAP_SIZE_GB}GB swapfile...${NC}"
  fallocate -l "${SWAP_SIZE_GB}G" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=$((SWAP_SIZE_GB * 1024))
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  if ! grep -q '/swapfile' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
  echo -e "${GREEN}Swap created successfully.${NC}"
else
  echo -e "${GREEN}Swap already active.${NC}"
fi

# Kernel Tuning for Node & Redis
cat > /etc/sysctl.d/99-skillbridge.conf << 'EOF'
vm.swappiness=10
vm.vfs_cache_pressure=50
vm.overcommit_memory=1
net.core.somaxconn=1024
EOF
sysctl -p /etc/sysctl.d/99-skillbridge.conf > /dev/null 2>&1 || true

# 4. Install Docker CE and Docker Compose Plugin
echo -e "\n${BLUE}[3/8] Installing Docker Engine & Docker Compose...${NC}"
if ! command -v docker &> /dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/$(. /etc/os-release && echo "$ID")/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes
  chmod a+r /etc/apt/keyrings/docker.gpg

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$(. /etc/os-release && echo "$ID") \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  echo -e "${GREEN}Docker installed successfully.${NC}"
else
  echo -e "${GREEN}Docker is already installed.$(docker --version)${NC}"
fi

# Docker Daemon Log Rotation (Prevents disk exhaustion from docker logs)
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

# 5. Create Deployment User
echo -e "\n${BLUE}[4/8] Creating deployment user ($DEPLOY_USER)...${NC}"
if ! id -u "$DEPLOY_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
  usermod -aG sudo "$DEPLOY_USER"
  usermod -aG docker "$DEPLOY_USER"

  # Copy root SSH keys to deploy user if present
  if [ -d /root/.ssh ] && [ -f /root/.ssh/authorized_keys ]; then
    mkdir -p "/home/$DEPLOY_USER/.ssh"
    cp /root/.ssh/authorized_keys "/home/$DEPLOY_USER/.ssh/authorized_keys"
    chown -R "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
    chmod 700 "/home/$DEPLOY_USER/.ssh"
    chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"
  fi
  echo -e "${GREEN}User '$DEPLOY_USER' created and added to docker & sudo groups.${NC}"
else
  usermod -aG docker "$DEPLOY_USER" || true
  echo -e "${GREEN}User '$DEPLOY_USER' already exists.${NC}"
fi

# 6. Configure UFW Firewall
echo -e "\n${BLUE}[5/8] Configuring UFW Firewall...${NC}"
ufw --force reset > /dev/null 2>&1
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP Caddy/Web'
ufw allow 443/tcp comment 'HTTPS Caddy/Web'
ufw --force enable
echo -e "${GREEN}Firewall active. Only ports 22, 80, 443 open.${NC}"

# 7. Configure Fail2ban (SSH Brute Force Protection)
echo -e "\n${BLUE}[6/8] Configuring Fail2ban...${NC}"
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
echo -e "${GREEN}Fail2ban configured and running.${NC}"

# 8. Setup Application Directory
echo -e "\n${BLUE}[7/8] Preparing Application Directory ($INSTALL_DIR)...${NC}"
mkdir -p "$INSTALL_DIR"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$INSTALL_DIR"
chmod 775 "$INSTALL_DIR"

# 9. Create Systemd Service for Auto-Reboot Resilience
echo -e "\n${BLUE}[8/8] Creating Systemd Service for Auto-Boot...${NC}"
cat > /etc/systemd/system/skillbridge.service << EOF
[Unit]
Description=SkillBridge Production Stack
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$INSTALL_DIR/infra
User=$DEPLOY_USER
Group=docker
ExecStart=/usr/bin/docker compose -f docker-compose.yml up -d --remove-orphans
ExecStop=/usr/bin/docker compose -f docker-compose.yml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable skillbridge.service
echo -e "${GREEN}Systemd auto-restart service registered: skillbridge.service${NC}"

# 10. Summary
echo -e "\n${GREEN}=====================================================${NC}"
echo -e "${GREEN}   VPS Setup Complete! System is Hardened & Ready!    ${NC}"
echo -e "${GREEN}=====================================================${NC}"
echo -e "Next steps for your deployment:"
echo -e " 1. Clone repository into ${YELLOW}$INSTALL_DIR${NC}:"
echo -e "    git clone https://github.com/YOUR_ORG/skillbridge-final.git $INSTALL_DIR"
echo -e "    chown -R $DEPLOY_USER:$DEPLOY_USER $INSTALL_DIR"
echo -e " 2. Configure environment variables in:"
echo -e "    ${YELLOW}$INSTALL_DIR/backend/.env${NC}"
echo -e "    ${YELLOW}$INSTALL_DIR/infra/caddy/Caddyfile${NC}"
echo -e " 3. Launch stack:"
echo -e "    cd $INSTALL_DIR && bash DEPLOY_VPS.sh"
echo -e "=====================================================\n"
