-- 13th month date picker: also list the days already taken (shown greyed "이미 선택됨 / taken"), owner 2026-11-13.
-- One person per day up to Dec 23 is still enforced by pr_13_free_days + unique index pr_13_ack_pay_date_one.
create or replace function public.pr_emp_days13(p_no text, p_pin text, p_year int)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare c record; td date := (now() at time zone 'Asia/Manila')::date;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  return jsonb_build_object('ok', true, 'days', to_jsonb(public.pr_13_free_days(c.emp_id, p_year)),
    'taken', coalesce((select jsonb_agg(d order by d) from (
        select a.pay_date d from public.pr_13_ack a where a.year = p_year and a.pay_date >= td and a.employee_id <> c.emp_id and not (extract(month from a.pay_date) = 12 and extract(day from a.pay_date) = 24)
        union select x.paid_on from public.pr_thirteenth x where x.year = p_year and x.paid_on >= td and x.employee_id <> c.emp_id
        union select hd.day from public.pr_13_hold hd where hd.day >= td) q), '[]'::jsonb));
end $$;
