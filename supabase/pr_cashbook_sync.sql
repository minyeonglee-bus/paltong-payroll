-- Payroll ⇄ Cashbook salary sync
--  • Payroll marked paid (지급 완료)  → a "Staff · salary" row appears in the cashbook for each payout part
--    (or an existing hand-entered salary row with the same amount/method/date ±3 days is linked instead).
--  • Payroll un-paid (지급 취소)       → rows it created are removed, hand-entered rows are unlinked.
--  • Payout method changed after paid → re-synced.
--  • A salary row entered in the cashbook that matches exactly one finalized, unpaid payroll
--    (same net amount, same method — cash/saving box count as the same — paid within the period window)
--    marks that payroll as paid.
alter table public.entries add column if not exists pr_payroll_id uuid references public.pr_payrolls(id) on delete set null;
alter table public.entries add column if not exists pr_part int;
create index if not exists entries_pr_payroll_idx on public.entries(pr_payroll_id);

create or replace function public.pr_payout_parts(p public.pr_payrolls)
returns table(i int, via text, amount numeric) language sql stable as $$
  with parts as (
    select (ord - 1)::int i, x->>'via' via, (x->>'amount')::numeric amount
    from jsonb_array_elements(coalesce(p.result->'payout'->'parts', '[]'::jsonb)) with ordinality t(x, ord))
  select i, case when (select count(*) from parts) = 1 then coalesce(p.paid_via, via) else via end, amount from parts where amount > 0
  union all
  select 0, coalesce(p.paid_via, 'CASH'), coalesce((p.result->>'net')::numeric, 0)
  where not exists (select 1 from parts) and coalesce((p.result->>'net')::numeric, 0) > 0
$$;

create or replace function public.pr_cashbook_sync(pid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p public.pr_payrolls; e public.pr_employees; x record; hit uuid;
begin
  select * into p from public.pr_payrolls where id = pid;
  if not found then return; end if;
  -- clear current links (rows the payroll created are deleted, hand-entered rows are just unlinked)
  delete from public.entries where pr_payroll_id = pid and staff_name = 'Payroll';
  update public.entries set pr_payroll_id = null, pr_part = null where pr_payroll_id = pid;
  if p.status <> 'paid' then return; end if;
  select * into e from public.pr_employees where id = p.employee_id;
  for x in select * from public.pr_payout_parts(p) loop
    select id into hit from public.entries
      where kind = 'staff' and note = 'salary' and pr_payroll_id is null and account = x.via
        and abs(amount - x.amount) < 0.01
        and biz_date between coalesce(p.paid_on, current_date) - 3 and coalesce(p.paid_on, current_date) + 3
      order by abs(biz_date - coalesce(p.paid_on, current_date)), created_at limit 1;
    if hit is not null then
      update public.entries set pr_payroll_id = pid, pr_part = x.i where id = hit;
    else
      insert into public.entries (biz_date, kind, amount, account, vendor, note, details, staff_name, pr_payroll_id, pr_part)
      values (coalesce(p.paid_on, current_date), 'staff', x.amount, x.via, e.name, 'salary',
              'Payroll ' || to_char(p.period_start, 'MM/DD') || '–' || to_char(p.period_end, 'MM/DD')
                || coalesce(' · ' || nullif(e.info->>'full_name', ''), ''),
              'Payroll', pid, x.i);
    end if;
  end loop;
end $$;

create or replace function public.pr_payroll_cashbook_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 2 then return new; end if;
  if new.status is distinct from old.status
     or (new.status = 'paid' and (new.paid_on is distinct from old.paid_on or new.paid_via is distinct from old.paid_via
         or new.result->'payout' is distinct from old.result->'payout' or new.result->'net' is distinct from old.result->'net')) then
    -- payroll paid because a cashbook row was entered: that row is already linked, keep it
    if new.status = 'paid' and old.status <> 'paid'
       and exists (select 1 from public.entries where pr_payroll_id = new.id and staff_name is distinct from 'Payroll') then
      return new;
    end if;
    perform public.pr_cashbook_sync(new.id);
  end if;
  return new;
end $$;
create or replace trigger pr_payroll_cashbook after update on public.pr_payrolls
  for each row execute function public.pr_payroll_cashbook_trg();

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
  update public.pr_payrolls set status = 'paid', paid_on = new.biz_date, paid_via = new.account where id = pid;
  return new;
end $$;
create or replace trigger entries_salary_to_payroll after insert on public.entries
  for each row execute function public.entries_salary_to_payroll();
