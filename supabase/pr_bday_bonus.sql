-- Birthday incentive (contract §3.4, owner 2026-11-04): ₱500 (pr_settings.bday_bonus) paid in the cutoff that contains
-- the birthday, if the 3 months before the birthday have no attendance problem.
--   window      = [birthday − 3 months, birthday − 1 day]
--   problem     = a late clock-in (dev_min > 0) or early clock-out (dev_min < 0) in the window (void punches ignored),
--                 or late / absent recorded on a finalized payroll whose cutoff overlaps the window
--   must cover  = employed for the whole window (hired_on, else first payroll) and every finished cutoff in the window
--                 has a finalized (paid or shared) payroll — otherwise "not enough records" (owner decides by hand)
-- Decided once, on/after the birthday (birthdays from 2026-11-04 on). Paid → a 'bonus' ledger row dated the birthday,
-- so it lands in that cutoff like any other bonus. Each decision is kept in pr_bday_bonus with the reason.
alter table public.pr_settings add column if not exists bday_bonus numeric not null default 500;
alter table public.pr_settings add column if not exists bday_run_on date;

create table if not exists public.pr_bday_bonus (
  employee_id uuid not null references public.pr_employees(id) on delete cascade,
  year int not null,
  bday date not null,
  status text not null check (status in ('paid', 'denied', 'no_record')),
  reason text,
  amount numeric,
  ledger_id uuid references public.pr_ledger(id) on delete set null,
  checked_at timestamptz not null default now(),
  primary key (employee_id, year)
);
alter table public.pr_bday_bonus enable row level security;
drop policy if exists pr_bday_read on public.pr_bday_bonus; create policy pr_bday_read on public.pr_bday_bonus for select using (public.is_owner());
drop policy if exists pr_bday_write on public.pr_bday_bonus; create policy pr_bday_write on public.pr_bday_bonus for all using (public.is_owner()) with check (public.is_owner());

-- birthday in a given year (29 Feb → 28 Feb in other years)
create or replace function public.pr_bday_in(p_birth date, p_year int) returns date language sql immutable as $$
  select (p_birth + make_interval(years => p_year - extract(year from p_birth)::int))::date
$$;

-- attendance check for one employee and one birthday (read-only)
create or replace function public.pr_bday_check(p_emp uuid, p_bday date)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare e public.pr_employees; w0 date := (p_bday - interval '3 months')::date; w1 date := p_bday - 1; started date;
  n_late int; n_early int; bad_pay text; m date; half int; ps date; pe date; missing text := '';
begin
  select * into e from public.pr_employees where id = p_emp;
  started := coalesce(e.hired_on, (select min(period_start) from public.pr_payrolls where employee_id = p_emp));
  if started is null or started > w0 then
    return jsonb_build_object('ok', false, 'status', 'denied', 'w0', w0, 'w1', w1, 'reason', '3개월 근무 전 (시작 ' || coalesce(started::text, '기록 없음') || ')');
  end if;
  select count(*) filter (where kind = 'in' and dev_min > 0), count(*) filter (where kind = 'out' and dev_min < 0) into n_late, n_early
    from public.pr_punches where employee_id = p_emp and status <> 'void' and dev_min is not null
     and (punched_at at time zone 'Asia/Manila')::date between w0 and w1;
  select string_agg(to_char(p.period_start, 'MM/DD') || ' ' ||
           concat_ws(' ', case when coalesce((p.result->>'lateMinutes')::numeric, 0) > 0 then '지각 ' || (p.result->>'lateMinutes') || '분' end,
                          case when coalesce((p.result->>'absentDays')::numeric, 0) > 0 then '결근 ' || (p.result->>'absentDays') || '일' end), ', ')
    into bad_pay
    from public.pr_payrolls p
   where p.employee_id = p_emp and (p.status = 'paid' or p.shared_at is not null) and p.period_start <= w1 and p.period_end >= w0
     and (coalesce((p.result->>'lateMinutes')::numeric, 0) > 0 or coalesce((p.result->>'absentDays')::numeric, 0) > 0);
  if n_late > 0 or n_early > 0 or bad_pay is not null then
    return jsonb_build_object('ok', false, 'status', 'denied', 'w0', w0, 'w1', w1, 'reason',
      concat_ws(' · ', case when n_late > 0 then '출근 지각 ' || n_late || '회' end, case when n_early > 0 then '조퇴 ' || n_early || '회' end,
                       case when bad_pay is not null then '급여 기록: ' || bad_pay end));
  end if;
  -- every finished cutoff that overlaps the window needs a finalized payroll
  m := date_trunc('month', w0)::date;
  while m <= w1 loop
    for half in 1..2 loop
      ps := case when half = 1 then m else m + 15 end;
      pe := case when half = 1 then m + 14 else least(m + 29, (m + interval '1 month - 1 day')::date) end;
      if pe >= w0 and ps <= w1 and pe < (now() at time zone 'Asia/Manila')::date and ps >= started
         and not exists (select 1 from public.pr_payrolls p where p.employee_id = p_emp and p.period_start = ps and (p.status = 'paid' or p.shared_at is not null)) then
        missing := missing || case when missing = '' then '' else ', ' end || to_char(ps, 'MM/DD') || '~' || to_char(pe, 'MM/DD');
      end if;
    end loop;
    m := (m + interval '1 month')::date;
  end loop;
  if missing <> '' then
    return jsonb_build_object('ok', false, 'status', 'no_record', 'w0', w0, 'w1', w1, 'reason', '급여 기록 없음: ' || missing);
  end if;
  return jsonb_build_object('ok', true, 'status', 'paid', 'w0', w0, 'w1', w1, 'reason', '3개월 근태 문제 없음');
end $$;
revoke all on function public.pr_bday_check(uuid, date) from public, anon, authenticated;

-- decide every birthday that has arrived (once a day at most; safe to call from anywhere)
create or replace function public.pr_bday_bonus_run(p_force boolean default false)
returns int language plpgsql security definer set search_path to 'public' as $$
declare td date := (now() at time zone 'Asia/Manila')::date; e record; bd date; chk jsonb; lid uuid; amt numeric; n int := 0;
begin
  if not p_force and (select bday_run_on from public.pr_settings where id = 1) = td then return 0; end if;
  update public.pr_settings set bday_run_on = td where id = 1;
  select coalesce(bday_bonus, 500) into amt from public.pr_settings where id = 1;
  for e in select * from public.pr_employees where active and resigned_on is null and birthday is not null and name <> 'test' loop
    bd := public.pr_bday_in(e.birthday, extract(year from td)::int);
    if bd > td or bd < date '2026-11-04' then continue; end if;
    if exists (select 1 from public.pr_bday_bonus where employee_id = e.id and year = extract(year from bd)) then continue; end if;
    chk := public.pr_bday_check(e.id, bd); lid := null;
    if (chk->>'ok')::boolean then
      insert into public.pr_ledger (employee_id, kind, biz_date, amount, note, note_en, verified, authorized, created_by)
      values (e.id, 'bonus', bd, amt, '🎂 생일 인센티브 (3개월 근태 문제 없음 · 자동)', '🎂 Birthday incentive (3 months good attendance · auto)', true, true, null)
      returning id into lid;
    end if;
    insert into public.pr_bday_bonus (employee_id, year, bday, status, reason, amount, ledger_id)
    values (e.id, extract(year from bd), bd, chk->>'status', chk->>'reason', case when lid is not null then amt end, lid);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.pr_bday_bonus_run(boolean) from public, anon, authenticated;

-- owner: run now + list this year's birthdays (decided and upcoming, with a preview of the check)
create or replace function public.pr_bday_list()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare td date := (now() at time zone 'Asia/Manila')::date;
begin
  if not public.is_owner() then raise exception 'OWNER_ONLY'; end if;
  perform public.pr_bday_bonus_run(true);
  return coalesce((select jsonb_agg(x order by x->>'bday') from (
    select jsonb_build_object('employee_id', e.id, 'name', e.name, 'bday', public.pr_bday_in(e.birthday, extract(year from td)::int),
      'decided', b.status, 'reason', coalesce(b.reason, (public.pr_bday_check(e.id, public.pr_bday_in(e.birthday, extract(year from td)::int)))->>'reason'),
      'preview', case when b.status is null then (public.pr_bday_check(e.id, public.pr_bday_in(e.birthday, extract(year from td)::int)))->>'status' end,
      'amount', b.amount, 'checked_at', b.checked_at) x
    from public.pr_employees e left join public.pr_bday_bonus b on b.employee_id = e.id and b.year = extract(year from td)::int
    where e.active and e.resigned_on is null and e.birthday is not null and e.name <> 'test') q), '[]'::jsonb);
end $$;
revoke all on function public.pr_bday_list() from public;
grant execute on function public.pr_bday_list() to authenticated;

-- staff app opening also runs it (at most once a day), so it happens without anyone pressing anything
do $do$ declare d text := pg_get_functiondef('public.pr_emp_view(text,text)'::regprocedure); n text;
begin
  if position('pr_bday_bonus_run' in d) > 0 then return; end if;
  n := replace(d, $a$  select * into e from public.pr_employees where id = c.emp_id;$a$,
                  $a$  perform public.pr_bday_bonus_run();
  select * into e from public.pr_employees where id = c.emp_id;$a$);
  if n = d then raise exception 'view patch not applied'; end if;
  execute n;
end $do$;
