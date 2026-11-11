-- 13th month pay date, owner 2026-11-11 18:46:
--   * Erika's date is 11/27 (not 11/17) → hold moved.
--   * Dec 24 = everyone not paid yet gets it together → no one-per-day limit on Dec 24 (always offered).
--     One person per day still applies to every other date.
delete from public.pr_13_hold where day = '2026-11-17';
insert into public.pr_13_hold (day, note) values ('2026-11-27', 'Erika 13th month (final pay)') on conflict (day) do update set note = excluded.note;

drop index if exists public.pr_13_ack_pay_date_one;
create unique index pr_13_ack_pay_date_one on public.pr_13_ack (year, pay_date)
  where pay_date is not null and not (extract(month from pay_date) = 12 and extract(day from pay_date) = 24);

create or replace function public.pr_13_free_days(p_emp uuid, p_year int)
returns date[] language sql stable security definer set search_path to 'public' as $$
  select coalesce(array_agg(d::date order by d), '{}')
  from generate_series(((now() at time zone 'Asia/Manila')::date + 1)::timestamp, make_date(p_year, 12, 24)::timestamp, interval '1 day') d
  where d::date = make_date(p_year, 12, 24)
     or (not exists (select 1 from public.pr_13_ack a where a.year = p_year and a.pay_date = d::date and a.employee_id <> p_emp)
         and not exists (select 1 from public.pr_thirteenth x where x.year = p_year and x.paid_on = d::date and x.employee_id <> p_emp)
         and not exists (select 1 from public.pr_13_hold hd where hd.day = d::date));
$$;
revoke all on function public.pr_13_free_days(uuid, int) from public, anon, authenticated;
