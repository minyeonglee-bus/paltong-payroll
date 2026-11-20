# Weekly schedule (auto, every Wednesday)

Plans next Sunday–Saturday for kitchen (5), hall (3) and riders (4) and saves it to `pr_plan`
(hall rows sync to the Cash Book `shifts` table by trigger). Rules are in the docstring of `solve.py`.

1. `pip install --break-system-packages ortools`
2. Read the database (Supabase project `nffexcfunbnxoyrfhvnu`), with START = next Sunday:

```sql
select json_build_object(
  'plan', (select json_agg(json_build_object('day', q.day, 'name', e.name, 'shift', q.shift))
           from pr_plan q join pr_employees e on e.id = q.employee_id
           where e.resigned_on is null and q.shift is not null
             and q.day between date 'START' - 14 and date 'START' + 6),
  'leave', (select json_agg(json_build_object('day', r.day, 'name', e.name, 'kind', r.kind))
            from pr_sil_req r join pr_employees e on e.id = r.employee_id
            where r.status = 'approved' and r.day between date 'START' - 7 and date 'START' + 6),
  'holidays', (select json_agg(day) from pr_holidays),
  'calls', (select json_agg(day) from pr_hall_calls where status = 'yes' and day between date 'START' and date 'START' + 6),
  'locked_through', (select sched_locked_through from pr_settings where id = 1));
```

3. Save that JSON as `db.json`, run `python3 weekly.py db.json START > save.sql`, check the printed table and issues.
4. Run `save.sql` against the database.

Anything already saved for the target week is kept (day-off requests `off` / `sil`, owner edits); only empty days are planned.
One-off demand changes go in `overrides.json`. `"fewer": {"Lilian": "2026-11-22"}` = that person works as few days as possible from that date (owner 2026-11-17; remove the line to undo). Store-closed days go in its `"closed"` list (2026-12-31 day and 2027-01-01, owner 2026-11-10):
no regular shifts are planned there, only saved rows (the New Year event shifts staff pick in the app, `pr_event_resp`) are kept.

# Re-plan after approved leave (auto, every day 09:40)

**Confirmed weeks are locked** (owner 2026-11-06): `pr_settings.sched_locked_through` (database, the source of truth;
`locked.json` is only a fallback — the later of the two wins). Days up to that date are never re-planned; a leave approved there
only sends the owner a "🔒 확정된 주" push, and staff cannot request leave for those days in the app ("관리자에게 문의하세요").
When the owner confirms a week: `update pr_settings set sched_locked_through = '<Saturday>' where id = 1;`

Approved leave (휴가 신청 — Day off / SIL / monthly paid vacation, auto-approved or approved by the owner) goes into
`pr_plan` right away. The daily scheduled task then re-plans the rest of that Sun–Sat week so the gap is covered:
days up to today, approved leave and Jonel (always 8-18) stay; everyone else may switch between day and night shifts;
the current plan is kept where possible. Details in `replan.py` and the "Re-plan mode" note in `solve.py`.

Re-plan query (save the single value as `db.json`, then `python3 replan.py db.json > save.sql` and run `save.sql`):

```sql
with t as (select (now() at time zone 'Asia/Manila')::date d, (select max(day) from pr_plan) last)
select json_build_object(
  'today', (select d from t),
  'todo', (select json_agg(json_build_object('id', r.id, 'name', e.name, 'day', r.day, 'kind', r.kind))
           from pr_sil_req r join pr_employees e on e.id = r.employee_id
           where r.status = 'approved' and r.replanned_at is null and r.day > (select d from t)),
  'plan', (select json_agg(json_build_object('day', q.day, 'name', e.name, 'shift', q.shift))
           from pr_plan q join pr_employees e on e.id = q.employee_id
           where e.resigned_on is null and q.shift is not null and q.day between (select d from t) - 14 and (select last from t)),
  'leave', (select json_agg(json_build_object('day', r.day, 'name', e.name, 'kind', r.kind))
            from pr_sil_req r join pr_employees e on e.id = r.employee_id
            where r.status = 'approved' and r.day between (select d from t) - 14 and (select last from t)),
  'holidays', (select json_agg(day) from pr_holidays),
  'calls', (select json_agg(day) from pr_hall_calls where status = 'yes' and day > (select d from t)),
  'locked_through', (select sched_locked_through from pr_settings where id = 1));
```

`save.sql` only touches days after today: changed `pr_plan` rows, `pr_sil_req.replanned_at`, and one owner push (`pr_notify`).

# Leave that would leave a shift empty is rejected automatically (owner 2026-11-20)

`pr_emp_leave_request` calls `pr_leave_gap` (supabase/pr_leave_gap.sql) before auto-approval, for all kinds (off / sil / mpv).
It uses the same demand as `solve.py` (`pr_team_need`) and the same teams (`pr_team_of` — keep both in step with `TEAMS`,
`demand()` and the `"closed"` list here). Rejected when the team has fewer free people than shifts on a day, or the request makes
the Sun–Sat week's available work days fall short, or Jonel and Archie would both be off. Saved as `rejected` with the reason; owner push.

**Fri/Sat exception and Mina (owner 2026-11-20 10:04, supabase/pr_hall_call.sql):** a Fri/Sat gap is allowed when every Fri/Sat day is
10+ days ahead; closer → a reason is required and the owner approves. When an approved Fri/Sat hall leave leaves the hall short,
Mina gets a call request (`pr_hall_calls`, push to her device). Her "yes" days come in the queries above as `calls`: weekly.py / replan.py
add "Mina" to the hall team on those days only (off on the others, `fewer` so she works only when the hall really needs her, no off rows saved).
