#!/usr/bin/env bash
# Applies every supabase/migrations/*.sql not applied yet, each in its own
# transaction, and records it in public.schema_migrations.
# Needs SUPABASE_DB_URL (Supabase → Connect → Session pooler).
set -euo pipefail

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "::warning::SUPABASE_DB_URL secret is not set yet — nothing applied."
  exit 0
fi

# A password containing @ : / ? # breaks the URL, and psql would then print part of
# the password in the (public) log. Refuse early with a safe message instead.
rest=${SUPABASE_DB_URL#*://}
if [ "${rest//[^@]/}" != "@" ]; then
  echo "::error::SUPABASE_DB_URL is not valid: the database password must contain only letters and numbers (no @ : / ? #). Reset it in Supabase and update the secret."
  exit 1
fi

psql_q() { psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -X -q "$@"; }

# On a failed connection, describe the URL's shape (never the password) to help fix the secret
if ! psql "$SUPABASE_DB_URL" -X -q -c "select 1" >/dev/null 2>/tmp/psql.err; then
  grep -o 'FATAL:.*' /tmp/psql.err | head -1 || true
  python3 - <<'PY'
import os, urllib.parse as u
p = u.urlsplit(os.environ["SUPABASE_DB_URL"].strip())
pw = p.password or ""
print("URL check (password not shown):")
print("  scheme:", p.scheme, "| user:", p.username, "| host:", p.hostname, "| port:", p.port, "| db:", p.path)
print("  password length:", len(pw), "| has [ ] :", any(c in pw for c in "[]"), "| has spaces:", " " in pw,
      "| non-English characters:", any(ord(c) > 127 for c in pw), "| says YOUR-PASSWORD:", "YOUR-PASSWORD" in pw.upper())
print("  leading/trailing spaces in secret:", os.environ["SUPABASE_DB_URL"] != os.environ["SUPABASE_DB_URL"].strip())
PY
  exit 1
fi

psql_q -c "create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now()); alter table public.schema_migrations enable row level security;"

for f in supabase/migrations/*.sql; do
  name=$(basename "$f")
  if [ "$(psql_q -tA -c "select 1 from public.schema_migrations where name = '$name'")" = "1" ]; then
    echo "✓ $name (already applied)"
    continue
  fi
  echo "→ applying $name"
  { cat "$f"; printf "\ninsert into public.schema_migrations (name) values ('%s');\n" "$name"; } |
    psql_q --single-transaction -f -
  echo "✓ $name applied"
done
