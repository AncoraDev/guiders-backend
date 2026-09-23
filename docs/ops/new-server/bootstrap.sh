#!/usr/bin/env bash
# Bootstrap del VPS Guiders (Ubuntu 22.04+ / 26.04). Ejecutar como root:
#   curl -fsSL … | bash
# o copia este archivo al server y:  bash bootstrap.sh
# Idempotente. No instala sitios nginx ni pide certificados (hace falta DNS).

set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Ejecuta como root (ssh root@187.33.147.104)"
  exit 1
fi

DEPLOY_USER="${DEPLOY_USER:-deploy}"
SWAP_MB="${SWAP_MB:-2048}"

echo "==> Paquetes base"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y --no-install-recommends \
  ca-certificates curl git ufw fail2ban \
  nginx certbot python3-certbot-nginx \
  sshpass

echo "==> Swap ${SWAP_MB}MB (si no existe)"
if ! swapon --show | grep -q .; then
  if [[ ! -f /swapfile ]]; then
    fallocate -l "${SWAP_MB}M" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count="${SWAP_MB}"
    chmod 600 /swapfile
    mkswap /swapfile
  fi
  swapon /swapfile || true
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Usuario ${DEPLOY_USER}"
if ! id "${DEPLOY_USER}" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "${DEPLOY_USER}"
fi
usermod -aG sudo "${DEPLOY_USER}"
# sudo sin password para el primer día (CI / bootstrap). Recorta luego.
echo "${DEPLOY_USER} ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/${DEPLOY_USER}"
chmod 440 "/etc/sudoers.d/${DEPLOY_USER}"
install -d -m 700 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "/home/${DEPLOY_USER}/.ssh"
AUTH_KEYS="/home/${DEPLOY_USER}/.ssh/authorized_keys"
touch "${AUTH_KEYS}"
chmod 600 "${AUTH_KEYS}"
chown "${DEPLOY_USER}:${DEPLOY_USER}" "${AUTH_KEYS}"
if [[ -f /root/.ssh/authorized_keys ]]; then
  cat /root/.ssh/authorized_keys >> "${AUTH_KEYS}"
  sort -u -o "${AUTH_KEYS}" "${AUTH_KEYS}"
  chown "${DEPLOY_USER}:${DEPLOY_USER}" "${AUTH_KEYS}"
fi

echo "==> Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
usermod -aG docker "${DEPLOY_USER}"

echo "==> Node 20 + PM2"
if ! command -v node >/dev/null 2>&1 || ! node -v | grep -qE '^v20\.'; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
npm install -g pm2
mkdir -p /var/log/pm2
chown "${DEPLOY_USER}:${DEPLOY_USER}" /var/log/pm2

echo "==> Directorios de deploy"
mkdir -p /var/www/guiders-backend /var/www/guiders-frontend/releases /var/www/guiders-frontend/current /var/www/certbot
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" /var/www/guiders-backend /var/www/guiders-frontend

echo "==> Firewall 22/80/443"
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> PM2 startup (systemd)"
env PATH="/usr/bin:${PATH}" pm2 startup systemd -u "${DEPLOY_USER}" --hp "/home/${DEPLOY_USER}" | tail -n 5 || true

echo
echo "Listo. Comprueba:"
echo "  ssh ${DEPLOY_USER}@187.33.147.104"
echo "  docker --version && node -v && pm2 -v && df -h && free -h"
echo
echo "Siguiente: dominio (__DOMAIN__), .env.production y docker compose (sin profile test)."
echo "No abras 5432/27017/6379/8080 en ufw."
