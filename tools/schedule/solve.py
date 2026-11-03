"""Paltong weekly schedule solver (OR-Tools CP-SAT).

usage: python3 solve.py input.json [output.json]

input.json
{
  "start": "2026-11-08", "days": 14,
  "holidays": ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-30"],
  "history": {"Jonel": {"2026-11-01": "8-18", ...}, ...},   # at least the 7 days before start
  "fixed":   {"Jonel": {"2026-11-08": "sil"}, "June": {"2026-11-08": "off"}},
  "overrides": {"kitchen": {"2026-11-15": ["8-18","10-20","18-4","22-8"]}}   # optional demand per day
}

Rules (owner, 2026-11-03):
  * every shift of the day covered exactly once, no duplicates
  * max 6 working days in a row (history counted), rest >= 10h before the next shift
  * days off are single days: no back-to-back offs, and >= 2 working days between offs
  * keep the same shift through a run; change only on the first day after an off
  * kitchen: weekday 8-18 / 18-4 / 22-8; Fri, Sat and holiday eves add 10-20 and 20-6.
             Jonel always 8-18; Archie prefers 10-20 on big days.
  * hall:    Fri, Sat and holiday eves 3 on duty 8-20 / 20-4 / 22-8, otherwise 2 on duty 8-20 / 20-8.
             Genifer prefers 8-20.
  * riders:  weekday 8-18 / 18-4 / 22-8; Fri, Sat add 20-6.
Hard rules that cannot all be met are relaxed with large penalties and reported in "issues".
"""
import json, sys, datetime as dt
from ortools.sat.python import cp_model

TEAMS = {
    "kitchen": ["Jonel", "Archie", "Albert", "Jonathan", "Lorence"],
    "hall": ["Genifer", "Lilian", "Arlyn"],
    "riders": ["Felipe", "Jhon Vik", "June", "Wilbert"],
}


def hm(s):
    a = s.split(":"); return int(a[0]) * 60 + (int(a[1]) if len(a) > 1 else 0)


def span(sh):
    a, b = sh.split("-"); s, e = hm(a), hm(b)
    if e <= s: e += 1440
    return s, e


def is_work(sh): return bool(sh) and sh not in ("off", "sil")


def demand(team, day, hol, overrides):
    k = day.isoformat()
    if k in overrides.get(team, {}): return list(overrides[team][k]), None
    big = day.weekday() in (4, 5)                       # Fri, Sat
    eve = (day + dt.timedelta(days=1)).isoformat() in hol
    if team == "kitchen":
        return (["8-18", "10-20", "18-4", "20-6", "22-8"] if big or eve else ["8-18", "18-4", "22-8"]), None
    if team == "riders":
        return (["8-18", "18-4", "20-6", "22-8"] if big else ["8-18", "18-4", "22-8"]), None
    # hall: (3-person, 2-person) options, 3 wanted on big days / eves
    return None, (big or eve)


def solve_team(team, people, days, hol, hist, fixed, overrides):
    m = cp_model.CpModel(); pen = []; tags = []
    D = range(len(days))
    hall = team == "hall"
    H3, H2 = ["8-20", "20-4", "22-8"], ["8-20", "20-8"]
    need, want3 = {}, {}
    for i, d in enumerate(days):
        need[i], want3[i] = demand(team, d, hol, overrides)
    shifts = sorted({s for i in D for s in (H3 + H2 if hall else need[i])}, key=span)
    X = {(p, i, s): m.NewBoolVar("") for p in people for i in D for s in shifts}
    W = {(p, i): m.NewBoolVar("") for p in people for i in D}
    Y = {i: m.NewBoolVar("") for i in D} if hall else {}

    def soft(lit, w, tag):
        pen.append(w * lit); tags.append((lit, tag))

    for p in people:
        for i in D:
            m.Add(sum(X[p, i, s] for s in shifts) == W[p, i])
            f = fixed.get(p, {}).get(days[i].isoformat())
            if f is not None:
                if is_work(f): m.Add(X[p, i, f] == 1)
                else: m.Add(W[p, i] == 0)
    for i in D:
        for s in shifts:
            tot = sum(X[p, i, s] for p in people)
            if hall:
                if s == "8-20": m.Add(tot == 1)
                elif s in ("20-4", "22-8"): m.Add(tot == Y[i])
                elif s == "20-8": m.Add(tot == 1 - Y[i])
            else:
                m.Add(tot == (1 if s in need[i] else 0))
        if hall and want3[i]: soft(Y[i].Not(), 300, f"hall 2 on duty {days[i]:%m/%d} (3 wanted)")
        if hall and not want3[i]: m.Add(Y[i] == 0)

    for p in people:
        h = hist.get(p, {})
        prev = [h.get((days[0] - dt.timedelta(days=k)).isoformat()) for k in range(7, 0, -1)]  # 7 days before
        pw = [1 if is_work(x) else 0 for x in prev]
        seq = pw + [W[p, i] for i in D]
        n0 = len(pw)
        # max 6 in a row
        for a in range(len(seq) - 6):
            win = seq[a:a + 7]
            if all(isinstance(v, int) for v in win): continue
            m.Add(sum(win) <= 6)
        # back-to-back offs (fixed SIL/off pairs exempt)
        for a in range(n0 - 1, len(seq) - 1):
            x, y = seq[a], seq[a + 1]
            if (isinstance(x, int) and x == 1) or (isinstance(y, int) and y == 1): continue
            def given(j):  # history day or a fixed day off/SIL
                return j < n0 or fixed.get(p, {}).get(days[j - n0].isoformat()) is not None
            if given(a) and given(a + 1): continue
            b = m.NewBoolVar("")
            m.AddBoolOr([v for v in (x, y) if not isinstance(v, int)] + [b])
            soft(b, 200, f"{p} 2 days off in a row from {(days[0] + dt.timedelta(days=a - n0)):%m/%d}")
        # 1-day work runs (off, work, off)
        for a in range(n0 - 1, len(seq) - 2):
            x, y, z = seq[a], seq[a + 1], seq[a + 2]
            if isinstance(y, int) and y == 0: continue
            if (isinstance(x, int) and x == 1) or (isinstance(z, int) and z == 1): continue
            b = m.NewBoolVar("")
            lits = [v for v in (x, z) if not isinstance(v, int)]
            m.AddBoolOr(lits + ([y.Not()] if not isinstance(y, int) else []) + [b])
            soft(b, 150, f"{p} works 1 day only on {(days[0] + dt.timedelta(days=a + 1 - n0)):%m/%d}")
        # rest >= 10h, shift change only after a day off
        last = prev[-1]
        for s in shifts:
            if is_work(last):
                if span(s)[0] + 1440 - span(last)[1] < 600: m.Add(X[p, 0, s] == 0)
                if s != last: soft(X[p, 0, s], 20, f"{p} shift change {days[0]:%m/%d}")
        for i in list(D)[:-1]:
            for a in shifts:
                for b in shifts:
                    if span(b)[0] + 1440 - span(a)[1] < 600:
                        m.AddBoolOr([X[p, i, a].Not(), X[p, i + 1, b].Not()])
                    elif a != b:
                        c = m.NewBoolVar(""); m.AddBoolOr([X[p, i, a].Not(), X[p, i + 1, b].Not(), c])
                        soft(c, 20, f"{p} shift change {days[i + 1]:%m/%d}")
        # fairness: 4..6 working days per 7-day block
        for a in range(0, len(days), 7):
            blk = [W[p, i] for i in range(a, min(a + 7, len(days)))]
            if len(blk) == 7: m.Add(sum(blk) >= 4)
    # preferences
    for i, d in enumerate(days):
        if "Jonel" in people:
            m.Add(X["Jonel", i, "8-18"] == W["Jonel", i])
        if "Archie" in people and "10-20" in shifts and need[i] and "10-20" in need[i]:
            soft(X["Archie", i, "10-20"].Not(), 3, "")
        if "Genifer" in people:
            soft(W["Genifer", i] - X["Genifer", i, "8-20"], 30, f"Genifer not on 8-20 {d:%m/%d}")
    m.Minimize(sum(pen))
    sv = cp_model.CpSolver(); sv.parameters.max_time_in_seconds = 120; sv.parameters.num_workers = 8
    st = sv.Solve(m)
    if st not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {"status": sv.StatusName(st)}
    out = {}
    for p in people:
        row = {}
        for i, d in enumerate(days):
            v = [s for s in shifts if sv.Value(X[p, i, s])]
            f = fixed.get(p, {}).get(d.isoformat())
            row[d.isoformat()] = v[0] if v else (f if f in ("off", "sil") else "off")
        out[p] = row
    issues = sorted({t for lit, t in tags if t and sv.Value(lit)})
    return {"status": sv.StatusName(st), "penalty": sv.ObjectiveValue(), "plan": out, "issues": issues}


def main():
    inp = json.load(open(sys.argv[1]))
    start = dt.date.fromisoformat(inp["start"]); n = inp.get("days", 7)
    days = [start + dt.timedelta(days=k) for k in range(n)]
    hol = set(inp.get("holidays", []))
    res = {t: solve_team(t, ppl, days, hol, inp.get("history", {}), inp.get("fixed", {}), inp.get("overrides", {}))
           for t, ppl in inp.get("teams", TEAMS).items()}
    s = json.dumps(res, indent=1, ensure_ascii=False)
    if len(sys.argv) > 2: open(sys.argv[2], "w").write(s)
    for t, r in res.items():
        print(f"== {t} {r.get('status')} {r.get('penalty', '')}")
        if "plan" not in r: continue
        print(" " * 10 + " ".join(f"{d:%d%a}"[:5].ljust(6) for d in days))
        for p, row in r["plan"].items():
            print(f"{p:<10}" + " ".join(row[d.isoformat()].ljust(6) for d in days))
        for x in r["issues"]: print("  !", x)


if __name__ == "__main__":
    main()
