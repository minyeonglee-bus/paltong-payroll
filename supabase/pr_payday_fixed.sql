-- owner 2026-11-15: the 1st payroll always runs 1–15 and is paid on the 15th (never "11/01–11/14").
-- Paying it in the small hours (before the Cash Book's day cutoff) puts the cashbook row on the previous
-- business day, so the money leaves that night's cash count — the payroll itself still says paid on the 15th.

-- business day of a calendar date: today before the cutoff hour (settings.cutoff_hour, Manila time) → yesterday
create or replace function public.pr_cb_bizdate(d date)
returns date language sql stable as $$
  select case when d = (now() at time zone 'Asia/Manila')::date
               and extract(hour from now() at time zone 'Asia/Manila') < coalesce((select cutoff_hour from public.settings where id = 1), 8)
              then d - 1 else d end
$$;

-- 1st half: end = the 15th · paid: never before the period end
create or replace function public.pr_payroll_period_fix()
returns trigger language plpgsql as $$
begin
  if extract(day from new.period_start) = 1 then new.period_end := new.period_start + 14; end if;
  if new.status = 'paid' and new.paid_on is not null and new.paid_on < new.period_end then new.paid_on := new.period_end; end if;
  return new;
end $$;
drop trigger if exists pr_payrolls_aa_period on public.pr_payrolls;
create trigger pr_payrolls_aa_period before insert or update on public.pr_payrolls
  for each row execute function public.pr_payroll_period_fix();

create or replace function public.pr_cashbook_sync(pid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p public.pr_payrolls; e public.pr_employees; x record; hit uuid; bd date; prev date;
begin
  select * into p from public.pr_payrolls where id = pid;
  if not found then return; end if;
  select min(biz_date) into prev from public.entries where pr_payroll_id = pid and staff_name = 'Payroll';
  delete from public.entries where pr_payroll_id = pid and staff_name = 'Payroll';
  update public.entries set pr_payroll_id = null, pr_part = null where pr_payroll_id = pid;
  if p.status <> 'paid' then return; end if;
  select * into e from public.pr_employees where id = p.employee_id;
  bd := public.pr_cb_bizdate(coalesce(p.paid_on, (now() at time zone 'Asia/Manila')::date));
  -- re-sync after an edit: keep the business day the row was already on (night payment stays on the night's day)
  if prev is not null and p.paid_on is not null and prev between p.paid_on - 1 and p.paid_on then bd := prev; end if;
  for x in select * from public.pr_payout_parts(p) loop
    select id into hit from public.entries
      where kind = 'staff' and note = 'salary' and pr_payroll_id is null and account = x.via
        and abs(amount - x.amount) < 0.01
        and biz_date between bd - 3 and bd + 3
      order by abs(biz_date - bd), created_at limit 1;
    if hit is not null then
      update public.entries set pr_payroll_id = pid, pr_part = x.i where id = hit;
    else
      insert into public.entries (biz_date, kind, amount, account, vendor, note, details, staff_name, pr_payroll_id, pr_part)
      values (bd, 'staff', x.amount, x.via, e.name, 'salary',
              'Payroll ' || to_char(p.period_start, 'MM/DD') || '–' || to_char(p.period_end, 'MM/DD')
                || coalesce(' · ' || nullif(e.info->>'full_name', ''), ''),
              'Payroll', pid, x.i);
    end if;
  end loop;
end $$;

-- owner 2026-11-15: cashbook follows the payroll, also for payrolls already paid — re-sync every paid payroll
-- whose linked app-made cashbook rows differ (amount / method / missing part). Hand-entered history rows are not touched.
create or replace function public.pr_cashbook_reconcile()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select distinct p.id from public.pr_payrolls p
    where p.status = 'paid' and exists (select 1 from public.entries e where e.pr_payroll_id = p.id and e.staff_name = 'Payroll')
      and (exists (select 1 from public.pr_payout_parts(p) x
                   where not exists (select 1 from public.entries e where e.pr_payroll_id = p.id and e.pr_part = x.i
                                     and abs(e.amount - x.amount) < 0.01 and e.account = x.via))
           or exists (select 1 from public.entries e where e.pr_payroll_id = p.id
                      and not exists (select 1 from public.pr_payout_parts(p) x where x.i = e.pr_part)))
  loop perform public.pr_cashbook_sync(r.id); n := n + 1; end loop;
  return n;
end $$;
revoke execute on function public.pr_cashbook_reconcile() from public, anon, authenticated;
select public.pr_cashbook_reconcile();
