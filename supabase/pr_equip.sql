-- Equipment breakdown rule (owner 2026-11-17).
--   1. Staff report the breakdown in the app ("I'll get it fixed") → that day is the start.
--   2. Within 3 days: report "fixed" → OK. Or book a technician date within 3 days → the deadline becomes that date.
--   3. No report by the deadline → judged "not fixed" (late) → loss counted from the start day until it is fixed.
--   Loss per day = weekday average sales (9/1–11/15) − that day's sales, only when below average. Days shared by
--   several late issues count once. The loss is recovered by cancelling incentives/bonuses for ALL staff until covered
--   (birthday incentive is cancelled automatically while a balance is left). Salary is never deducted.
--   Owner can waive an issue.
create table if not exists public.pr_sales_dow_avg (dow int primary key check (dow between 1 and 7), avg_sales numeric not null, basis text);
alter table public.pr_sales_dow_avg enable row level security;
drop policy if exists pr_sales_dow_avg_read on public.pr_sales_dow_avg;
create policy pr_sales_dow_avg_read on public.pr_sales_dow_avg for select to authenticated using (true);
insert into public.pr_sales_dow_avg (dow, avg_sales, basis)
select extract(isodow from biz_date)::int, round(sum(amount) / count(distinct biz_date), 2), '2026-09-01~2026-11-15 cash book sales'
  from public.entries where kind = 'sale' and biz_date between '2026-09-01' and '2026-11-15' group by 1
on conflict (dow) do nothing;

create table if not exists public.pr_equip_issues (
  id uuid primary key default gen_random_uuid(),
  item text not null,
  note text,
  reported_by uuid references public.pr_employees(id),
  reported_at timestamptz not null default now(),
  start_date date not null default (now() at time zone 'Asia/Manila')::date,
  sched_date date, sched_by uuid references public.pr_employees(id), sched_at timestamptz,
  fixed_date date, fixed_by uuid references public.pr_employees(id), fixed_at timestamptz, cost numeric,
  waived_at timestamptz, waive_note text,
  late_notified_at timestamptz
);
alter table public.pr_equip_issues enable row level security;
drop policy if exists pr_equip_issues_read on public.pr_equip_issues;
create policy pr_equip_issues_read on public.pr_equip_issues for select to authenticated using (true);

-- incentives cancelled to cover the loss
create table if not exists public.pr_equip_recover (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.pr_employees(id) on delete set null,
  amount numeric not null, source text not null, at timestamptz not null default now()
);
alter table public.pr_equip_recover enable row level security;
drop policy if exists pr_equip_recover_read on public.pr_equip_recover;
create policy pr_equip_recover_read on public.pr_equip_recover for select to authenticated using (true);

-- deadline: start + 3 days; a technician date booked within those 3 days moves it to that date
create or replace function public.pr_equip_deadline(i public.pr_equip_issues) returns date language sql stable as $$
  select case when i.sched_date is not null and (i.sched_at at time zone 'Asia/Manila')::date <= i.start_date + 3
              then greatest(i.sched_date, i.start_date + 3) else i.start_date + 3 end
$$;
-- state: fixed (on time) · open (before deadline) · late (penalised) · waived
create or replace function public.pr_equip_state(i public.pr_equip_issues) returns text language sql stable as $$
  select case when i.waived_at is not null then 'waived'
              when i.fixed_date is not null and i.fixed_date <= public.pr_equip_deadline(i) then 'fixed'
              when i.fixed_date is not null then 'late'
              when (now() at time zone 'Asia/Manila')::date > public.pr_equip_deadline(i) then 'late'
              else 'open' end
$$;

-- loss days of all late issues (each day once): start → fixed day (or yesterday while still broken)
create or replace function public.pr_equip_loss_days()
returns table (d date, avg_sales numeric, sales numeric, loss numeric) language sql stable security definer set search_path to 'public' as $$
  with days as (
    select distinct g::date d from public.pr_equip_issues i,
      generate_series(i.start_date, coalesce(i.fixed_date, (now() at time zone 'Asia/Manila')::date - 1), interval '1 day') g
     where public.pr_equip_state(i) = 'late'),
  s as (select biz_date, sum(amount) amt from public.entries where kind = 'sale' and biz_date in (select d from days) group by 1)
  select days.d, a.avg_sales, coalesce(s.amt, 0), greatest(a.avg_sales - coalesce(s.amt, 0), 0)
    from days join public.pr_sales_dow_avg a on a.dow = extract(isodow from days.d)::int left join s on s.biz_date = days.d
   order by days.d
$$;
revoke all on function public.pr_equip_loss_days() from public, anon;

create or replace function public.pr_equip_balance() returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('loss', coalesce((select sum(loss) from public.pr_equip_loss_days()), 0),
    'recovered', coalesce((select sum(amount) from public.pr_equip_recover), 0),
    'balance', greatest(coalesce((select sum(loss) from public.pr_equip_loss_days()), 0) - coalesce((select sum(amount) from public.pr_equip_recover), 0), 0))
$$;
revoke all on function public.pr_equip_balance() from public, anon;

create or replace function public.pr_equip_rows(p_all boolean) returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'item', i.item, 'note', i.note, 'start_date', i.start_date, 'reported_at', i.reported_at,
      'reported_by', (select name from public.pr_employees where id = i.reported_by), 'sched_date', i.sched_date,
      'fixed_date', i.fixed_date, 'fixed_by', (select name from public.pr_employees where id = i.fixed_by), 'cost', i.cost,
      'deadline', public.pr_equip_deadline(i), 'state', public.pr_equip_state(i), 'waive_note', i.waive_note) order by i.reported_at desc), '[]'::jsonb)
    from public.pr_equip_issues i
   where p_all or i.fixed_date is null and i.waived_at is null or i.reported_at > now() - interval '7 days'
$$;
revoke all on function public.pr_equip_rows(boolean) from public, anon;

-- staff (pr_emp_equip_act is at the end of the file — category version)
create or replace function public.pr_emp_equip_list(p_no text, p_pin text)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare c record;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  return jsonb_build_object('ok', true, 'issues', public.pr_equip_rows(false), 'bal', public.pr_equip_balance());
end $$;

revoke all on function public.pr_emp_equip_list(text, text) from public;
grant execute on function public.pr_emp_equip_list(text, text) to anon, authenticated;

-- owner
create or replace function public.pr_equip_admin() returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_owner() then raise exception 'OWNER_ONLY'; end if;
  return jsonb_build_object('issues', public.pr_equip_rows(true), 'bal', public.pr_equip_balance(),
    'days', coalesce((select jsonb_agg(to_jsonb(x)) from public.pr_equip_loss_days() x), '[]'::jsonb),
    'avg', (select jsonb_object_agg(dow, avg_sales) from public.pr_sales_dow_avg),
    'recover', coalesce((select jsonb_agg(jsonb_build_object('name', e.name, 'amount', r.amount, 'source', r.source, 'at', r.at) order by r.at desc)
      from public.pr_equip_recover r left join public.pr_employees e on e.id = r.employee_id), '[]'::jsonb));
end $$;
revoke all on function public.pr_equip_admin() from public;
grant execute on function public.pr_equip_admin() to authenticated;

create or replace function public.pr_equip_waive(p_id uuid, p_note text) returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_owner() then raise exception 'OWNER_ONLY'; end if;
  update public.pr_equip_issues set waived_at = case when waived_at is null then now() end, waive_note = case when waived_at is null then p_note end where id = p_id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.pr_equip_waive(uuid, text) from public;
grant execute on function public.pr_equip_waive(uuid, text) to authenticated;

-- daily: push once when an issue becomes late (08:05 Manila)
create or replace function public.pr_equip_daily() returns int language plpgsql security definer set search_path to 'public' as $$
declare i public.pr_equip_issues; n int := 0;
begin
  for i in select * from public.pr_equip_issues where late_notified_at is null and waived_at is null loop
    if public.pr_equip_state(i) = 'late' then
      update public.pr_equip_issues set late_notified_at = now() where id = i.id;
      begin perform public.pr_notify('⚠️ 장비 수리 기한 지남: ' || i.item || ' (통보 ' || to_char(i.start_date, 'MM/DD') || ', 기한 ' || to_char(public.pr_equip_deadline(i), 'MM/DD')
        || ') → 안 고친 것으로 판단, 손해금 계산 시작'); exception when others then null; end;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.pr_equip_daily() from public, anon, authenticated;
select cron.unschedule('pr-equip-daily') where exists (select 1 from cron.job where jobname = 'pr-equip-daily');
select cron.schedule('pr-equip-daily', '5 0 * * *', 'select public.pr_equip_daily()');

-- birthday incentive: cancelled while a loss balance is left (recorded as recovered)
do $do$ declare d text := pg_get_functiondef('public.pr_bday_bonus_run(boolean)'::regprocedure); n text;
begin
  if position('pr_equip_balance' in d) > 0 then return; end if;
  n := replace(d, $a$    chk := public.pr_bday_check(e.id, bd); lid := null;$a$,
                  $a$    chk := public.pr_bday_check(e.id, bd); lid := null;
    if (chk->>'ok')::boolean and (public.pr_equip_balance()->>'balance')::numeric > 0 then
      chk := jsonb_build_object('ok', false, 'status', 'denied', 'reason', '장비 손해금 처리 중 — 인센티브 취소 (잔액 ₱' || (public.pr_equip_balance()->>'balance') || ')');
      insert into public.pr_equip_recover (employee_id, amount, source) values (e.id, amt, '🎂 생일 인센티브 ' || to_char(bd, 'YYYY-MM-DD'));
    end if;$a$);
  if n = d then raise exception 'bday patch not applied'; end if;
  execute n;
end $do$;

-- category (owner 11/17 00:33: 주방기기 · 에어컨 등 장사에 필요하거나 쓰고 있는 물건, 또는 재고)
alter table public.pr_equip_issues add column if not exists cat text not null default 'kitchen' check (cat in ('kitchen','aircon','other','stock'));
create or replace function public.pr_equip_rows(p_all boolean) returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'cat', i.cat, 'item', i.item, 'note', i.note, 'start_date', i.start_date, 'reported_at', i.reported_at,
      'reported_by', (select name from public.pr_employees where id = i.reported_by), 'sched_date', i.sched_date,
      'fixed_date', i.fixed_date, 'fixed_by', (select name from public.pr_employees where id = i.fixed_by), 'cost', i.cost,
      'deadline', public.pr_equip_deadline(i), 'state', public.pr_equip_state(i), 'waive_note', i.waive_note) order by i.reported_at desc), '[]'::jsonb)
    from public.pr_equip_issues i
   where p_all or i.fixed_date is null and i.waived_at is null or i.reported_at > now() - interval '7 days'
$$;
revoke all on function public.pr_equip_rows(boolean) from public, anon;
drop function if exists public.pr_emp_equip_act(text, text, text, uuid, text, date, numeric);
create or replace function public.pr_emp_equip_act(p_no text, p_pin text, p_act text, p_id uuid, p_cat text, p_item text, p_date date, p_cost numeric)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare c record; nm text; i public.pr_equip_issues; td date := (now() at time zone 'Asia/Manila')::date;
  catk text := case p_cat when 'kitchen' then '주방기기' when 'aircon' then '에어컨·전기' when 'stock' then '재고' else '장사 물건' end;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  if c.must_change then return jsonb_build_object('ok', false, 'err', 'must_change'); end if;
  select name into nm from public.pr_employees where id = c.emp_id;
  if p_act = 'report' then
    if coalesce(trim(p_item), '') = '' or length(p_item) > 200 or coalesce(p_cat, '') not in ('kitchen','aircon','other','stock') then return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
    insert into public.pr_equip_issues (cat, item, reported_by) values (p_cat, trim(p_item), c.emp_id) returning * into i;
    begin perform public.pr_notify('🔧 고장·재고 문제 통보 [' || catk || ']: ' || i.item || ' · ' || nm || ' · 기한 ' || to_char(i.start_date + 3, 'MM/DD')); exception when others then null; end;
    return jsonb_build_object('ok', true, 'id', i.id);
  end if;
  select * into i from public.pr_equip_issues where id = p_id for update;
  if not found or i.waived_at is not null or i.fixed_date is not null then return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
  if p_act = 'sched' then
    if p_date is null or p_date < td or p_date > td + 60 then return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
    update public.pr_equip_issues set sched_date = p_date, sched_by = c.emp_id, sched_at = now() where id = i.id returning * into i;
    begin perform public.pr_notify('📅 수리·입고 날짜: ' || i.item || ' ' || to_char(p_date, 'MM/DD') || ' · ' || nm
      || case when (i.sched_at at time zone 'Asia/Manila')::date <= i.start_date + 3 then '' else ' (3일 지나서 잡음 — 기한 안 바뀜)' end); exception when others then null; end;
  elsif p_act = 'fixed' then
    if p_cost is not null and (p_cost < 0 or p_cost > 1000000) then return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
    update public.pr_equip_issues set fixed_date = td, fixed_by = c.emp_id, fixed_at = now(), cost = p_cost where id = i.id returning * into i;
    begin perform public.pr_notify('✅ 해결 완료: ' || i.item || ' · ' || nm || coalesce(' · ₱' || p_cost, '')
      || case when public.pr_equip_state(i) = 'late' then ' (기한 지남 → 손해금 계산)' else '' end); exception when others then null; end;
  else return jsonb_build_object('ok', false, 'err', 'bad_value');
  end if;
  return jsonb_build_object('ok', true, 'state', public.pr_equip_state(i));
end $$;
revoke all on function public.pr_emp_equip_act(text, text, text, uuid, text, text, date, numeric) from public;
grant execute on function public.pr_emp_equip_act(text, text, text, uuid, text, text, date, numeric) to anon, authenticated;
