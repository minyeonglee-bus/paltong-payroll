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
             and q.day between date 'START' - 7 and date 'START' + 6),
  'holidays', (select json_agg(day) from pr_holidays));
```

3. Save that JSON as `db.json`, run `python3 weekly.py db.json START > save.sql`, check the printed table and issues.
4. Run `save.sql` against the database.

Day-off requests: enter `off` / `sil` for the day in the Payroll app before Wednesday; they are kept.
One-off demand changes go in `overrides.json`.
