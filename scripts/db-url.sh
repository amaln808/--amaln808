# Sourced by db-migrate.sh and backup.sh.
# Builds SUPABASE_DB_URL from the SUPABASE_DB_PASSWORD secret (only the password is
# secret; user and host are in src/data/supabase.config.json). Any character works:
# the password is URL-encoded here.
if [ -z "${SUPABASE_DB_URL:-}" ] && [ -n "${SUPABASE_DB_PASSWORD:-}" ]; then
  SUPABASE_DB_URL=$(python3 - <<'PY'
import json, os, urllib.parse as u
c = json.load(open("src/data/supabase.config.json"))
pw = u.quote(os.environ["SUPABASE_DB_PASSWORD"].strip(), safe="")
print(f"postgresql://{c['dbUser']}:{pw}@{c['dbHost']}:5432/postgres")
PY
)
  export SUPABASE_DB_URL
fi
