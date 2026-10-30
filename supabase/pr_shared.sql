-- 급여 확정 · 직원 공개 (2026-10-30, migration pr_payroll_shared_to_staff 적용됨)
-- shared_at 이 있으면: 관리자 화면에서 금액이 고정되고(저장해도 재계산 안 함), 직원 본인 화면에 명세서가 그대로 보여요 ("확정 · 지급 예정").
-- pr_emp_view 는 status = 'paid' 또는 shared_at 이 있는 급여만 result·note 를 돌려줘요.
alter table public.pr_payrolls add column if not exists shared_at timestamptz;

-- 직원 확인 (2026-10-30, migrations pr_payroll_staff_ack · pr_emp_view_ack 적용됨)
-- 직원이 확정된 명세서를 열어 본 뒤 "확인했어요" → ack_at 기록 (pr_emp_ack). 확정 취소하면 ack_at 도 지워져요 (trigger pr_ack_reset).
alter table public.pr_payrolls add column if not exists ack_at timestamptz;
