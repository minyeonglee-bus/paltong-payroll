-- 13th month 일부 먼저 지급 기록 (사장님 2026-11-20, June)
--  • pr_thirteenth 는 직원·연도당 한 줄(최종 지급)이라, 먼저 준 일부는 이 표에 따로 적음 (여러 번 가능).
--  • 13월급 탭에서 "일부 지급" → 금액·날짜·방법·메모. 최종 "지급 기록" 때 기본 금액 = 전체 − 먼저 준 합계.
--  • 캐시북 직원 지출(salary)에 자동 한 줄 "13th month 2026 · 일부" (입력자 Payroll). 손으로 적은 같은 줄
--    (같은 금액·계정·±3일·이름 앞 3글자)이 있으면 새로 안 만들고 연결. 삭제하면 자동 줄도 삭제.
create table if not exists public.pr_13_part (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.pr_employees(id) on delete cascade,
  year int not null,
  amount numeric(12,2) not null check (amount > 0),
  paid_on date not null,
  paid_via text not null default 'CASH',
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists pr_13_part_emp_year on public.pr_13_part(employee_id, year);
alter table public.pr_13_part enable row level security;
drop policy if exists pr_13_part_owner on public.pr_13_part;
create policy pr_13_part_owner on public.pr_13_part for all using (public.is_owner()) with check (public.is_owner());

alter table public.entries add column if not exists pr_13_part_id uuid references public.pr_13_part(id) on delete set null;
create index if not exists entries_pr_13_part_idx on public.entries(pr_13_part_id);

create or replace function public.pr_13_part_cashbook_sync(pid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare x public.pr_13_part; e public.pr_employees; via text; n int; hit uuid;
begin
  delete from public.entries where pr_13_part_id = pid and staff_name = 'Payroll';
  update public.entries set pr_13_part_id = null where pr_13_part_id = pid;
  select * into x from public.pr_13_part where id = pid;
  if not found then return; end if;
  select * into e from public.pr_employees where id = x.employee_id;
  via := coalesce(nullif(x.paid_via, ''), 'CASH');
  select count(*), min(t.id::text)::uuid into n, hit from public.entries t
   where t.kind = 'staff' and t.note in ('salary', 'incentive', 'advance') and t.pr_13_part_id is null
     and t.pr_thirteenth_id is null and t.pr_payroll_id is null and coalesce(t.staff_name, '') <> 'Payroll'
     and abs(t.amount - x.amount) < 0.01
     and public.pr_acct_grp(t.account) = public.pr_acct_grp(via)
     and t.biz_date between x.paid_on - 3 and x.paid_on + 3
     and public.pr_adv_name_key(t.vendor) = public.pr_adv_name_key(e.name);
  if n = 1 then update public.entries set pr_13_part_id = pid where id = hit; return; end if;
  insert into public.entries (biz_date, kind, amount, account, vendor, note, details, staff_name, pr_13_part_id)
  values (x.paid_on, 'staff', x.amount, via, e.name, 'salary',
          '13th month ' || x.year || ' · 일부 (partial)' || coalesce(' · ' || nullif(e.info->>'full_name', ''), ''), 'Payroll', pid);
end $$;

create or replace function public.pr_13_part_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    delete from public.entries where pr_13_part_id = old.id and staff_name = 'Payroll';
    return old;
  end if;
  begin
    perform public.pr_13_part_cashbook_sync(new.id);
  exception when others then raise warning '13th 일부 → cashbook 실패: %', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists pr_13_part_cb on public.pr_13_part;
create trigger pr_13_part_cb after insert or update on public.pr_13_part
  for each row execute function public.pr_13_part_trg();
drop trigger if exists pr_13_part_cb_del on public.pr_13_part;
create trigger pr_13_part_cb_del before delete on public.pr_13_part
  for each row execute function public.pr_13_part_trg();
