"""Loads a JSON backup (from backup-api.py) into a Supabase project through the
Management API. The target must already have all migrations and its owner account.
Replaces every table except members and schema_migrations, in one transaction.

  gpg -d zawrda-backup-DATE.tar.gz.gpg | tar xz
  SUPABASE_ACCESS_TOKEN=... python3 scripts/db-restore-api.py zawrda-backup-DATE <project-ref>
"""
import json
import os
import pathlib
import sys
import urllib.request

folder = pathlib.Path(sys.argv[1])
ref = sys.argv[2]
token = os.environ["SUPABASE_ACCESS_TOKEN"].strip()
skip = {"members", "schema_migrations"}

tables = sorted(p.stem for p in (folder / "tables").glob("*.json") if p.stem not in skip)
parts = ["begin;", "set local session_replication_role = replica;"]
parts.append("truncate " + ", ".join(f'public."{t}"' for t in tables) + " restart identity cascade;")
for t in tables:
    rows = (folder / "tables" / f"{t}.json").read_text()
    if rows.strip() == "[]":
        continue
    literal = "$zawrda$" + rows + "$zawrda$"
    parts.append(f'insert into public."{t}" overriding system value select * from json_populate_recordset(null::public."{t}", {literal}::json);')
parts.append("commit;")

req = urllib.request.Request(
    f"https://api.supabase.com/v1/projects/{ref}/database/query",
    data=json.dumps({"query": "\n".join(parts)}).encode(),
    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", "User-Agent": "zawrda-restore"},
    method="POST",
)
with urllib.request.urlopen(req, timeout=600) as r:
    r.read()
print(f"Restored {len(tables)} tables.")
