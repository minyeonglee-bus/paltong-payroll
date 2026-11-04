"""Weekly auto-schedule: plan next Sun–Sat and print the SQL that saves it.

usage: python3 weekly.py db.json START_SUNDAY > save.sql

db.json is the single row returned by the query in README.md:
  {"plan": [{"day": "2026-11-08", "name": "Jonel", "shift": "8-18"}, ...],   # 7 days before START .. START+6
   "holidays": ["2026-11-16", ...]}
Anything already saved for the target week (day-off requests, owner edits) is kept as is;
only the empty days are planned.
overrides.json (same folder) holds owner one-off changes of daily demand.
"""
import json, sys, os, datetime as dt, subprocess, tempfile

here = os.path.dirname(os.path.abspath(__file__))
db = json.load(open(sys.argv[1]))
start = dt.date.fromisoformat(sys.argv[2])
end = start + dt.timedelta(days=6)
hist, fixed = {}, {}
for r in db["plan"]:
    d = dt.date.fromisoformat(r["day"])
    if d < start: hist.setdefault(r["name"], {})[r["day"]] = r["shift"]
    elif d <= end: fixed.setdefault(r["name"], {})[r["day"]] = r["shift"]
ov = json.load(open(os.path.join(here, "overrides.json"))) if os.path.exists(os.path.join(here, "overrides.json")) else {}
exempt = {}   # approved leave (휴가 신청) does not count toward the 2-offs-per-week cap
for r in db.get("leave") or []: exempt.setdefault(r["name"], {})[r["day"]] = True
inp = {"start": start.isoformat(), "days": 7, "holidays": db.get("holidays", []), "history": hist, "fixed": fixed, "overrides": ov, "exempt": exempt}
tmp = tempfile.mkdtemp()
json.dump(inp, open(f"{tmp}/in.json", "w"))
log = subprocess.run([sys.executable, os.path.join(here, "solve.py"), f"{tmp}/in.json", f"{tmp}/out.json"], capture_output=True, text=True)
sys.stderr.write(log.stdout + log.stderr)
res = json.load(open(f"{tmp}/out.json"))
vals = []
for team, r in res.items():
    if "plan" not in r: sys.exit(f"{team}: {r.get('status')} — not saved")
    for name, row in r["plan"].items():
        for day, sh in row.items():
            vals.append(f"('{day}'::date,'{name}','{sh}')")
print("with v(day, name, shift) as (values " + ",".join(vals) + ")\n"
      "insert into pr_plan (day, employee_id, shift)\n"
      "select v.day, e.id, v.shift from v join pr_employees e on e.name = v.name and e.resigned_on is null\n"
      "on conflict (day, employee_id) do update set shift = excluded.shift;")
