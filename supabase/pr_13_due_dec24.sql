-- owner 2026-11-18 (2nd): 13th month — the chosen date counts only if the staff requested it (amount checked + 요청) by that date.
-- Not requested (or requested after the chosen date) → paid on Dec 24 with everyone, even with a chosen date.
-- (Replaces the morning rule "no request → not paid".) Dec 24 everyone not yet paid gets the 받으셨나요? card.

create or replace function public.pr_13_due(p_req timestamptz, p_day date, p_year int)
returns date language sql immutable as $$
  select case when p_req is not null and p_day is not null and (p_req at time zone 'Asia/Manila')::date <= p_day
              then p_day else make_date(p_year, 12, 24) end
$$;

-- 💵 받으셨나요?: salary card from the pay day
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
    -- never opened the 13th month card: from Dec 24 everyone is paid, so make the row
    if a.employee_id is null and td >= make_date(yr, 12, 24) then
      insert into public.pr_13_ack (employee_id, year) values (e.id, yr) on conflict do nothing;
      select * into a from public.pr_13_ack where employee_id = e.id and year = yr;
    end if;
    if a.employee_id is null or not ((td >= public.pr_13_due(a.requested_at, a.pay_date, yr))
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
    'th', coalesce((select jsonb_agg(jsonb_build_object('employee_id', a.employee_id, 'name', e.name, 'year', a.year, 'amount', coalesce(x.amount, a.amount), 'pay_date', public.pr_13_due(a.requested_at, a.pay_date, a.year),
        'recv_at', a.recv_at, 'recv_via', a.recv_via, 'paid', x.paid_on is not null) order by a.recv_at nulls last, e.name)
      from public.pr_13_ack a join public.pr_employees e on e.id = a.employee_id left join public.pr_thirteenth x on x.employee_id = a.employee_id and x.year = a.year
      where a.year = yr and a.recv_ok_at is null and ((td >= public.pr_13_due(a.requested_at, a.pay_date, yr)
        and not (x.paid_on is not null and (a.recv_at is not null or x.paid_on < date '2026-11-12'))) or (a.recv_ask_at is not null and x.paid_on is not null and a.recv_at is null))), '[]'::jsonb));
end $function$;

