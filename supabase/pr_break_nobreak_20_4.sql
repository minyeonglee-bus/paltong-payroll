-- 2026-11-28 (owner): 20-4 shift (8h) and riders have NO meal break.
--   Riders were already 0 (pr_break_run, app breakFor). This adds the 20-4 shift:
--   pr_break_run → need 0 when the shift's plan (pr_plan) is 20-4, so no "no break although no customers" IR / no bonus.
--   Payroll (payroll-calc.js dayBreak) pays the full 8h for 20-4 days.
create or replace function public.pr_no_break_shift(p_emp uuid, p_in timestamptz)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.pr_plan p
    where p.employee_id = p_emp
      and p.day = ((p_in at time zone 'Asia/Manila') - interval '6 hours')::date
      and p.shift in ('20-4'));
$$;

do $m$
declare def text;
begin
  def := pg_get_functiondef('public.pr_break_run'::regproc);
  if position('pr_no_break_shift' in def) = 0 then
    def := replace(def, $a$need := case when e.position = 'rider' or base < 360 then 0$a$,
                        $a$need := case when e.position = 'rider' or base < 360 or public.pr_no_break_shift(e.id, lower(ses)) then 0$a$);
    if position('pr_no_break_shift' in def) = 0 then raise exception 'pr_break_run: need line not found'; end if;
    execute def;
  end if;
end $m$;
