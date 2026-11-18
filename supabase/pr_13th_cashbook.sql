-- 13th month 지급됨 → 캐시북 자동 기록 (사장님 2026-11-09)
--  • 급여 앱 13th month 탭(또는 퇴사 정산)에서 "지급 기록" → pr_thirteenth (paid_on 있음) →
--    캐시북 entries 에 한 줄: kind staff · note salary · 받은 사람 = 직원 · 계정 = 지급 방법 · 날짜 = 지급일
--    details "13th month 2026" · staff_name 'Payroll'
--  • 캐시북에 이미 손으로 적은 같은 지급(급여/인센티브, 같은 금액, 현금=세이빙박스 같은 계정, 지급일 ±3일, 이름 앞 3글자)이 있으면
--    새로 안 만들고 그 줄에 연결.
--  • 자동 줄이 생긴 뒤 손으로 또 적으면 자동 줄을 지우고 손 줄에 연결 (중복 방지).
--  • "취소"(지급 기록 삭제) → 자동 줄 삭제, 손 줄은 연결만 풀림. 금액·날짜·방법 바꾸면 다시 맞춤.
alter table public.entries add column if not exists pr_thirteenth_id uuid references public.pr_thirteenth(id) on delete set null;
create index if not exists entries_pr_thirteenth_idx on public.entries(pr_thirteenth_id);

create or replace function public.pr_acct_grp(a text) returns text language sql immutable as $$
  select case when a in ('CASH', 'SAVINGBOX') then 'CASH' else a end $$;

create or replace function public.pr_13th_cashbook_sync(tid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare x public.pr_thirteenth; e public.pr_employees; via text; n int; hit uuid;
begin
  delete from public.entries where pr_thirteenth_id = tid and staff_name = 'Payroll';
  update public.entries set pr_thirteenth_id = null where pr_thirteenth_id = tid;
  select * into x from public.pr_thirteenth where id = tid;
  if not found or x.paid_on is null or coalesce(x.amount, 0) <= 0 then return; end if;
  select * into e from public.pr_employees where id = x.employee_id;
  via := coalesce(nullif(x.paid_via, ''), 'CASH');
  select count(*), min(t.id::text)::uuid into n, hit from public.entries t
   where t.kind = 'staff' and t.note in ('salary', 'incentive') and t.pr_thirteenth_id is null and t.pr_payroll_id is null
     and coalesce(t.staff_name, '') <> 'Payroll'
     and abs(t.amount - x.amount) < 0.01
     and public.pr_acct_grp(t.account) = public.pr_acct_grp(via)
     and t.biz_date between x.paid_on - 3 and x.paid_on + 3
     and public.pr_adv_name_key(t.vendor) = public.pr_adv_name_key(e.name);
  if n = 1 then
    update public.entries set pr_thirteenth_id = tid where id = hit;
    return;
  end if;
  insert into public.entries (biz_date, kind, amount, account, vendor, note, details, staff_name, pr_thirteenth_id)
  values (x.paid_on, 'staff', x.amount, via, e.name, 'salary',
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
     and new.employee_id is not distinct from old.employee_id then return new; end if;
  begin
    perform public.pr_13th_cashbook_sync(new.id);
  exception when others then raise warning '13th → cashbook 실패: %', sqlerrm;   -- 지급 기록 자체는 막지 않음
  end;
  return new;
end $$;
drop trigger if exists pr_13th_cashbook on public.pr_thirteenth;
create trigger pr_13th_cashbook after insert or update on public.pr_thirteenth
  for each row execute function public.pr_13th_cashbook_trg();
drop trigger if exists pr_13th_cashbook_del on public.pr_thirteenth;
create trigger pr_13th_cashbook_del before delete on public.pr_thirteenth
  for each row execute function public.pr_13th_cashbook_trg();

-- 캐시북에 손으로 같은 13th 지급을 또 적으면 → 자동 줄 삭제, 손 줄에 연결
create or replace function public.entries_13th_dedupe()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int; hit uuid; tid uuid;
begin
  if new.kind <> 'staff' or new.note not in ('salary', 'incentive') or new.pr_thirteenth_id is not null
     or coalesce(new.staff_name, '') = 'Payroll' then return new; end if;
  if exists (select 1 from public.entries where id = new.id and pr_payroll_id is not null) then return new; end if;  -- 급여에 연결된 줄
  select count(*), min(t.id::text)::uuid, min(t.pr_thirteenth_id::text)::uuid into n, hit, tid from public.entries t
   where t.staff_name = 'Payroll' and t.pr_thirteenth_id is not null and t.kind = 'staff'
     and abs(t.amount - new.amount) < 0.01 and public.pr_acct_grp(t.account) = public.pr_acct_grp(new.account)
     and t.biz_date between new.biz_date - 3 and new.biz_date + 3
     and public.pr_adv_name_key(t.vendor) = public.pr_adv_name_key(new.vendor);
  if n <> 1 then return new; end if;
  delete from public.entries where id = hit;
  update public.entries set pr_thirteenth_id = tid where id = new.id;
  return new;
end $$;
drop trigger if exists entries_th13_dedupe on public.entries;
create trigger entries_th13_dedupe after insert on public.entries
  for each row execute function public.entries_13th_dedupe();

-- 이미 지급 기록된 것 채우기 (적용 시 한 번)
do $$ declare r record; begin
  for r in select id from public.pr_thirteenth where paid_on is not null
           and not exists (select 1 from public.entries where pr_thirteenth_id = pr_thirteenth.id) loop
    perform public.pr_13th_cashbook_sync(r.id);
  end loop;
end $$;
