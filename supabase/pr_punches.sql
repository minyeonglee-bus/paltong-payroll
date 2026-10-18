-- 직원 본인 출퇴근 (급여앱 직원 로그인에서 버튼) · 앱 기록이 근태 기준 (2026-10-19, migration pr_punches)
create table if not exists public.pr_punches (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.pr_employees(id) on delete cascade,
  kind        text not null check (kind in ('in','out')),
  punched_at  timestamptz not null default now(),
  source      text not null default 'app',   -- app = 직원이 버튼 · admin = 관리자가 입력/수정
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists pr_punches_emp_at on public.pr_punches (employee_id, punched_at);
alter table public.pr_punches enable row level security;
drop policy if exists pr_punches_owner on public.pr_punches;
create policy pr_punches_owner on public.pr_punches for all using (public.is_owner()) with check (public.is_owner());

-- 직원: 출근/퇴근 누르기 (직원번호 + PIN 확인) · 같은 종류 2분 안 중복은 무시
create or replace function public.pr_punch(p_no text, p_pin text, p_kind text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
declare c record; last_k text; last_at timestamptz; ts timestamptz := now();
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  if c.must_change then return jsonb_build_object('ok', false, 'err', 'must_change'); end if;
  if p_kind not in ('in','out') then return jsonb_build_object('ok', false, 'err', 'kind'); end if;
  select kind, punched_at into last_k, last_at from public.pr_punches where employee_id = c.emp_id order by punched_at desc limit 1;
  if last_k = p_kind and last_at > ts - interval '2 minutes' then return jsonb_build_object('ok', true, 'dup', true); end if;
  insert into public.pr_punches (employee_id, kind, punched_at, source) values (c.emp_id, p_kind, ts, 'app');
  return jsonb_build_object('ok', true, 'at', ts);
end $function$;
grant execute on function public.pr_punch(text, text, text) to anon, authenticated;

-- 직원 본인 보기에 최근 45일 출퇴근 포함
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
    'employee', jsonb_build_object('name', e.name, 'position', e.position, 'emp_no', e.emp_no, 'daily_rate', e.daily_rate, 'scheme', e.scheme,
                                   'pay_type', e.pay_type, 'monthly_rate', e.monthly_rate, 'allowance_per_day', e.allowance_per_day),
    'settings', (select jsonb_build_object('hours_per_day', hours_per_day, 'late_penalty', late_penalty, 'break_hours', break_hours) from public.pr_settings where id = 1),
    'punches', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'at', x.punched_at, 'source', x.source) order by x.punched_at desc)
      from public.pr_punches x where x.employee_id = e.id and x.punched_at > now() - interval '45 days'), '[]'::jsonb),
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
