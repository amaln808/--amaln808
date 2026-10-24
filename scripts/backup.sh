#!/usr/bin/env bash
# Full backup: database (schema + data) and every stored file, packed and
# encrypted with BACKUP_PASSPHRASE. Output: zawrda-backup-YYYY-MM-DD.tar.gz.gpg
# Needs SUPABASE_DB_URL, SUPABASE_SECRET_KEY, BACKUP_PASSPHRASE and the URL in src/data/supabase.config.json.
set -euo pipefail

for v in SUPABASE_SECRET_KEY BACKUP_PASSPHRASE; do
  if [ -z "${!v:-}" ]; then echo "::error::$v secret is missing"; exit 1; fi
done

day=$(date -u +%F)
work=$(mktemp -d)
mkdir -p "$work/zawrda-backup-$day"
out="$work/zawrda-backup-$day"

if [ -n "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  # Preferred: JSON export through the Management API (no database password)
  python3 scripts/backup-api.py "$out"
else
  source "$(dirname "$0")/db-url.sh"
  if [ -z "${SUPABASE_DB_URL:-}" ]; then echo "::error::No SUPABASE_ACCESS_TOKEN or database password"; exit 1; fi
  # Whole public schema for inspection, and a data-only file used by scripts/db-restore.sh
  pg_dump "$SUPABASE_DB_URL" --schema=public --no-owner --no-privileges -f "$out/schema-and-data.sql"
  pg_dump "$SUPABASE_DB_URL" --schema=public --data-only --no-owner --no-privileges \
    --exclude-table=public.members --exclude-table=public.schema_migrations -f "$out/data.sql"
fi

node scripts/backup-storage.mjs "$out/files"

tar -C "$work" -czf "$work/backup.tar.gz" "zawrda-backup-$day"
gpg --batch --yes --pinentry-mode loopback --passphrase-fd 0 --symmetric --cipher-algo AES256 \
  -o "zawrda-backup-$day.tar.gz.gpg" "$work/backup.tar.gz" <<<"$BACKUP_PASSPHRASE"
rm -rf "$work"
ls -lh "zawrda-backup-$day.tar.gz.gpg"
