#!/usr/bin/env bash
set -euo pipefail

: "${BACKUP_BUCKET:?BACKUP_BUCKET is required}"
: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT is required}"

backup_name="family-$(date -u +%Y-%m-%dT%H-%M-%SZ).sql.gz.age"
temporary_file="$(mktemp)"
trap 'rm -f "$temporary_file"' EXIT

docker compose --env-file .env.production -f compose.production.yaml exec -T db \
  pg_dump --clean --if-exists --no-owner -U family family \
  | gzip \
  | age --recipient "$BACKUP_AGE_RECIPIENT" --output "$temporary_file"

aws --endpoint-url=https://storage.yandexcloud.net \
  s3 cp "$temporary_file" "s3://${BACKUP_BUCKET}/${backup_name}"
