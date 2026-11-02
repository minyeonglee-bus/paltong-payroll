-- Cash Book ⇄ Payroll schedule sync (2026-11-02)
-- One schedule for everyone. Edit it in either app, the other sees the same thing.
--
--  • pr_plan (day, employee_id, shift) = the roster for every employee (waiter · kitchen · rider).
--  • shifts  (day, user_id, ...)       = the Cash Book's per-login copy, kept in step for employees
--                                        that have a Cash Book login (pr_employees.user_id).
--  • A change on either side is copied to the other by triggers (both directions, no loops).
--  • Cash Book owner screen reads/writes pr_plan directly (owner RLS); staff still see only their own row.
--
-- Safe to run more than once.

-- 1) link a payroll employee to a Cash Book login
alter table public.pr_employees add column if not exists user_id uuid references public.staff(user_id) on delete set null;
create unique index if not exists pr_employees_user_id_key on public.pr_employees(user_id) where user_id is not null;

-- fill the link where the names match exactly (one login ↔ one employee)
update public.pr_employees e set user_id = s.user_id
from public.staff s
where e.user_id is null and s.role <> 'owner'
  and lower(trim(s.name)) = lower(trim(e.name))
  and not exists (select 1 from public.pr_employees x where x.user_id = s.user_id)
  and (select count(*) from public.pr_employees x where lower(trim(x.name)) = lower(trim(e.name))) = 1;

-- 2) both tables accept the same shift values ('sil' = paid leave)
alter table public.shifts drop constraint if exists shifts_shift_check;
alter table public.shifts add constraint shifts_shift_check check (
  shift is null or shift in ('off', 'sil') or shift ~ '^([01]?[0-9]|2[0-3])(:[0-5][0-9])?-([01]?[0-9]|2[0-3])(:[0-5][0-9])?$');

-- 3) shifts → pr_plan
create or replace function public.roster_from_shifts() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record; emp uuid;
begin
  if pg_trigger_depth() > 1 then return null; end if;   -- came from pr_plan → shifts
  r := case when tg_op = 'DELETE' then old else new end;
  select id into emp from public.pr_employees where user_id = r.user_id;
  if emp is null then return null; end if;
  if tg_op = 'DELETE' or r.shift is null then
    delete from public.pr_plan where employee_id = emp and day = r.day;
  else
    insert into public.pr_plan (day, employee_id, shift, updated_at) values (r.day, emp, r.shift, now())
    on conflict (day, employee_id) do update set shift = excluded.shift, updated_at = now()
      where public.pr_plan.shift is distinct from excluded.shift;
  end if;
  return null;
end $$;
drop trigger if exists shifts_to_roster on public.shifts;
create trigger shifts_to_roster after insert or update or delete on public.shifts
  for each row execute function public.roster_from_shifts();

-- 4) pr_plan → shifts
create or replace function public.roster_to_shifts() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record; uid uuid; nm text;
begin
  if pg_trigger_depth() > 1 then return null; end if;   -- came from shifts → pr_plan
  r := case when tg_op = 'DELETE' then old else new end;
  select user_id, name into uid, nm from public.pr_employees where id = r.employee_id;
  if uid is null then return null; end if;
  if tg_op = 'DELETE' or r.shift is null then
    delete from public.shifts where user_id = uid and day = r.day;
  else
    insert into public.shifts (day, user_id, staff_name, shift, updated_by, updated_at) values (r.day, uid, nm, r.shift, auth.uid(), now())
    on conflict (day, user_id) do update set shift = excluded.shift, staff_name = excluded.staff_name, updated_by = excluded.updated_by, updated_at = now()
      where public.shifts.shift is distinct from excluded.shift;
  end if;
  return null;
end $$;
drop trigger if exists roster_to_shifts on public.pr_plan;
create trigger roster_to_shifts after insert or update or delete on public.pr_plan
  for each row execute function public.roster_to_shifts();

-- 5) one-time catch-up (pr_plan wins where both have a value, as before)
--  a) Cash Book days missing from pr_plan → pr_plan (by login link, else by the same name — the rule payroll already used)
insert into public.pr_plan (day, employee_id, shift, updated_at)
select distinct on (s.day, e.id) s.day, e.id, s.shift, now()
from public.shifts s
join public.pr_employees e on e.user_id = s.user_id
   or (e.user_id is null and lower(trim(e.name)) = lower(trim(s.staff_name)))
where s.shift is not null
order by s.day, e.id, (e.user_id = s.user_id) desc nulls last, s.updated_at desc
on conflict (day, employee_id) do nothing;
--  b) pr_plan → shifts for linked employees (fills gaps, and pr_plan's value replaces a different one)
insert into public.shifts (day, user_id, staff_name, shift, updated_at)
select p.day, e.user_id, e.name, p.shift, now()
from public.pr_plan p join public.pr_employees e on e.id = p.employee_id
where e.user_id is not null and p.shift is not null
on conflict (day, user_id) do update set shift = excluded.shift, staff_name = excluded.staff_name, updated_at = now()
  where public.shifts.shift is distinct from excluded.shift;

-- 6) the payroll punch check reads pr_plan first, then the Cash Book by login link (then by name, for old rows)
create or replace function public.pr_plan_for(p_emp uuid, p_day date) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select q.shift from public.pr_plan q where q.employee_id = p_emp and q.day = p_day and q.shift is not null),
    (select s.shift from public.shifts s join public.pr_employees e on e.user_id = s.user_id where e.id = p_emp and s.day = p_day),
    (select s.shift from public.shifts s join public.pr_employees e on lower(trim(e.name)) = lower(trim(s.staff_name)) where e.id = p_emp and s.day = p_day limit 1))
$$;
