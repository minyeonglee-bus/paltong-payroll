"""Daily re-plan after approved leave (owner 2026-11-04): fill the gap a leave leaves in an already-planned week.

usage: python3 replan.py db.json > save.sql      (db.json = the "Re-plan query" in README.md)

For every approved leave day not yet re-planned (pr_sil_req.replanned_at is null, day after today, inside the planned
range) the rest of that Sun–Sat week (from tomorrow) is re-solved per team with solve.py in re-plan mode:
  * days up to today, approved leave days and Jonel (always 8-18) stay as they are
  * everyone else may move between day and night shifts; the current plan is kept where possible
  * approved leave does not count toward the 2-offs-per-week cap
  * confirmed weeks (locked.json "through" date, owner 2026-11-06) are never re-planned; leave approved there only
    sends the owner a "🔒 확정된 주" push
save.sql upserts only the changed pr_plan rows, marks the leave rows re-planned and sends the owner a push.
A team the solver cannot plan is not saved (its leave rows stay unmarked and are retried tomorrow).
"""
import json, sys, os, datetime as dt, subprocess, tempfile

here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, here)
from solve import TEAMS, is_work  # noqa: E402

db = json.load(open(sys.argv[1]))
today = dt.date.fromisoformat(db["today"])
todo = db.get("todo") or []
if not todo:
    print("-- nothing to re-plan"); sys.exit(0)

plan = {}
for r in db.get("plan") or []: plan.setdefault(r["name"], {})[r["day"]] = r["shift"]
leave = {}
for r in db.get("leave") or []: leave.setdefault(r["name"], {})[r["day"]] = "off" if r["kind"] == "off" else "sil"
# last fully planned day (a single SIL row far ahead does not count): at least 10 people have a row that day
cnt = {}
for row in plan.values():
    for d in row: cnt[d] = cnt.get(d, 0) + 1
full = [dt.date.fromisoformat(d) for d, n in cnt.items() if n >= 10]
last_planned = max(full) if full else today
team_of = {p: t for t, ppl in TEAMS.items() for p in ppl}

weeks = {}   # sunday -> set(team)
for r in todo:
    d = dt.date.fromisoformat(r["day"]); sun = d - dt.timedelta(days=(d.weekday() + 1) % 7)
    if r["name"] in team_of: weeks.setdefault(sun, set()).add(team_of[r["name"]])

# confirmed (확정) weeks are never re-planned (owner 2026-11-06): locked.json {"through": "YYYY-MM-DD"}
lockf = os.path.join(here, "locked.json")
locked = dt.date.fromisoformat(json.load(open(lockf))["through"]) if os.path.exists(lockf) else dt.date.min
if db.get("locked_through"): locked = max(locked, dt.date.fromisoformat(str(db["locked_through"])[:10]))   # pr_settings.sched_locked_through
locked_todo = [r for r in todo if dt.date.fromisoformat(r["day"]) <= locked]

changes, issues, failed, done_teams = [], [], [], set()
for sun in sorted(weeks):
    a = max(sun, today + dt.timedelta(days=1), locked + dt.timedelta(days=1)); b = min(sun + dt.timedelta(days=6), last_planned)
    if a > b: continue
    days = [a + dt.timedelta(days=k) for k in range((b - a).days + 1)]
    teams = {t: TEAMS[t] for t in sorted(weeks[sun])}
    ppl = [p for t in teams.values() for p in t]
    hist = {p: {(a - dt.timedelta(days=k)).isoformat(): plan.get(p, {}).get((a - dt.timedelta(days=k)).isoformat())
                for k in range(1, 8)} for p in ppl}
    fixed, exempt, current = {}, {}, {}
    for p in ppl:
        for d in days:
            k = d.isoformat(); cur = plan.get(p, {}).get(k); lv = leave.get(p, {}).get(k)
            if lv: fixed.setdefault(p, {})[k] = lv; exempt.setdefault(p, {})[k] = True
            elif p == "Jonel" and cur: fixed.setdefault(p, {})[k] = cur          # Jonel: 8-18 or his off, as planned
            elif cur == "sil": fixed.setdefault(p, {})[k] = "sil"
            if cur: current.setdefault(p, {})[k] = cur
    # offs already taken earlier this week (not approved leave) still count toward the 2-offs cap
    before = {p: sum(1 for k in range((a - sun).days) if plan.get(p, {}).get((sun + dt.timedelta(days=k)).isoformat()) == "off"
                     and not leave.get(p, {}).get((sun + dt.timedelta(days=k)).isoformat())) for p in ppl}
    inp = {"start": a.isoformat(), "days": len(days), "holidays": db.get("holidays") or [], "history": hist,
           "fixed": fixed, "exempt": exempt, "current": current, "replan": True, "teams": teams,
           "weights": {"change": 1}, "week_offs_before": before,
           "overrides": json.load(open(os.path.join(here, "overrides.json"))) if os.path.exists(os.path.join(here, "overrides.json")) else {}}
    tmp = tempfile.mkdtemp(); json.dump(inp, open(f"{tmp}/in.json", "w"))
    log = subprocess.run([sys.executable, os.path.join(here, "solve.py"), f"{tmp}/in.json", f"{tmp}/out.json"], capture_output=True, text=True)
    sys.stderr.write(log.stdout + log.stderr)
    res = json.load(open(f"{tmp}/out.json"))
    for t, r in res.items():
        if "plan" not in r: failed.append(f"{t} {sun:%m/%d}주"); continue
        done_teams.add((sun, t))
        issues += [x for x in r.get("issues", []) if "not covered" in x or "in a row" in x]
        for p, row in r["plan"].items():
            for k, sh in row.items():
                old = plan.get(p, {}).get(k)
                if sh != old and not (old in (None, "off") and sh == "off"):
                    changes.append((k, p, old, sh)); plan.setdefault(p, {})[k] = sh

ids = [r["id"] for r in todo if r["name"] in team_of and (dt.date.fromisoformat(r["day"]) - dt.timedelta(days=(dt.date.fromisoformat(r["day"]).weekday() + 1) % 7), team_of[r["name"]]) in done_teams]
ids += [r["id"] for r in todo if r["name"] not in team_of]
ids += [r["id"] for r in todo if dt.date.fromisoformat(r["day"]) > last_planned]   # week not planned yet: weekly.py keeps the leave
ids += [r["id"] for r in locked_todo]   # confirmed week: leave stays as approved, no automatic re-plan
ids = list(dict.fromkeys(ids))
q = lambda s: "'" + str(s).replace("'", "''") + "'"
out = []
if changes:
    vals = ",".join(f"({q(k)}::date,{q(p)},{q(sh)})" for k, p, _, sh in changes)
    out.append("with v(day, name, shift) as (values " + vals + ")\n"
               "insert into pr_plan (day, employee_id, shift)\n"
               "select v.day, e.id, v.shift from v join pr_employees e on e.name = v.name and e.resigned_on is null\n"
               "on conflict (day, employee_id) do update set shift = excluded.shift;")
if ids:
    out.append("update pr_sil_req set replanned_at = now() where id in (" + ",".join(q(i) + "::uuid" for i in ids) + ");")
md = lambda k: f"{int(k[5:7])}/{int(k[8:10])}"
lab = lambda s: "휴무" if s in (None, "off") else ("SIL" if s == "sil" else s)
TEAM_KO = {"kitchen": "주방", "hall": "홀", "riders": "라이더"}
per = {}
for k, p, o, n in sorted(changes, key=lambda c: (c[1], c[0])): per.setdefault(p, []).append(f"{md(k)} {lab(n)}")
lines = [f"{p} " + "·".join(v) for p, v in per.items()]
gaps = {}
for x in issues:   # "kitchen 22-8 not covered 11/13"
    if "not covered" in x:
        t, sh, *_ , d = x.split(); gaps.setdefault(f"{TEAM_KO.get(t, t)} {sh}", []).append(d)
gap_txt = [f"{k} 빈자리 {', '.join(v)}" for k, v in gaps.items()]
if locked_todo:   # tell the owner: leave approved inside a confirmed week, nothing moved automatically
    lk = {}
    for r in sorted(locked_todo, key=lambda r: (r["name"], r["day"])): lk.setdefault(r["name"], []).append(md(r["day"]))
    out.append("select public.pr_notify(" + q(("🔒 확정된 주에 휴가 승인 — 자동 수정 안 함, 빈자리 직접 확인\n" + " / ".join(f"{n} {'·'.join(v)}" for n, v in lk.items()))[:600]) + ");")
    lines.append("locked week leave: " + ", ".join(f"{r['name']} {r['day']}" for r in locked_todo))
if changes or failed or gaps:
    msg = "🔄 스케줄 자동 수정 (휴가 반영)"
    if gap_txt: msg += "\n⚠️ " + " / ".join(gap_txt)
    if failed: msg += "\n❌ 자동 수정 실패: " + ", ".join(failed) + " — 직접 확인"
    msg += "\n" + (" / ".join(lines) if lines else "바뀐 근무 없음")
    out.append("select public.pr_notify(" + q(msg[:600]) + ");")
lines = lines + gap_txt + failed
print("\n".join(out) if out else "-- nothing to save")
print("\n".join(["-- " + l for l in lines]), file=sys.stderr)
