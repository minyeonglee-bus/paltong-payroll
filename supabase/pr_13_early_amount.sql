-- 13th month 일찍 받기 요청에 "받고 싶은 금액" (사장님 2026-11-20, June)
--  • 직원: 일찍 받기 요청 창에 금액 칸 (비우면 전액). pr_13_ack.early_amount.
--  • 사장님: 요청 탭 13월급 표 노란 칸에 금액 표시 + 푸시에 금액. 승인 뒤 "＋ 일부 지급" 버튼에 금액이 미리 들어감.
alter table public.pr_13_ack add column if not exists early_amount numeric(12,2);

create or replace function public.pr_emp_early13(p_no text, p_pin text, p_year int, p_date date, p_reason text, p_amount numeric)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare c record; e public.pr_employees; a public.pr_13_ack; td date := (now() at time zone 'Asia/Manila')::date;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  if c.must_change then return jsonb_build_object('ok', false, 'err', 'must_change'); end if;
  select * into e from public.pr_employees where id = c.emp_id;
  select * into a from public.pr_13_ack where employee_id = e.id and year = p_year;
  if a.employee_id is null or a.requested_at is null then return jsonb_build_object('ok', false, 'err', 'not_requested'); end if;
  if exists (select 1 from public.pr_thirteenth x where x.employee_id = e.id and x.year = p_year) then return jsonb_build_object('ok', false, 'err', 'paid'); end if;
  if p_date is null or p_date <= td or p_date >= make_date(p_year, 12, 24) or coalesce(trim(p_reason), '') = ''
     or (p_amount is not null and p_amount <= 0) then
    return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
  update public.pr_13_ack set early_date = p_date, early_reason = left(trim(p_reason), 300), early_amount = p_amount,
         early_at = now(), early_ok = null, early_decided_at = null
   where employee_id = e.id and year = p_year;
  begin perform public.pr_notify('🙏 13월급 일찍 받기 요청: ' || e.name || ' ' || to_char(p_date, 'MM/DD (Dy)')
      || ' · ' || coalesce('₱' || to_char(p_amount, 'FM999,999,990.00'), '전액') || ' · ' || left(trim(p_reason), 120) || ' — 요청 탭에서 승인/거절');
  exception when others then null; end;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.pr_emp_early13(text, text, int, date, text, numeric) from public;
grant execute on function public.pr_emp_early13(text, text, int, date, text, numeric) to anon, authenticated;

-- old 5-arg version (phones that have not reloaded yet) → full amount
create or replace function public.pr_emp_early13(p_no text, p_pin text, p_year int, p_date date, p_reason text)
returns jsonb language sql security definer set search_path to 'public' as $$
  select public.pr_emp_early13(p_no, p_pin, p_year, p_date, p_reason, null::numeric) $$;

-- pr_emp_view: ack13 also returns early_amount
do $do$ declare d text := pg_get_functiondef('public.pr_emp_view(text,text)'::regprocedure); n text;
begin
  if position($a$'early_amount', a.early_amount$a$ in d) > 0 then return; end if;
  n := replace(d, $a$'early_ok', a.early_ok$a$, $a$'early_ok', a.early_ok, 'early_amount', a.early_amount$a$);
  if n = d then raise exception 'early_amount patch not applied'; end if;
  execute n;
end $do$;
