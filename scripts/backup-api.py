"""Exports every public table as JSON through the Supabase Management API.

Used by backup.sh when SUPABASE_ACCESS_TOKEN is set (no database password needed).
Writes <out>/tables/<table>.json and <out>/manifest.json; scripts/db-restore-api.py
loads them back.
"""
import json
import os
import pathlib
import sys
import urllib.request

out = pathlib.Path(sys.argv[1])
config = json.loads(pathlib.Path("src/data/supabase.config.json").read_text())
ref = config["url"].split("//")[1].split(".")[0]
token = os.environ["SUPABASE_ACCESS_TOKEN"].strip()


def run(sql: str):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=json.dumps({"query": sql}).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", "User-Agent": "zawrda-backup"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read() or b"[]")


tables = [r["tablename"] for r in run("select tablename from pg_tables where schemaname = 'public' order by tablename")]
(out / "tables").mkdir(parents=True, exist_ok=True)
counts = {}
for t in tables:
    rows = run(f'select coalesce(json_agg(t), \'[]\'::json) as rows from public."{t}" t')[0]["rows"]
    (out / "tables" / f"{t}.json").write_text(json.dumps(rows, ensure_ascii=False))
    counts[t] = len(rows)
(out / "manifest.json").write_text(json.dumps({"format": "zawrda-json-1", "project": ref, "counts": counts}, ensure_ascii=False, indent=2))
print(f"{len(tables)} tables, {sum(counts.values())} rows")
