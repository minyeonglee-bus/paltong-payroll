-- 13th month: ask EVERY staff member not paid yet to choose the date (owner 2026-11-13 12:53)
--   · even if they already requested / chose → choose again (pay_date cleared)
--   · not chosen → Dec 24 (with everyone)
--   · today can be chosen too (owner pays the same day)
create or replace function public.pr_13_free_days(p_emp uuid, p_year int)
returns date[] language sql stable security definer set search_path to 'public' as $$
  select coalesce(array_agg(d::date order by d), '{}')
  from generate_series(((now() at time zone 'Asia/Manila')::date)::timestamp, make_date(p_year, 12, 24)::timestamp, interval '1 day') d
  where d::date = make_date(p_year, 12, 24)
     or (not exists (select 1 from public.pr_13_ack a where a.year = p_year and a.pay_date = d::date and a.employee_id <> p_emp)
         and not exists (select 1 from public.pr_thirteenth x where x.year = p_year and x.paid_on = d::date and x.employee_id <> p_emp)
         and not exists (select 1 from public.pr_13_hold hd where hd.day = d::date));
$$;
revoke all on function public.pr_13_free_days(uuid, int) from public, anon, authenticated;

-- existing rows (requested or not): choose again
update public.pr_13_ack a set date_ask_at = now(), pay_date = null, pay_date_at = null
 where a.year = 2026 and not exists (select 1 from public.pr_thirteenth x where x.employee_id = a.employee_id and x.year = a.year);
-- staff with no row yet: a row that only asks for the date (amount null = not confirmed / not requested)
insert into public.pr_13_ack (employee_id, year, ack_at, date_ask_at)
select e.id, 2026, now(), now() from public.pr_employees e
 where e.active and e.resigned_on is null and e.name <> 'test' and not coalesce((e.info->>'no_payroll')::boolean, false)
   and not exists (select 1 from public.pr_13_ack a where a.employee_id = e.id and a.year = 2026)
   and not exists (select 1 from public.pr_thirteenth x where x.employee_id = e.id and x.year = 2026);
