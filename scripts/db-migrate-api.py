"""Applies supabase/migrations through the Supabase Management API.

Used when SUPABASE_ACCESS_TOKEN is set (a personal access token from
supabase.com/dashboard/account/tokens), so no database password is needed.
Each migration runs in one transaction together with its schema_migrations row.
"""
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

config = json.loads(pathlib.Path("src/data/supabase.config.json").read_text())
ref = config["url"].split("//")[1].split(".")[0]
token = os.environ["SUPABASE_ACCESS_TOKEN"].strip()


def run(sql: str):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=json.dumps({"query": sql}).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", "User-Agent": "zawrda-migrate"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read() or b"[]")
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")[:2000]
        if e.code in (401, 403):
            print("::error::The Supabase access token was refused. Create a new one and update SUPABASE_ACCESS_TOKEN.")
        print(f"HTTP {e.code}: {body}")
        sys.exit(1)


run(
    "create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now());"
    " alter table public.schema_migrations enable row level security;"
)
done = {row["name"] for row in run("select name from public.schema_migrations")}

for f in sorted(pathlib.Path("supabase/migrations").glob("*.sql")):
    if f.name in done:
        print(f"✓ {f.name} (already applied)")
        continue
    print(f"→ applying {f.name}")
    run(f"begin;\n{f.read_text()}\ninsert into public.schema_migrations (name) values ('{f.name}');\ncommit;")
    print(f"✓ {f.name} applied")
