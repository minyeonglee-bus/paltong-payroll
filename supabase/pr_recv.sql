-- "받으셨나요?" — staff confirm they received pay (owner 2026-11-12)
--   * Salary: on the pay day (period_end: 15th / 30th) of a finalized (shared) or paid payroll → staff Home shows
--     "받으셨나요?" at the very top of every tab until they press "받았어요". From the 11/1–15 payroll on.
--     Bonuses (birthday, sales day, …) are part of the payroll, so they are confirmed with it.
--   * 13th month: on the chosen pay date (pr_13_ack.pay_date, or Dec 24 when none) of a requested 13th month.
--     Lorence (paid 11/9, never requested) is not asked. Staff also choose how they got it (cash / GCash / Maya / Metrobank).
--   * Staff press → owner push → owner approves in the "To pay" tab:
--       salary  → payroll marked paid (paid_on = the day staff pressed) → existing trigger writes the cash book row
--       13th    → the 13th month payment dialog opens pre-filled → pr_thirteenth → existing trigger writes the cash book row
--     Owner can also send it back ("아직 안 줬어요") → the card shows again for the staff.
--   * Already recorded as paid by the owner before the staff pressed → pressing only records the confirmation (no approval).
alter table public.pr_payrolls add column if not exists recv_at timestamptz;
alter table public.pr_payrolls add column if not exists recv_ok_at timestamptz;
alter table public.pr_13_ack add column if not exists recv_at timestamptz;
alter table public.pr_13_ack add column if not exists recv_via text;
alter table public.pr_13_ack add column if not exists recv_ok_at timestamptz;

create or replace function public.pr_recv_start() returns date language sql immutable as $$ select date '2026-11-15' $$;

-- payroll: paid → confirmation counts as approved · un-paid / un-shared → ask again
create or replace function public.pr_recv_pay_trg() returns trigger language plpgsql as $$
begin
  if new.status = 'paid' and new.recv_at is not null and new.recv_ok_at is null then new.recv_ok_at := now(); end if;
  if old.status = 'paid' and new.status <> 'paid' then new.recv_ok_at := null; new.recv_at := null; end if;
  if old.shared_at is not null and new.shared_at is null and new.status <> 'paid' then new.recv_at := null; new.recv_ok_at := null; end if;
  return new;
end $$;
drop trigger if exists pr_recv_pay on public.pr_payrolls;
create trigger pr_recv_pay before update on public.pr_payrolls for each row execute function public.pr_recv_pay_trg();

-- 13th: payment recorded → confirmation approved · payment deleted → ask again
create or replace function public.pr_recv_13_trg() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    update public.pr_13_ack set recv_at = null, recv_via = null, recv_ok_at = null where employee_id = old.employee_id and year = old.year;
    return old;
  end if;
  if new.paid_on is not null then
    update public.pr_13_ack set recv_ok_at = now() where employee_id = new.employee_id and year = new.year and recv_at is not null and recv_ok_at is null;
  end if;
  return new;
end $$;
drop trigger if exists pr_recv_13 on public.pr_thirteenth;
create trigger pr_recv_13 after insert or update or delete on public.pr_thirteenth for each row execute function public.pr_recv_13_trg();

-- staff: "받았어요"   p_kind 'pay' (p_key = period_start) | '13' (p_key = year, p_via = how)
create or replace function public.pr_emp_recv(p_no text, p_pin text, p_kind text, p_key text, p_via text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare c record; e public.pr_employees; p public.pr_payrolls; a public.pr_13_ack; x public.pr_thirteenth;
        td date := (now() at time zone 'Asia/Manila')::date; yr int; amt numeric;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  if c.must_change then return jsonb_build_object('ok', false, 'err', 'must_change'); end if;
  select * into e from public.pr_employees where id = c.emp_id;
  if p_kind = 'pay' then
    select * into p from public.pr_payrolls where employee_id = e.id and period_start = p_key::date;
    if p.id is null or (p.status <> 'paid' and p.shared_at is null) or p.period_end < public.pr_recv_start() or td < p.period_end then
      return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
    if p.recv_at is not null then return jsonb_build_object('ok', true); end if;
    update public.pr_payrolls set recv_at = now(), recv_ok_at = case when status = 'paid' then now() end where id = p.id;
    begin perform public.pr_notify('📥 급여 받음: ' || e.name || ' ' || to_char(p.period_start, 'MM/DD') || '–' || to_char(p.period_end, 'MM/DD')
      || ' ₱' || to_char(coalesce((p.result->>'net')::numeric, 0), 'FM999,999,990.00')
      || case when p.status = 'paid' then ' (이미 지급 기록됨)' else ' — 지급 예정 탭에서 승인해 주세요' end);
    exception when others then null; end;
    return jsonb_build_object('ok', true);
  elsif p_kind = '13' then
    yr := p_key::int;
    if coalesce(p_via, '') not in ('CASH', 'GCASH', 'MAYA', 'METROBANK') then return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
    select * into a from public.pr_13_ack where employee_id = e.id and year = yr;
    select * into x from public.pr_thirteenth where employee_id = e.id and year = yr;
    if a.employee_id is null or a.requested_at is null or td < coalesce(a.pay_date, make_date(yr, 12, 24)) then
      return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
    if a.recv_at is not null then return jsonb_build_object('ok', true); end if;
    update public.pr_13_ack set recv_at = now(), recv_via = p_via, recv_ok_at = case when x.paid_on is not null then now() end
      where employee_id = e.id and year = yr;
    amt := coalesce(x.amount, a.amount, 0);
    begin perform public.pr_notify('📥 13월급 받음: ' || e.name || ' ₱' || to_char(amt, 'FM999,999,990.00') || ' · ' || p_via
      || case when x.paid_on is not null then ' (이미 지급 기록됨)' else ' — 지급 예정 탭에서 승인해 주세요' end);
    exception when others then null; end;
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'err', 'bad_value');
end $$;
revoke all on function public.pr_emp_recv(text, text, text, text, text) from public;
grant execute on function public.pr_emp_recv(text, text, text, text, text) to anon, authenticated;

-- owner: approve / send back a salary confirmation (13th approval goes through the 13th payment dialog)
create or replace function public.pr_recv_decide(p_id uuid, p_ok boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare p public.pr_payrolls;
begin
  if not public.is_owner() then raise exception 'not allowed'; end if;
  select * into p from public.pr_payrolls where id = p_id;
  if p.id is null or p.recv_at is null then return jsonb_build_object('ok', false); end if;
  if p_ok then
    update public.pr_payrolls set status = 'paid', paid_on = coalesce(paid_on, (p.recv_at at time zone 'Asia/Manila')::date), recv_ok_at = now() where id = p_id;
  else
    update public.pr_payrolls set recv_at = null, recv_ok_at = null where id = p_id and status <> 'paid';
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.pr_recv_decide(uuid, boolean) from public, anon;
grant execute on function public.pr_recv_decide(uuid, boolean) to authenticated;

create or replace function public.pr_recv13_back(p_emp uuid, p_year int)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_owner() then raise exception 'not allowed'; end if;
  update public.pr_13_ack set recv_at = null, recv_via = null, recv_ok_at = null
   where employee_id = p_emp and year = p_year and not exists (select 1 from public.pr_thirteenth x where x.employee_id = p_emp and x.year = p_year);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.pr_recv13_back(uuid, int) from public, anon;
grant execute on function public.pr_recv13_back(uuid, int) to authenticated;

-- owner list: waiting for approval + staff who have not pressed yet
create or replace function public.pr_recv_list()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare td date := (now() at time zone 'Asia/Manila')::date; yr int := extract(year from td)::int;
begin
  if not public.is_owner() then return null; end if;
  return jsonb_build_object(
    'pay', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'employee_id', p.employee_id, 'name', e.name, 'period_start', p.period_start, 'period_end', p.period_end,
        'net', p.result->'net', 'parts', p.result->'payout'->'parts', 'paid_via', p.paid_via, 'status', p.status, 'recv_at', p.recv_at) order by p.recv_at nulls last, e.name)
      from public.pr_payrolls p join public.pr_employees e on e.id = p.employee_id
      where p.period_end >= public.pr_recv_start() and p.period_end <= td and (p.status = 'paid' or p.shared_at is not null) and p.recv_ok_at is null
        and not (p.status = 'paid' and p.recv_at is not null)), '[]'::jsonb),
    'th', coalesce((select jsonb_agg(jsonb_build_object('employee_id', a.employee_id, 'name', e.name, 'year', a.year, 'amount', coalesce(x.amount, a.amount), 'pay_date', a.pay_date,
        'recv_at', a.recv_at, 'recv_via', a.recv_via, 'paid', x.paid_on is not null) order by a.recv_at nulls last, e.name)
      from public.pr_13_ack a join public.pr_employees e on e.id = a.employee_id left join public.pr_thirteenth x on x.employee_id = a.employee_id and x.year = a.year
      where a.year = yr and a.requested_at is not null and a.recv_ok_at is null and td >= coalesce(a.pay_date, make_date(yr, 12, 24))
        and not (x.paid_on is not null and (a.recv_at is not null or x.paid_on < date '2026-11-12'))), '[]'::jsonb));
end $$;
revoke all on function public.pr_recv_list() from public, anon;
grant execute on function public.pr_recv_list() to authenticated;

-- "승인 대기" bar: + received confirmations waiting for approval
create or replace function public.pr_pending_raw()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'leave', (select count(distinct coalesce(grp::text, id::text)) from public.pr_sil_req where status = 'pending'),
    'punch', (select count(*) from public.pr_punches where status = 'pending'),
    'cash',  (select count(*) from public.pr_cash_issues where status = 'open'),
    'recv',  (select count(*) from public.pr_payrolls where recv_at is not null and recv_ok_at is null)
           + (select count(*) from public.pr_13_ack a where a.recv_at is not null and a.recv_ok_at is null)) $$;

-- pr_emp_view: payrolls + ack13 carry the confirmation fields
do $do$ declare d text := pg_get_functiondef('public.pr_emp_view(text,text)'::regprocedure); n text;
begin
  if position($a$'recv_at', p.recv_at$a$ in d) > 0 then return; end if;
  n := replace(d, $a$'ack_at', p.ack_at,$a$, $a$'ack_at', p.ack_at, 'recv_at', p.recv_at, 'recv_ok_at', p.recv_ok_at,$a$);
  n := replace(n, $a$'pay_date', a.pay_date))$a$, $a$'pay_date', a.pay_date, 'recv_at', a.recv_at, 'recv_via', a.recv_via, 'recv_ok_at', a.recv_ok_at))$a$);
  if n = d or position($a$'recv_via', a.recv_via$a$ in n) = 0 then raise exception 'recv patch not applied'; end if;
  execute n;
end $do$;

-- a paid payroll stays frozen, except the staff's "received" confirmation columns
create or replace function public.pr_guard_paid_payroll() returns trigger language plpgsql as $$
begin
  if old.status = 'paid' and not public.is_owner() then
    if tg_op = 'UPDATE' and (to_jsonb(new) - 'recv_at' - 'recv_ok_at' - 'updated_at') = (to_jsonb(old) - 'recv_at' - 'recv_ok_at' - 'updated_at') then return new; end if;
    raise exception 'PAID_LOCKED';
  end if;
  return coalesce(new, old);
end $$;

-- daily 10:03 summary also counts received confirmations
create or replace function public.pr_pending_daily()
returns void language plpgsql security definer set search_path to 'public' as $$
declare p jsonb := public.pr_pending_raw(); a int := (p->>'leave')::int; b int := (p->>'punch')::int; c int := (p->>'cash')::int; r int := coalesce((p->>'recv')::int, 0);
begin
  if a + b + c + r = 0 then return; end if;
  perform public.pr_notify('📋 승인 대기 ' || (a + b + c + r) || '건' || E'\n'
    || concat_ws(' · ', case when a > 0 then '휴가 ' || a end, case when b > 0 then '출퇴근 사유 ' || b end, case when c > 0 then '현금 부족 ' || c end,
                 case when r > 0 then '받음 확인 ' || r end)
    || E'\n👉 급여 앱에서 확인해 주세요');
end $$;
