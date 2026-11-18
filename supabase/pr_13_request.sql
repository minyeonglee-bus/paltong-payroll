-- 13th month request (owner 2026-11-09: "13몬스 요청하기 만들어주고 · 금액이 맞는지 확인 후 요청하면 관리자한테 알림").
-- Staff open the 13th month slip, then either
--   ✅ "the amount is right → request"  (from Nov 7 of the year)  → push to the owner with the amount
--   ⚠️ "the amount looks wrong" + reason                          → push to the owner with the reason
-- Stored on pr_13_ack (requested_at / ok / issue_note). One request per year; a dispute can be followed by a request.
alter table public.pr_13_ack add column if not exists requested_at timestamptz;
alter table public.pr_13_ack add column if not exists ok boolean;
alter table public.pr_13_ack add column if not exists issue_note text;

create or replace function public.pr_emp_req13(p_no text, p_pin text, p_year int, p_amount numeric, p_ok boolean, p_note text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare c record; e public.pr_employees; a public.pr_13_ack; td date := (now() at time zone 'Asia/Manila')::date;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  if c.must_change then return jsonb_build_object('ok', false, 'err', 'must_change'); end if;
  if p_year is null or p_year <> extract(year from td)::int then return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
  select * into e from public.pr_employees where id = c.emp_id;
  select * into a from public.pr_13_ack where employee_id = e.id and year = p_year;
  if a.requested_at is not null then return jsonb_build_object('ok', false, 'err', 'already'); end if;
  if p_ok then
    if td < make_date(p_year, 11, 7) then return jsonb_build_object('ok', false, 'err', 'too_early'); end if;
    insert into public.pr_13_ack (employee_id, year, amount, ack_at, requested_at, ok)
    values (e.id, p_year, p_amount, now(), now(), true)
    on conflict (employee_id, year) do update set amount = excluded.amount, ack_at = now(), requested_at = now(), ok = true;
    begin perform public.pr_notify('💰 13월급 요청: ' || e.name || ' ₱' || to_char(p_amount, 'FM999,999,990.00') || ' (직원이 금액 확인함)');
    exception when others then null; end;
  else
    if coalesce(trim(p_note), '') = '' then return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
    insert into public.pr_13_ack (employee_id, year, amount, ack_at, ok, issue_note)
    values (e.id, p_year, p_amount, now(), false, left(trim(p_note), 300))
    on conflict (employee_id, year) do update set amount = excluded.amount, ack_at = now(), ok = false, issue_note = excluded.issue_note;
    begin perform public.pr_notify('⚠️ 13월급 금액 문의: ' || e.name || ' (앱 ₱' || to_char(p_amount, 'FM999,999,990.00') || ') · ' || left(trim(p_note), 120));
    exception when others then null; end;
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.pr_emp_req13(text, text, int, numeric, boolean, text) from public;
grant execute on function public.pr_emp_req13(text, text, int, numeric, boolean, text) to anon, authenticated;

-- pr_emp_view: ack13 also returns requested_at / ok / issue_note
do $do$ declare d text := pg_get_functiondef('public.pr_emp_view(text,text)'::regprocedure); n text;
begin
  if position($a$'requested_at', a.requested_at$a$ in d) > 0 then return; end if;
  n := replace(d, $a$'amount', a.amount))$a$, $a$'amount', a.amount, 'requested_at', a.requested_at, 'ok', a.ok, 'issue_note', a.issue_note))$a$);
  if n = d then raise exception '13 request patch not applied'; end if;
  execute n;
end $do$;
