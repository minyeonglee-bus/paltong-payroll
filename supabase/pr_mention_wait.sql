-- Staff who picked a coworker (cover / relief / errand) see whether that coworker has confirmed yet
-- (owner 2026-11-14: "상대가 아직 확인 안 했으면 확인 요청한 직원 화면에 빨리 해달라고 요청하라고 띄워줘").
-- pr_emp_view: punches also return other (coworker name) / other_ack_at / other_ok.
do $do$ declare d text := pg_get_functiondef('public.pr_emp_view(text,text)'::regprocedure); n text;
begin
  n := replace(d, $a$'dev', x.dev_min, 'mode', x.mode) order by x.punched_at desc)$a$,
                  $b$'dev', x.dev_min, 'mode', x.mode, 'other', (select o.name from public.pr_employees o where o.id = x.other_emp), 'other_ack_at', x.other_ack_at, 'other_ok', x.other_ok) order by x.punched_at desc)$b$);
  if n = d then raise exception 'mention wait patch not applied'; end if;
  execute n;
end $do$;
