#!/usr/bin/env bash
# Full backup: database (schema + data) and every stored file, packed and
# encrypted with BACKUP_PASSPHRASE. Output: zawrda-backup-YYYY-MM-DD.tar.gz.gpg
# Needs SUPABASE_DB_URL, SUPABASE_SECRET_KEY, BACKUP_PASSPHRASE and the URL in src/data/supabase.config.json.
set -euo pipefail

source "$(dirname "$0")/db-url.sh"

for v in SUPABASE_DB_URL SUPABASE_SECRET_KEY BACKUP_PASSPHRASE; do
  if [ -z "${!v:-}" ]; then echo "::error::$v secret is missing"; exit 1; fi
done

# Same safety check as db-migrate.sh: never let psql/pg_dump echo a broken URL
rest=${SUPABASE_DB_URL#*://}
if [ "${rest//[^@]/}" != "@" ]; then
  echo "::error::SUPABASE_DB_URL is not valid: the database password must contain only letters and numbers."
  exit 1
fi

day=$(date -u +%F)
work=$(mktemp -d)
mkdir -p "$work/zawrda-backup-$day"
out="$work/zawrda-backup-$day"

# Whole public schema for inspection, and a data-only file used by scripts/db-restore.sh
pg_dump "$SUPABASE_DB_URL" --schema=public --no-owner --no-privileges -f "$out/schema-and-data.sql"
pg_dump "$SUPABASE_DB_URL" --schema=public --data-only --no-owner --no-privileges \
  --exclude-table=public.members --exclude-table=public.schema_migrations -f "$out/data.sql"

node scripts/backup-storage.mjs "$out/files"

tar -C "$work" -czf "$work/backup.tar.gz" "zawrda-backup-$day"
gpg --batch --yes --pinentry-mode loopback --passphrase-fd 0 --symmetric --cipher-algo AES256 \
  -o "zawrda-backup-$day.tar.gz.gpg" "$work/backup.tar.gz" <<<"$BACKUP_PASSPHRASE"
rm -rf "$work"
ls -lh "zawrda-backup-$day.tar.gz.gpg"
