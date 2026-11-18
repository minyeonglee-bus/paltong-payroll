-- owner 2026-11-18: the 1–15 payroll is paid on the 16th and covers work up to the 14th's night shift (clock-out on the
-- morning of the 15th). Work on the 15th goes in the 16–30 payroll (app: periodOf carry / carriesOver / payDayOf).
-- The 16–30 payroll is unchanged (paid on its last day). Payrolls before Dec 2026 keep the 15th as pay day.

create or replace function public.pr_payday(p_start date, p_end date)
returns date language sql immutable as $$
  select case when extract(day from p_start) = 1 and p_start >= date '2026-12-01' then p_start + 15 else p_end end
$$;

-- 1st half: end = the 15th · paid: never before the pay day (16th from Dec 2026)
create or replace function public.pr_payroll_period_fix()
returns trigger language plpgsql as $$
begin
  if extract(day from new.period_start) = 1 then new.period_end := new.period_start + 14; end if;
  if new.status = 'paid' and new.paid_on is not null and new.paid_on < public.pr_payday(new.period_start, new.period_end)
    then new.paid_on := public.pr_payday(new.period_start, new.period_end); end if;
  return new;
end $$;

-- 💵 받으셨나요?: salary card from the pay day (16th for the 1–15 payroll)
CREATE OR REPLACE FUNCTION public.pr_emp_recv(p_no text, p_pin text, p_kind text, p_key text, p_via text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c record; e public.pr_employees; p public.pr_payrolls; a public.pr_13_ack; x public.pr_thirteenth;
        td date := (now() at time zone 'Asia/Manila')::date; yr int; amt numeric;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  if c.must_change then return jsonb_build_object('ok', false, 'err', 'must_change'); end if;
  select * into e from public.pr_employees where id = c.emp_id;
  if p_kind = 'pay' then
    select * into p from public.pr_payrolls where employee_id = e.id and period_start = p_key::date;
    if p.id is null or (p.status <> 'paid' and p.shared_at is null) or p.period_end < public.pr_recv_start() or td < public.pr_payday(p.period_start, p.period_end) then
      return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
    if p.recv_at is not null then return jsonb_build_object('ok', true); end if;
    update public.pr_payrolls set recv_at = now(), recv_ok_at = case when status = 'paid' then now() end where id = p.id;
    begin perform public.pr_notify('📥 급여 받음: ' || e.name || ' ' || to_char(p.period_start, 'MM/DD') || '–' || to_char(p.period_end, 'MM/DD')
      || ' ₱' || to_char(coalesce((p.result->>'net')::numeric, 0), 'FM999,999,990.00')
      || case when p.status = 'paid' then ' (이미 지급 기록됨)' else ' — 요청 탭에서 승인해 주세요' end);
    exception when others then null; end;
    return jsonb_build_object('ok', true);
  elsif p_kind = '13' then
    yr := p_key::int;
    if coalesce(p_via, '') not in ('CASH', 'GCASH', 'MAYA', 'METROBANK') then return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
    select * into a from public.pr_13_ack where employee_id = e.id and year = yr;
    select * into x from public.pr_thirteenth where employee_id = e.id and year = yr;
    if a.employee_id is null or not ((a.requested_at is not null and td >= coalesce(a.pay_date, make_date(yr, 12, 24)))
                                     or (a.recv_ask_at is not null and x.paid_on is not null)) then
      return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
    if a.recv_at is not null then return jsonb_build_object('ok', true); end if;
    update public.pr_13_ack set recv_at = now(), recv_via = p_via, recv_ok_at = case when x.paid_on is not null then now() end
      where employee_id = e.id and year = yr;
    amt := coalesce(x.amount, a.amount, 0);
    begin perform public.pr_notify('📥 13월급 받음: ' || e.name || ' ₱' || to_char(amt, 'FM999,999,990.00') || ' · ' || p_via
      || case when x.paid_on is not null then ' (이미 지급 기록됨)' else ' — 요청 탭에서 승인해 주세요' end);
    exception when others then null; end;
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'err', 'bad_value');
end $function$;

CREATE OR REPLACE FUNCTION public.pr_recv_list()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare td date := (now() at time zone 'Asia/Manila')::date; yr int := extract(year from td)::int;
begin
  if not public.is_owner() then return null; end if;
  return jsonb_build_object(
    'pay', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'employee_id', p.employee_id, 'name', e.name, 'period_start', p.period_start, 'period_end', p.period_end,
        'net', p.result->'net', 'parts', p.result->'payout'->'parts', 'paid_via', p.paid_via, 'status', p.status, 'recv_at', p.recv_at) order by p.recv_at nulls last, e.name)
      from public.pr_payrolls p join public.pr_employees e on e.id = p.employee_id
      where p.period_end >= public.pr_recv_start() and public.pr_payday(p.period_start, p.period_end) <= td and (p.status = 'paid' or p.shared_at is not null) and p.recv_ok_at is null
        and not (p.status = 'paid' and p.recv_at is not null)), '[]'::jsonb),
    'th', coalesce((select jsonb_agg(jsonb_build_object('employee_id', a.employee_id, 'name', e.name, 'year', a.year, 'amount', coalesce(x.amount, a.amount), 'pay_date', a.pay_date,
        'recv_at', a.recv_at, 'recv_via', a.recv_via, 'paid', x.paid_on is not null) order by a.recv_at nulls last, e.name)
      from public.pr_13_ack a join public.pr_employees e on e.id = a.employee_id left join public.pr_thirteenth x on x.employee_id = a.employee_id and x.year = a.year
      where a.year = yr and a.recv_ok_at is null and ((a.requested_at is not null and td >= coalesce(a.pay_date, make_date(yr, 12, 24))
        and not (x.paid_on is not null and (a.recv_at is not null or x.paid_on < date '2026-11-12'))) or (a.recv_ask_at is not null and x.paid_on is not null and a.recv_at is null))), '[]'::jsonb));
end $function$;

-- 13th month: payday ±3 days now 12/13–19 around the 16th (12/12–18 already held) → also hold 12/19
insert into public.pr_13_hold (day, note) select date '2026-12-19', '급여일 ±3일 (16일 지급, 사장님 11/18)' where not exists (select 1 from public.pr_13_hold where day = date '2026-12-19');
