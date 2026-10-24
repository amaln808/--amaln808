#!/usr/bin/env bash
# Restores a decrypted backup into a Supabase project that already has the
# migrations applied and its owner account created (e.g. the test project).
#   gpg -d zawrda-backup-DATE.tar.gz.gpg | tar xz
#   SUPABASE_DB_URL=... scripts/db-restore.sh zawrda-backup-DATE
# Files (photos, certificates) are uploaded again from <backup>/files with the dashboard or a script.
set -euo pipefail
dir=${1:?backup folder}
: "${SUPABASE_DB_URL:?}"

tables=$(psql "$SUPABASE_DB_URL" -X -tA -c "select string_agg(format('public.%I', tablename), ', ')
  from pg_tables where schemaname = 'public' and tablename not in ('members', 'schema_migrations')")

{
  echo "set session_replication_role = replica;" # no triggers or FK checks while loading
  echo "truncate $tables restart identity cascade;"
  cat "$dir/data.sql"
} | psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 --single-transaction -q -f -
echo "Restored."
