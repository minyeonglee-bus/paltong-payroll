-- =========================================================
-- Paltong Payroll — tables inside the MONEY TRACKER (cash book) project
-- Safe to run more than once. Uses the cash book's logins (public.staff, public.is_owner()).
-- Payroll tables are prefixed pr_ so nothing in the cash book is touched.
-- =========================================================
create extension if not exists pgcrypto;

-- ---------- employees ----------
create table if not exists public.pr_employees (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  position    text not null default 'waiter',
  daily_rate  numeric(10,2) not null default 718,
  pay_type    text not null default 'daily',
  status      text not null default 'regular',
  hired_on    date,
  birthday    date,
  active      boolean not null default true,
  note        text,
  created_at  timestamptz not null default now()
);
alter table public.pr_employees add column if not exists monthly_rate      numeric(10,2) not null default 30000;  -- kitchen monthly (OT-inclusive)
alter table public.pr_employees add column if not exists allowance_per_day numeric(10,2) not null default 0;      -- rider motorcycle maintenance ₱100/duty day
alter table public.pr_employees add column if not exists weekly            jsonb not null default '{"basic":1500,"transport":400,"meal":100,"daysPerWeek":5,"hoursPerDay":4,"otRate":80,"extraRate":100,"advanceWeekly":500,"maxAdvance":5000}'::jsonb;
alter table public.pr_employees drop constraint if exists pr_employees_position_check;
alter table public.pr_employees add constraint pr_employees_position_check check (position in ('waiter','kitchen','rider','helper','other'));
alter table public.pr_employees drop constraint if exists pr_employees_pay_type_check;
alter table public.pr_employees add constraint pr_employees_pay_type_check check (pay_type in ('daily','monthly','weekly'));
alter table public.pr_employees drop constraint if exists pr_employees_status_check;
alter table public.pr_employees add constraint pr_employees_status_check check (status in ('regular','probationary','fixed','other'));

-- ---------- ledger: advances (가불), verified cash shortages (현금 부족분), bonuses (최고매출일·신메뉴), other ----------
create table if not exists public.pr_ledger (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.pr_employees(id) on delete cascade,
  kind         text not null,
  biz_date     date not null,
  amount       numeric(12,2) not null check (amount > 0),
  note         text,
  verified     boolean not null default true,     -- shortage: investigation done & responsibility established
  authorized   boolean not null default false,    -- written authorization on file
  payroll_id   uuid,                               -- set when applied to a payroll
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);
alter table public.pr_ledger drop constraint if exists pr_ledger_kind_check;
alter table public.pr_ledger add constraint pr_ledger_kind_check check (kind in ('advance','shortage','bonus','other'));
create index if not exists pr_ledger_emp_date on public.pr_ledger(employee_id, biz_date);

-- ---------- payroll periods ----------
create table if not exists public.pr_payrolls (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.pr_employees(id) on delete cascade,
  period_start  date not null,
  period_end    date not null,
  daily_rate    numeric(10,2) not null,
  break_hours   numeric(4,2) not null default 1,
  days          jsonb not null default '[]'::jsonb,   -- daily/monthly: [{date, shift, type}]  weekly: [{date, type, hours, ot}]
  late_minutes  integer not null default 0,
  incentive     numeric(12,2) not null default 0,
  other_deduction numeric(12,2) not null default 0,
  gov           jsonb not null default '{"sss":false,"philhealth":false,"pagibig":false,"share":0.5}'::jsonb,
  result        jsonb not null default '{}'::jsonb,   -- computePayroll output snapshot
  status        text not null default 'draft' check (status in ('draft','paid')),
  paid_on       date,
  paid_via      text,
  note          text,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (employee_id, period_start, period_end)
);
alter table public.pr_payrolls add column if not exists pay_type     text not null default 'daily';
alter table public.pr_payrolls add column if not exists monthly_rate numeric(10,2) not null default 0;
alter table public.pr_payrolls add column if not exists allowance_per_day numeric(10,2) not null default 0;
alter table public.pr_payrolls add column if not exists weekly       jsonb not null default '{}'::jsonb;
alter table public.pr_ledger drop constraint if exists pr_ledger_payroll_fk;
alter table public.pr_ledger add constraint pr_ledger_payroll_fk foreign key (payroll_id) references public.pr_payrolls(id) on delete set null;

create or replace function public.pr_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists pr_payrolls_touch on public.pr_payrolls;
create trigger pr_payrolls_touch before update on public.pr_payrolls for each row execute function public.pr_touch_updated_at();

-- a paid payroll is frozen: only the owner may change it
create or replace function public.pr_guard_paid_payroll() returns trigger language plpgsql as $$
begin
  if old.status = 'paid' and not public.is_owner() then raise exception 'PAID_LOCKED'; end if;
  return coalesce(new, old);
end $$;
drop trigger if exists pr_payrolls_guard on public.pr_payrolls;
create trigger pr_payrolls_guard before update or delete on public.pr_payrolls for each row execute function public.pr_guard_paid_payroll();

-- ---------- settings ----------
create table if not exists public.pr_settings (
  id            int primary key default 1 check (id = 1),
  min_wage      numeric(10,2) not null default 718,
  break_hours   numeric(4,2) not null default 1,
  sss_on        boolean not null default false,
  philhealth_on boolean not null default false,
  pagibig_on    boolean not null default false,
  gov_share     numeric(3,2) not null default 0.5,
  lang          text not null default 'ko'
);
alter table public.pr_settings add column if not exists rider_allowance numeric(10,2) not null default 100;
alter table public.pr_settings add column if not exists kitchen_monthly numeric(10,2) not null default 30000;
insert into public.pr_settings (id) values (1) on conflict do nothing;

-- ---------- RLS: owner (cash book admin) only — staff accounts cannot see pay data ----------
alter table public.pr_employees enable row level security;
alter table public.pr_ledger    enable row level security;
alter table public.pr_payrolls  enable row level security;
alter table public.pr_settings  enable row level security;

drop policy if exists pr_employees_read  on public.pr_employees; create policy pr_employees_read  on public.pr_employees for select using (public.is_owner());
drop policy if exists pr_employees_write on public.pr_employees; create policy pr_employees_write on public.pr_employees for all using (public.is_owner()) with check (public.is_owner());
drop policy if exists pr_ledger_read  on public.pr_ledger; create policy pr_ledger_read  on public.pr_ledger for select using (public.is_owner());
drop policy if exists pr_ledger_write on public.pr_ledger; create policy pr_ledger_write on public.pr_ledger for all using (public.is_owner()) with check (public.is_owner());
drop policy if exists pr_payrolls_read  on public.pr_payrolls; create policy pr_payrolls_read  on public.pr_payrolls for select using (public.is_owner());
drop policy if exists pr_payrolls_write on public.pr_payrolls; create policy pr_payrolls_write on public.pr_payrolls for all using (public.is_owner()) with check (public.is_owner());
drop policy if exists pr_settings_read  on public.pr_settings; create policy pr_settings_read  on public.pr_settings for select using (public.is_owner());
drop policy if exists pr_settings_write on public.pr_settings; create policy pr_settings_write on public.pr_settings for update using (public.is_owner()) with check (public.is_owner());

-- ---------- 직원 번호 + PIN (직원 본인 보기, 2026-10-16) ----------
-- 처음 PIN 0000 → 본인이 4~6자리로 재등록. 5번 틀리면 10분 잠김. 본인 급여(지급된 것)·가불·근무만 읽기 전용
alter table public.pr_employees add column if not exists emp_no text;
create unique index if not exists pr_employees_emp_no_uniq on public.pr_employees (emp_no) where emp_no is not null;
alter table public.pr_employees add column if not exists pin_hash text;
alter table public.pr_employees add column if not exists pin_fails int not null default 0;
alter table public.pr_employees add column if not exists pin_locked_until timestamptz;
-- 함수 pr_emp_check / pr_emp_view / pr_emp_set_pin / pr_emp_reset_pin 는 MONEY TRACKER 에 적용되어 있어요
-- (migrations: pr_employee_pin_portal, pr_emp_check_fix)

-- ---------- 캐시북 현금 부족 연동 (2026-10-16) ----------
-- checkpoints(중간마감/마감) 저장 때 센 현금 < 장부 → pr_cash_issues '확인 필요' (자동 공제 아님)
-- 관리자가 pr_cash_issue_assign 으로 책임 웨이터 지정 → pr_ledger 부족분(verified=false, authorized=false)
-- 급여 계산은 verified AND authorized 인 부족분만 공제
-- (migration: pr_cash_issues_from_cashbook)
