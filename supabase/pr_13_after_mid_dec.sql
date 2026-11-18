-- 13th month, owner 2026-11-18 night: "나갈 돈이 많아서 12월 중순 이후로 옮기되, 받아야 할 이유가 있으면 따로 요청".
--   * Not paid yet + chosen date before Dec 19 → date cleared (old date kept in moved_from), they choose again
--     from Dec 19 – Dec 24 (one person per day until Dec 23, Dec 24 everyone). No choice → Dec 24 (pr_13_due).
--   * Nov 19 – Dec 18 blocked in pr_13_hold (Erika's 11/27 final pay stays as it is).
--   * Staff who really need it earlier: "early request" with a date + reason (after the amount request) →
--     owner push → owner approves (that date becomes pay_date, holds ignored) or declines (stays as is).
alter table public.pr_13_ack add column if not exists moved_from date;
alter table public.pr_13_ack add column if not exists moved_at timestamptz;
alter table public.pr_13_ack add column if not exists early_date date;
alter table public.pr_13_ack add column if not exists early_reason text;
alter table public.pr_13_ack add column if not exists early_at timestamptz;
alter table public.pr_13_ack add column if not exists early_ok boolean;      -- null = waiting, true = approved, false = declined
alter table public.pr_13_ack add column if not exists early_decided_at timestamptz;

insert into public.pr_13_hold (day, note)
select d::date, '12월 중순 이후로 · 지출 많음 (사장님 11/18 밤)'
from generate_series('2026-11-19'::timestamp, '2026-12-18'::timestamp, interval '1 day') d
on conflict (day) do nothing;

update public.pr_13_ack a set moved_from = a.pay_date, moved_at = now(), pay_date = null, pay_date_at = null
where a.year = 2026 and a.pay_date is not null and a.pay_date < '2026-12-19'
  and not exists (select 1 from public.pr_thirteenth x where x.employee_id = a.employee_id and x.year = a.year)
  and a.recv_ok_at is null;

-- staff: ask for an earlier date with a reason
create or replace function public.pr_emp_early13(p_no text, p_pin text, p_year int, p_date date, p_reason text)
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
  if p_date is null or p_date <= td or p_date >= make_date(p_year, 12, 24) or coalesce(trim(p_reason), '') = '' then
    return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
  update public.pr_13_ack set early_date = p_date, early_reason = left(trim(p_reason), 300), early_at = now(), early_ok = null, early_decided_at = null
   where employee_id = e.id and year = p_year;
  begin perform public.pr_notify('🙏 13월급 일찍 받기 요청: ' || e.name || ' ' || to_char(p_date, 'MM/DD (Dy)') || ' · ' || left(trim(p_reason), 120) || ' — 요청 탭에서 승인/거절');
  exception when others then null; end;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.pr_emp_early13(text, text, int, date, text) from public;
grant execute on function public.pr_emp_early13(text, text, int, date, text) to anon, authenticated;

-- owner: approve (date → pay_date) or decline
create or replace function public.pr_13_early_decide(p_emp uuid, p_year int, p_ok boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare a public.pr_13_ack;
begin
  if not public.is_owner() then return jsonb_build_object('ok', false, 'err', 'owner_only'); end if;
  select * into a from public.pr_13_ack where employee_id = p_emp and year = p_year;
  if a.early_date is null then return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
  begin
    if p_ok then
      update public.pr_13_ack set pay_date = a.early_date, pay_date_at = now(), early_ok = true, early_decided_at = now() where employee_id = p_emp and year = p_year;
    else
      update public.pr_13_ack set early_ok = false, early_decided_at = now() where employee_id = p_emp and year = p_year;
    end if;
  exception when unique_violation then return jsonb_build_object('ok', false, 'err', 'taken');
  end;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.pr_13_early_decide(uuid, int, boolean) from public, anon;
grant execute on function public.pr_13_early_decide(uuid, int, boolean) to authenticated;

-- pr_emp_view: ack13 also returns moved_from / early_*
do $do$ declare d text := pg_get_functiondef('public.pr_emp_view(text,text)'::regprocedure); n text;
begin
  if position($a$'moved_from', a.moved_from$a$ in d) > 0 then return; end if;
  n := replace(d, $a$'recv_ask_at', a.recv_ask_at))$a$,
    $a$'recv_ask_at', a.recv_ask_at, 'moved_from', a.moved_from, 'early_date', a.early_date, 'early_reason', a.early_reason, 'early_at', a.early_at, 'early_ok', a.early_ok))$a$);
  if n = d then raise exception '13 early patch not applied'; end if;
  execute n;
end $do$;
