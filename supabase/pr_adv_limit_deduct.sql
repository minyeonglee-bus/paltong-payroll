-- Advance limit also takes off what will be deducted from that cutoff (owner 2026-11-04):
--   cutoff pay − (advances already taken + verified/authorized shortages + other deductions
--                 + late deductions so far (+ same-amount penalty on the paper scheme) + half the fixed monthly statutory contributions)
create or replace function public.pr_adv_limit(p_emp uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare e public.pr_employees; st public.pr_settings; td date := (now() at time zone 'Asia/Manila')::date; s date; f date; w0 date; n int;
  pay numeric; adv numeric; shortage numeric; other numeric; late_min numeric; per_min numeric; late numeric; gov numeric; ded numeric;
begin
  select * into e from public.pr_employees where id = p_emp;
  select * into st from public.pr_settings where id = 1;
  if extract(day from td) = 31 then td := td + 1; end if;
  if extract(day from td) <= 15 then
    s := date_trunc('month', td)::date; f := s + 14;
    w0 := case when extract(day from s - 1) = 31 then s - 1 else s end;
  else
    s := date_trunc('month', td)::date + 15; f := least(s + 14, (date_trunc('month', td) + interval '1 month - 1 day')::date); w0 := s;
  end if;
  select count(*) into n from (
    select q.day, q.shift from public.pr_plan q where q.employee_id = p_emp and q.shift is not null and q.day between s and f
    union all
    select x.day, x.shift from public.shifts x where lower(trim(x.staff_name)) = lower(trim(e.name)) and x.day between s and f
      and not exists (select 1 from public.pr_plan q where q.employee_id = p_emp and q.day = x.day and q.shift is not null)) u
  where u.shift <> 'off';
  pay := case when e.pay_type = 'monthly' then round(coalesce(e.monthly_rate, 0) / 2, 2) else round(coalesce(e.daily_rate, 0) * n, 2) end;
  select coalesce(sum(amount) filter (where kind = 'advance'), 0),
         coalesce(sum(amount) filter (where kind = 'shortage' and verified and authorized), 0),
         coalesce(sum(amount) filter (where kind = 'other'), 0)
    into adv, shortage, other
    from public.pr_ledger where employee_id = p_emp and biz_date between w0 and f;
  select coalesce(sum(greatest(x.dev_min, 0)), 0) into late_min from public.pr_punches x
   where x.employee_id = p_emp and x.kind = 'in' and x.status <> 'void' and coalesce(x.dev_min, 0) > 0
     and (x.punched_at at time zone 'Asia/Manila')::date between s and f;
  per_min := case when e.pay_type = 'monthly' then coalesce(st.monthly_basic, 25945) * 12 / 313 / 8 / 60
                  when e.scheme = 'paper' then coalesce(e.daily_rate, 0) / 600
                  else coalesce(e.daily_rate, 0) / 480 end;
  late := round(late_min * per_min * case when e.scheme = 'paper' and coalesce(st.late_penalty, true) and e.pay_type <> 'monthly' then 2 else 1 end, 2);
  gov := round((coalesce((e.gov_fixed->>'sss')::numeric, 0) + coalesce((e.gov_fixed->>'philhealth')::numeric, 0) + coalesce((e.gov_fixed->>'pagibig')::numeric, 0)) / 2, 2);
  ded := shortage + other + late + gov;
  return jsonb_build_object('start', s, 'end', f, 'days', n, 'pay', pay, 'used', adv, 'shortage', shortage, 'other', other, 'late', late, 'late_min', late_min, 'gov', gov,
    'limit', greatest(pay - ded, 0), 'left', greatest(pay - ded - adv, 0));
end $$;
revoke all on function public.pr_adv_limit(uuid) from public, anon, authenticated;
