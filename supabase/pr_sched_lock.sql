-- 확정된 스케줄 잠금 (사장님 2026-11-06)
-- pr_settings.sched_locked_through 까지의 날짜는 직원이 휴가를 신청할 수 없음 → 앱에 "관리자에게 문의하세요".
-- 휴가 재계획(tools/schedule/replan.py)도 이 날짜까지는 건드리지 않음.
alter table public.pr_settings add column if not exists sched_locked_through date;
update public.pr_settings set sched_locked_through = '2026-11-14' where id = 1 and (sched_locked_through is null or sched_locked_through < '2026-11-14');

do $do$ declare d text; n text; f text;
begin
  foreach f in array array['public.pr_emp_leave_request(text,text,text,date,date,text)', 'public.pr_emp_sil_request(text,text,date[],text)'] loop
    d := pg_get_functiondef(f::regprocedure);
    if position('sched_locked_through' in d) > 0 then continue; end if;
    n := replace(d, $a$if d <= td or d > td + 180 then$a$,
      $a$if d <= coalesce((select s.sched_locked_through from public.pr_settings s where s.id = 1), '-infinity'::date) and d > td then
      return jsonb_build_object('ok', false, 'err', 'locked', 'day', d); end if;
    if d <= td or d > td + 180 then$a$);
    if n = d then raise exception 'lock patch not applied: %', f; end if;
    execute n;
  end loop;
end $do$;
