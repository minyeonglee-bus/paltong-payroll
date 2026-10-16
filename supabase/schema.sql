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
alter table public.pr_employees drop constraint if exists pr_employees_position_check;
alter table public.pr_employees add constraint pr_employees_position_check check (position in ('waiter','kitchen','rider','other'));
alter table public.pr_employees drop constraint if exists pr_employees_pay_type_check;
alter table public.pr_employees add constraint pr_employees_pay_type_check check (pay_type in ('daily','monthly'));
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
  days          jsonb not null default '[]'::jsonb,   -- [{date, shift, type}]
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

-- ---------- 직원 본인 보기 RPC: 급여 형태·월급·정비비 포함 (2026-10-16, migration pr_emp_view_pay_fields 적용됨) ----------
-- pr_emp_view 가 employee 에 pay_type, monthly_rate, allowance_per_day 를 돌려줘서 직원 화면의 예상 계산기가 같은 식으로 계산해요.

-- ---------- 초과근무 배율 설정 + 타임카드 시간 입력 (2026-10-16, migration pr_ot_multiplier_and_rates 적용됨) ----------
alter table public.pr_settings add column if not exists ot_multiplier numeric(4,2) not null default 1.25;  -- 1.25 = 계약·DOLE, 1.0 = 시급 그대로
-- pr_emp_view 는 'settings' {ot_multiplier, break_hours} 도 돌려줘요
alter table public.pr_settings add column if not exists nd_on boolean not null default true;  -- 야간근무 가산 지급 여부

-- ---------- 13월급 (2026-10-16) · 아직 적용 안 됐으면 이 블록을 SQL Editor에서 실행 ----------
-- 13월급 = 그 해에 받은 기본급 합계 ÷ 12 (1년 미만 비례) · 12월 24일 이전 지급
-- 기본급에서 제외: 초과·야간·휴일 할증·정비비·보너스 (DOLE)
alter table public.pr_employees add column if not exists basic_before_app numeric(12,2) not null default 0;  -- 앱 쓰기 전 올해 받은 기본급 (손으로 입력)
alter table public.pr_employees add column if not exists basic_before_year int;
create table if not exists public.pr_thirteenth (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.pr_employees(id) on delete cascade,
  year        int not null,
  basic_total numeric(12,2) not null,
  amount      numeric(12,2) not null,
  paid_on     date,
  paid_via    text,
  note        text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  unique (employee_id, year)
);
alter table public.pr_thirteenth enable row level security;
drop policy if exists pr_thirteenth_read  on public.pr_thirteenth; create policy pr_thirteenth_read  on public.pr_thirteenth for select using (public.is_owner());
drop policy if exists pr_thirteenth_write on public.pr_thirteenth; create policy pr_thirteenth_write on public.pr_thirteenth for all using (public.is_owner()) with check (public.is_owner());
-- pr_emp_view 에 'thirteenth' 배열 추가 (직원 본인 보기)
CREATE OR REPLACE FUNCTION public.pr_emp_view(p_no text, p_pin text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
declare c record; e public.pr_employees;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  select * into e from public.pr_employees where id = c.emp_id;
  if c.must_change then return jsonb_build_object('ok', true, 'must_change', true, 'name', e.name); end if;
  return jsonb_build_object('ok', true, 'must_change', false,
    'employee', jsonb_build_object('name', e.name, 'position', e.position, 'emp_no', e.emp_no, 'daily_rate', e.daily_rate,
                                   'pay_type', e.pay_type, 'monthly_rate', e.monthly_rate, 'allowance_per_day', e.allowance_per_day),
    'settings', (select jsonb_build_object('ot_multiplier', ot_multiplier, 'break_hours', break_hours, 'nd_on', nd_on) from public.pr_settings where id = 1),
    'payrolls', coalesce((select jsonb_agg(jsonb_build_object('period_start', p.period_start, 'period_end', p.period_end, 'status', p.status,
        'paid_on', p.paid_on, 'paid_via', p.paid_via, 'daily_rate', p.daily_rate, 'pay_type', p.pay_type, 'monthly_rate', p.monthly_rate, 'days', p.days,
        'result', case when p.status = 'paid' then p.result end) order by p.period_start desc)
      from public.pr_payrolls p where p.employee_id = e.id), '[]'::jsonb),
    'ledger', coalesce((select jsonb_agg(jsonb_build_object('kind', l.kind, 'biz_date', l.biz_date, 'amount', l.amount, 'note', l.note,
        'verified', l.verified, 'deducted', l.payroll_id is not null) order by l.biz_date desc)
      from public.pr_ledger l where l.employee_id = e.id), '[]'::jsonb),
    'thirteenth', coalesce((select jsonb_agg(jsonb_build_object('year', x.year, 'basic_total', x.basic_total, 'amount', x.amount, 'paid_on', x.paid_on, 'paid_via', x.paid_via) order by x.year desc)
      from public.pr_thirteenth x where x.employee_id = e.id), '[]'::jsonb));
end $function$;
