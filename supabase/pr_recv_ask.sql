-- Owner can ask someone already paid to confirm "받았어요" for the 13th month (pr_13_ack.recv_ask_at), owner 2026-11-13: Lorence.
alter table public.pr_13_ack add column if not exists recv_ask_at timestamptz;
update public.pr_13_ack a set recv_ask_at = now() from public.pr_employees e where e.id = a.employee_id and a.year = 2026 and e.name = 'Lorence' and a.recv_at is null;

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
end $$;

do $do$ declare d text := pg_get_functiondef('public.pr_emp_view(text,text)'::regprocedure); n text;
begin
  if position('recv_ask_at' in d) > 0 then return; end if;
  n := replace(d, $a$'recv_ok_at', a.recv_ok_at))$a$, $a$'recv_ok_at', a.recv_ok_at, 'recv_ask_at', a.recv_ask_at))$a$);
  if n = d then raise exception 'recv_ask patch not applied'; end if;
  execute n;
end $do$;

-- owner list: people asked to confirm after being paid show under "아직 안 누름"
do $do$ declare d text := pg_get_functiondef('public.pr_recv_list()'::regprocedure); n text;
begin
  if position('recv_ask_at' in d) > 0 then return; end if;
  n := replace(d, $a$where a.year = yr and a.requested_at is not null and a.recv_ok_at is null and td >= coalesce(a.pay_date, make_date(yr, 12, 24))
        and not (x.paid_on is not null and (a.recv_at is not null or x.paid_on < date '2026-11-12'))$a$,
     $a$where a.year = yr and a.recv_ok_at is null and ((a.requested_at is not null and td >= coalesce(a.pay_date, make_date(yr, 12, 24))
        and not (x.paid_on is not null and (a.recv_at is not null or x.paid_on < date '2026-11-12'))) or (a.recv_ask_at is not null and x.paid_on is not null and a.recv_at is null))$a$);
  if n = d then raise exception 'recv_list patch not applied'; end if;
  execute n;
end $do$;
