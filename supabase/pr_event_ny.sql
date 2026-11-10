-- New Year special shift sign-up (owner 2026-11-10).
-- Staff app shows the owner's notice with two separate questions:
--   12/31  17:00–05:00 special 12-hour shift (₱2,000 + ₱3,000 incentive = ₱5,000, paid on completion, NOT in payroll)
--   1/1    store closed — someone stays to look after the store (meal + a separate day's pay, NOT in payroll)
-- Each day: "근무 원함 / I want to work" or "휴무 원함 / I want the day off". The answer goes straight into the schedule
-- (pr_plan, which syncs to the Cash Book): work → the event shift, off → 'off' (a saved SIL is never overwritten).
-- Staff can change their answer until the day before. The owner gets a push for every answer.
-- Payroll (app.js) leaves worked event days out of the regular cutoff (paid separately); the weekly auto-schedule
-- treats both days as store-closed (tools/schedule/overrides.json "closed") and keeps these saved rows.

create table if not exists public.pr_event_resp (
  event text not null,
  day date not null,
  employee_id uuid not null references public.pr_employees(id) on delete cascade,
  choice text not null check (choice in ('work', 'off')),
  updated_at timestamptz not null default now(),
  primary key (event, day, employee_id));
alter table public.pr_event_resp enable row level security;
drop policy if exists pr_event_resp_read on public.pr_event_resp;
create policy pr_event_resp_read on public.pr_event_resp for select using (public.is_owner());

-- the event days and the shift saved for "work"
create or replace function public.pr_event_shift(p_event text, p_day date) returns text language sql immutable as $$
  select case when p_event = 'ny2027' and p_day = date '2026-12-31' then '17-5'
              when p_event = 'ny2027' and p_day = date '2027-01-01' then '5-17' end
$$;

create or replace function public.pr_emp_event_get(p_no text, p_pin text, p_event text)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare c record;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  return jsonb_build_object('ok', true, 'resp', coalesce((select jsonb_agg(jsonb_build_object('day', to_char(r.day, 'YYYY-MM-DD'), 'choice', r.choice, 'at', r.updated_at))
    from public.pr_event_resp r where r.event = p_event and r.employee_id = c.emp_id), '[]'::jsonb));
end $$;
revoke all on function public.pr_emp_event_get(text, text, text) from public;
grant execute on function public.pr_emp_event_get(text, text, text) to anon, authenticated;

create or replace function public.pr_emp_event_set(p_no text, p_pin text, p_event text, p_day date, p_choice text)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare c record; e public.pr_employees; sh text := public.pr_event_shift(p_event, p_day); prev text;
  td date := (now() at time zone 'Asia/Manila')::date;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  if c.must_change then return jsonb_build_object('ok', false, 'err', 'must_change'); end if;
  if sh is null or p_choice not in ('work', 'off') then return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
  if p_day <= td then return jsonb_build_object('ok', false, 'err', 'ev_closed'); end if;
  select * into e from public.pr_employees where id = c.emp_id;
  if e.resigned_on is not null then return jsonb_build_object('ok', false, 'err', 'resigned'); end if;
  select r.choice into prev from public.pr_event_resp r where r.event = p_event and r.day = p_day and r.employee_id = c.emp_id;
  insert into public.pr_event_resp (event, day, employee_id, choice) values (p_event, p_day, c.emp_id, p_choice)
    on conflict (event, day, employee_id) do update set choice = excluded.choice, updated_at = now();
  -- schedule: work → event shift; off → 'off' (keep an approved SIL)
  if not exists (select 1 from public.pr_plan q where q.employee_id = c.emp_id and q.day = p_day and q.shift = 'sil') then
    insert into public.pr_plan (day, employee_id, shift) values (p_day, c.emp_id, case when p_choice = 'work' then sh else 'off' end)
      on conflict (day, employee_id) do update set shift = excluded.shift;
  end if;
  if prev is distinct from p_choice then
    begin
      perform public.pr_notify('🎆 연말 근무 응답 · ' || e.name || E'\n' || to_char(p_day, 'MM/DD') || ' '
        || case when p_choice = 'work' then '근무 원함 (' || replace(sh, '-', '–') || ')' else '휴무 원함' end
        || case when prev is not null then ' (변경)' else '' end);
    exception when others then null; end;
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.pr_emp_event_set(text, text, text, date, text) from public;
grant execute on function public.pr_emp_event_set(text, text, text, date, text) to anon, authenticated;
