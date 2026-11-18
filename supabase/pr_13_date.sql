-- 13th month pay date (owner 2026-11-11): Jonathan and Wilbert choose another date to receive it.
--   * pr_13_ack.date_ask_at set → staff Home shows a notice with the free dates (tomorrow .. Dec 24).
--   * one person per date up to Dec 24 (owner): a date is taken by another staff's pay_date, a 13th month already
--     paid that day (pr_thirteenth.paid_on), or a hold in pr_13_hold (11/17 = Erika's final 13th month).
--   * the staff picks → pr_13_ack.pay_date, owner push. They can change it until the 13th month is recorded as paid.
alter table public.pr_13_ack add column if not exists date_ask_at timestamptz;
alter table public.pr_13_ack add column if not exists pay_date date;
alter table public.pr_13_ack add column if not exists pay_date_at timestamptz;
create unique index if not exists pr_13_ack_pay_date_one on public.pr_13_ack (year, pay_date) where pay_date is not null;

create table if not exists public.pr_13_hold (day date primary key, note text, created_at timestamptz not null default now());
alter table public.pr_13_hold enable row level security;
drop policy if exists pr_13_hold_auth on public.pr_13_hold;
create policy pr_13_hold_auth on public.pr_13_hold for all to authenticated using (true) with check (true);
insert into public.pr_13_hold (day, note) values ('2026-11-17', 'Erika 13th month (final pay)') on conflict (day) do nothing;

-- free dates for one employee (their own current pick counts as free)
create or replace function public.pr_13_free_days(p_emp uuid, p_year int)
returns date[] language sql stable security definer set search_path to 'public' as $$
  select coalesce(array_agg(d::date order by d), '{}')
  from generate_series(((now() at time zone 'Asia/Manila')::date + 1)::timestamp, make_date(p_year, 12, 24)::timestamp, interval '1 day') d
  where not exists (select 1 from public.pr_13_ack a where a.year = p_year and a.pay_date = d::date and a.employee_id <> p_emp)
    and not exists (select 1 from public.pr_thirteenth x where x.year = p_year and x.paid_on = d::date and x.employee_id <> p_emp)
    and not exists (select 1 from public.pr_13_hold hd where hd.day = d::date);
$$;
revoke all on function public.pr_13_free_days(uuid, int) from public, anon, authenticated;

create or replace function public.pr_emp_days13(p_no text, p_pin text, p_year int)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare c record;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  return jsonb_build_object('ok', true, 'days', to_jsonb(public.pr_13_free_days(c.emp_id, p_year)));
end $$;
revoke all on function public.pr_emp_days13(text, text, int) from public;
grant execute on function public.pr_emp_days13(text, text, int) to anon, authenticated;

create or replace function public.pr_emp_date13(p_no text, p_pin text, p_year int, p_date date)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare c record; e public.pr_employees; a public.pr_13_ack; chg boolean;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  if c.must_change then return jsonb_build_object('ok', false, 'err', 'must_change'); end if;
  select * into e from public.pr_employees where id = c.emp_id;
  select * into a from public.pr_13_ack where employee_id = e.id and year = p_year;
  if a.employee_id is null or a.date_ask_at is null then return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
  if exists (select 1 from public.pr_thirteenth x where x.employee_id = e.id and x.year = p_year) then return jsonb_build_object('ok', false, 'err', 'paid'); end if;
  if p_date is null or not (p_date = any(public.pr_13_free_days(e.id, p_year))) then return jsonb_build_object('ok', false, 'err', 'taken'); end if;
  chg := a.pay_date is not null;
  begin
    update public.pr_13_ack set pay_date = p_date, pay_date_at = now() where employee_id = e.id and year = p_year;
  exception when unique_violation then return jsonb_build_object('ok', false, 'err', 'taken');
  end;
  begin perform public.pr_notify('📅 13월급 받을 날짜' || case when chg then ' 변경' else '' end || ': ' || e.name || ' ' || to_char(p_date, 'MM/DD (Dy)')
    || case when chg then ' (전 ' || to_char(a.pay_date, 'MM/DD') || ')' else '' end);
  exception when others then null; end;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.pr_emp_date13(text, text, int, date) from public;
grant execute on function public.pr_emp_date13(text, text, int, date) to anon, authenticated;

-- pr_emp_view: ack13 also returns date_ask_at / pay_date
do $do$ declare d text := pg_get_functiondef('public.pr_emp_view(text,text)'::regprocedure); n text;
begin
  if position($a$'date_ask_at', a.date_ask_at$a$ in d) > 0 then return; end if;
  n := replace(d, $a$'issue_note', a.issue_note))$a$, $a$'issue_note', a.issue_note, 'date_ask_at', a.date_ask_at, 'pay_date', a.pay_date))$a$);
  if n = d then raise exception '13 date patch not applied'; end if;
  execute n;
end $do$;

-- owner 2026-11-11: ask Jonathan and Wilbert for another date
update public.pr_13_ack a set date_ask_at = now()
  from public.pr_employees e where e.id = a.employee_id and a.year = 2026 and e.name in ('Jonathan', 'Wilbert') and a.date_ask_at is null;
