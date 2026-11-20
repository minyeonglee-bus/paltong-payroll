-- GCash · Maya 송금 수수료 (사장님 2026-11-21)
--  • 급여 앱: 지급 방법이 GCash·Maya면 "송금 수수료" 칸 → result.payout.parts[i].fee (급여), pr_thirteenth.fee / pr_13_part.fee (13th month)
--  • 캐시북: 직원 지출(staff)이 GCash·Maya면 수수료 칸 → entries.fee. 잔고에서 금액 + 수수료가 같이 빠짐 (이체 수수료와 같음)
--  • 직원 실수령·명세서는 그대로 (수수료는 가게가 냄). 수익 보고서에서는 이체 수수료와 같이 "이체·송금 수수료" 줄로.

-- 1) entries.fee: 이체 또는 GCash·Maya 직원 지출만
alter table public.entries drop constraint if exists entries_fee_check;
alter table public.entries add constraint entries_fee_check
  check (fee is null or (fee >= 0 and (kind = 'transfer' or (kind = 'staff' and account in ('GCASH', 'MAYA')))));

-- 2) 장부 잔고: staff 줄은 금액 + 수수료
create or replace function public.book_balance(p_date date, p_acct text)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare base_m text; base jsonb; start_d date; v numeric;
begin
  select month, bal into base_m, base from public.opening
   where month <= to_char(p_date, 'YYYY-MM') order by month desc limit 1;
  start_d := case when base_m is null then date '0001-01-01' else (base_m || '-01')::date end;
  select coalesce((base->>p_acct)::numeric, 0) + coalesce(sum(
           case
             when kind = 'sale'      and account = p_acct then amount
             when kind = 'expense'   and account = p_acct then -amount
             when kind = 'staff'     and account = p_acct then -(amount + coalesce(fee, 0))
             -- close day: normally cash → box; from_acct = 'SAVINGBOX' means box → cash (refill the float)
             when kind = 'savingbox' and p_acct = 'CASH'      then case when from_acct = 'SAVINGBOX' then amount else -amount end
             when kind = 'savingbox' and p_acct = 'SAVINGBOX' then case when from_acct = 'SAVINGBOX' then -amount else amount end
             when kind in ('transfer','adjust') then (case when to_acct = p_acct then amount else 0 end)
                                       - (case when from_acct = p_acct then amount + coalesce(fee, 0) else 0 end)
             else 0 end), 0)
    into v
    from public.entries where biz_date between start_d and p_date;
  return v;
end $$;

create or replace function public.book_at(p_date date, p_acct text, p_ts timestamptz)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare base_m text; base jsonb; start_d date; v numeric;
begin
  select month, bal into base_m, base from public.opening
   where month <= to_char(p_date, 'YYYY-MM') order by month desc limit 1;
  start_d := case when base_m is null then date '0001-01-01' else (base_m || '-01')::date end;
  select coalesce((base->>p_acct)::numeric, 0) + coalesce(sum(
           case
             when kind = 'sale' and account = p_acct then amount
             when kind = 'expense' and account = p_acct then -amount
             when kind = 'staff'   and account = p_acct then -(amount + coalesce(fee, 0))
             when kind = 'savingbox' and p_acct = 'CASH'      then case when from_acct = 'SAVINGBOX' then amount else -amount end
             when kind = 'savingbox' and p_acct = 'SAVINGBOX' then case when from_acct = 'SAVINGBOX' then -amount else amount end
             when kind in ('transfer','adjust') then (case when to_acct = p_acct then amount else 0 end)
                                                   - (case when from_acct = p_acct then amount + coalesce(fee, 0) else 0 end)
             else 0 end), 0)
    into v
    from public.entries
   where biz_date >= start_d and (biz_date < p_date or (biz_date = p_date and created_at <= p_ts));
  return v;
end $$;

-- 3) 급여 → 캐시북: 그 지급 줄의 수수료(payout.parts[i].fee)도 같이 (GCash·Maya일 때만)
create or replace function public.pr_cashbook_sync(pid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p public.pr_payrolls; e public.pr_employees; x record; hit uuid; bd date; prev date; f numeric;
begin
  select * into p from public.pr_payrolls where id = pid;
  if not found then return; end if;
  select min(biz_date) into prev from public.entries where pr_payroll_id = pid and staff_name = 'Payroll';
  delete from public.entries where pr_payroll_id = pid and staff_name = 'Payroll';
  update public.entries set pr_payroll_id = null, pr_part = null where pr_payroll_id = pid;
  if p.status <> 'paid' then return; end if;
  select * into e from public.pr_employees where id = p.employee_id;
  bd := public.pr_cb_bizdate(coalesce(p.paid_on, (now() at time zone 'Asia/Manila')::date));
  if prev is not null and p.paid_on is not null and prev between p.paid_on - 1 and p.paid_on then bd := prev; end if;
  for x in select * from public.pr_payout_parts(p) loop
    f := case when x.via in ('GCASH', 'MAYA')
              then nullif(round(coalesce((p.result->'payout'->'parts'->x.i->>'fee')::numeric, 0), 2), 0) end;
    if f < 0 then f := null; end if;
    select id into hit from public.entries
      where kind = 'staff' and note = 'salary' and pr_payroll_id is null and account = x.via
        and abs(amount - x.amount) < 0.01
        and biz_date between bd - 3 and bd + 3
      order by abs(biz_date - bd), created_at limit 1;
    if hit is not null then
      update public.entries set pr_payroll_id = pid, pr_part = x.i, fee = coalesce(f, fee) where id = hit;
    else
      insert into public.entries (biz_date, kind, amount, fee, account, vendor, note, details, staff_name, pr_payroll_id, pr_part)
      values (bd, 'staff', x.amount, f, x.via, e.name, 'salary',
              'Payroll ' || to_char(p.period_start, 'MM/DD') || '–' || to_char(p.period_end, 'MM/DD')
                || coalesce(' · ' || nullif(e.info->>'full_name', ''), ''),
              'Payroll', pid, x.i);
    end if;
  end loop;
end $$;

-- 캐시북에서 먼저 적은 급여 줄(수수료 포함)로 급여가 지급 완료되면 → 급여 앱 지급 칸에도 수수료
create or replace function public.entries_salary_to_payroll()
returns trigger language plpgsql security definer set search_path = public as $$
declare pid uuid; n int; grp text := case when new.account in ('CASH', 'SAVINGBOX') then 'CASH' else new.account end;
begin
  if new.kind <> 'staff' or new.note <> 'salary' or new.pr_payroll_id is not null or new.staff_name = 'Payroll' then return new; end if;
  select count(*), min(p.id::text)::uuid into n, pid from public.pr_payrolls p
   where p.status <> 'paid' and p.shared_at is not null
     and abs(coalesce((p.result->>'net')::numeric, 0) - new.amount) < 0.01
     and new.biz_date between p.period_end - 3 and p.period_end + 20
     and (select count(*) from public.pr_payout_parts(p)) = 1
     and (select case when via in ('CASH', 'SAVINGBOX') then 'CASH' else via end from public.pr_payout_parts(p) limit 1) = grp;
  if n <> 1 then return new; end if;
  update public.entries set pr_payroll_id = pid, pr_part = 0 where id = new.id;
  update public.pr_payrolls set status = 'paid', paid_on = new.biz_date, paid_via = new.account,
         result = case when coalesce(new.fee, 0) > 0 and new.account in ('GCASH', 'MAYA') and jsonb_typeof(result->'payout'->'parts') = 'array'
                       then jsonb_set(jsonb_set(jsonb_set(result, '{payout,via}', to_jsonb(new.account)), '{payout,fee}', to_jsonb(new.fee)),
                                      '{payout,parts,0}', (result->'payout'->'parts'->0) || jsonb_build_object('via', new.account, 'fee', new.fee))
                       else result end
   where id = pid;
  return new;
end $$;

-- 4) 13th month (전체 · 일부)
alter table public.pr_thirteenth add column if not exists fee numeric check (fee is null or fee >= 0);
alter table public.pr_13_part   add column if not exists fee numeric check (fee is null or fee >= 0);

create or replace function public.pr_13th_cashbook_sync(tid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare x public.pr_thirteenth; e public.pr_employees; via text; n int; hit uuid; f numeric;
begin
  delete from public.entries where pr_thirteenth_id = tid and staff_name = 'Payroll';
  update public.entries set pr_thirteenth_id = null where pr_thirteenth_id = tid;
  select * into x from public.pr_thirteenth where id = tid;
  if not found or x.paid_on is null or coalesce(x.amount, 0) <= 0 then return; end if;
  select * into e from public.pr_employees where id = x.employee_id;
  via := coalesce(nullif(x.paid_via, ''), 'CASH');
  f := case when via in ('GCASH', 'MAYA') then nullif(round(coalesce(x.fee, 0), 2), 0) end;
  select count(*), min(t.id::text)::uuid into n, hit from public.entries t
   where t.kind = 'staff' and t.note in ('salary', 'incentive') and t.pr_thirteenth_id is null and t.pr_payroll_id is null
     and coalesce(t.staff_name, '') <> 'Payroll'
     and abs(t.amount - x.amount) < 0.01
     and public.pr_acct_grp(t.account) = public.pr_acct_grp(via)
     and t.biz_date between x.paid_on - 3 and x.paid_on + 3
     and public.pr_adv_name_key(t.vendor) = public.pr_adv_name_key(e.name);
  if n = 1 then
    update public.entries set pr_thirteenth_id = tid, fee = case when account in ('GCASH', 'MAYA') then coalesce(f, fee) else fee end where id = hit;
    return;
  end if;
  insert into public.entries (biz_date, kind, amount, fee, account, vendor, note, details, staff_name, pr_thirteenth_id)
  values (x.paid_on, 'staff', x.amount, f, via, e.name, 'salary',
          '13th month ' || x.year || coalesce(' · ' || nullif(e.info->>'full_name', ''), ''), 'Payroll', tid);
end $$;

create or replace function public.pr_13th_cashbook_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    delete from public.entries where pr_thirteenth_id = old.id and staff_name = 'Payroll';
    return old;
  end if;
  if tg_op = 'UPDATE' and new.amount is not distinct from old.amount and new.paid_on is not distinct from old.paid_on
     and new.paid_via is not distinct from old.paid_via and new.year is not distinct from old.year
     and new.employee_id is not distinct from old.employee_id and new.fee is not distinct from old.fee then return new; end if;
  begin
    perform public.pr_13th_cashbook_sync(new.id);
  exception when others then raise warning '13th → cashbook 실패: %', sqlerrm;
  end;
  return new;
end $$;

create or replace function public.pr_13_part_cashbook_sync(pid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare x public.pr_13_part; e public.pr_employees; via text; n int; hit uuid; f numeric;
begin
  delete from public.entries where pr_13_part_id = pid and staff_name = 'Payroll';
  update public.entries set pr_13_part_id = null where pr_13_part_id = pid;
  select * into x from public.pr_13_part where id = pid;
  if not found then return; end if;
  select * into e from public.pr_employees where id = x.employee_id;
  via := coalesce(nullif(x.paid_via, ''), 'CASH');
  f := case when via in ('GCASH', 'MAYA') then nullif(round(coalesce(x.fee, 0), 2), 0) end;
  select count(*), min(t.id::text)::uuid into n, hit from public.entries t
   where t.kind = 'staff' and t.note in ('salary', 'incentive', 'advance') and t.pr_13_part_id is null
     and t.pr_thirteenth_id is null and t.pr_payroll_id is null and coalesce(t.staff_name, '') <> 'Payroll'
     and abs(t.amount - x.amount) < 0.01
     and public.pr_acct_grp(t.account) = public.pr_acct_grp(via)
     and t.biz_date between x.paid_on - 3 and x.paid_on + 3
     and public.pr_adv_name_key(t.vendor) = public.pr_adv_name_key(e.name);
  if n = 1 then update public.entries set pr_13_part_id = pid, fee = case when account in ('GCASH', 'MAYA') then coalesce(f, fee) else fee end where id = hit; return; end if;
  insert into public.entries (biz_date, kind, amount, fee, account, vendor, note, details, staff_name, pr_13_part_id)
  values (x.paid_on, 'staff', x.amount, f, via, e.name, 'salary',
          '13th month ' || x.year || ' · 일부 (partial)' || coalesce(' · ' || nullif(e.info->>'full_name', ''), ''), 'Payroll', pid);
end $$;
