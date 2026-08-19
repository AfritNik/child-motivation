#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root" >&2
  exit 1
fi

: "${PIN_SASHA:?PIN_SASHA is required}"
: "${PIN_PAPA:?PIN_PAPA is required}"
: "${PIN_GRANDPA:?PIN_GRANDPA is required}"

for pin in "$PIN_SASHA" "$PIN_PAPA" "$PIN_GRANDPA"; do
  if [[ ! "$pin" =~ ^[0-9]{4}$ ]]; then
    echo "Every PIN must contain exactly four digits" >&2
    exit 1
  fi
done

umask 077
postgres_password="$(openssl rand -hex 24)"
auth_secret="$(openssl rand -hex 48)"
throttle_secret="$(openssl rand -hex 48)"

install -d -m 0755 /opt/child-motivation
{
  printf 'POSTGRES_PASSWORD=%s\n' "$postgres_password"
  printf 'AUTH_SECRET=%s\n' "$auth_secret"
  printf 'LOGIN_THROTTLE_SECRET=%s\n' "$throttle_secret"
  printf 'PIN_SASHA=%s\n' "$PIN_SASHA"
  printf 'PIN_PAPA=%s\n' "$PIN_PAPA"
  printf 'PIN_GRANDPA=%s\n' "$PIN_GRANDPA"
  printf 'BACKUP_BUCKET=%s\n' 'afritnik-child-motivation-backups'
} > /opt/child-motivation/.env.production

chmod 600 /opt/child-motivation/.env.production
