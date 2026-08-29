#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y docker.io docker-compose-v2 nginx snapd

systemctl enable --now docker
systemctl enable --now nginx
usermod -aG docker yc-user

if ! swapon --show=NAME --noheadings | grep -q '^/swapfile$'; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
fi

if ! grep -q '^/swapfile ' /etc/fstab; then
  printf '%s\n' '/swapfile none swap sw 0 0' >> /etc/fstab
fi

install -d -m 0755 /opt/child-motivation
install -d -m 0755 /var/www/certbot

if ! snap list core >/dev/null 2>&1; then
  snap install core
fi
snap refresh core

if snap list certbot >/dev/null 2>&1; then
  snap refresh certbot
else
  snap install certbot --classic
fi

ln -sf /snap/bin/certbot /usr/local/bin/certbot
