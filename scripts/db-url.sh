# Sourced by db-migrate.sh and backup.sh.
# Builds SUPABASE_DB_URL from the SUPABASE_DB_PASSWORD secret (only the password is
# secret; user and host are in src/data/supabase.config.json). Any character works:
# the password is URL-encoded here. Supabase runs two pooler clusters (aws-0 / aws-1);
# the first host that accepts the login is used, and each refusal is reported.
if [ -z "${SUPABASE_DB_URL:-}" ] && [ -n "${SUPABASE_DB_PASSWORD:-}" ]; then
  for host in $(python3 -c 'import json;h=json.load(open("src/data/supabase.config.json"))["dbHost"];print(h, h.replace("aws-0-","aws-1-") if "aws-0-" in h else h.replace("aws-1-","aws-0-"))'); do
    candidate=$(DB_HOST=$host python3 - <<'PY'
import json, os, urllib.parse as u
c = json.load(open("src/data/supabase.config.json"))
pw = u.quote(os.environ["SUPABASE_DB_PASSWORD"].strip(), safe="")
print(f"postgresql://{c['dbUser']}:{pw}@{os.environ['DB_HOST']}:5432/postgres")
PY
)
    if err=$(psql "$candidate" -X -q -c "select 1" 2>&1 >/dev/null); then
      echo "Connected through $host"
      SUPABASE_DB_URL=$candidate
      break
    fi
    echo "$host: $(echo "$err" | grep -o 'FATAL:.*' | head -1)"
    SUPABASE_DB_URL=$candidate
  done
  export SUPABASE_DB_URL
fi
