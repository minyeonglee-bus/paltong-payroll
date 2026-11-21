-- 13th month parts paid earlier → staff see them; owner "received" list shows them (owner 2026-11-21, June got ₱9,000 first)
-- 1) pr_emp_view: add 'parts13'  2) pr_recv_list: add 'part' (sum paid earlier) to each 13th row
--    3) pr_emp_recv: push shows the rest after parts
do $$
declare f text;
begin
  f := pg_get_functiondef('public.pr_emp_view(text,text)'::regprocedure);
  if position('''parts13''' in f) = 0 then
    f := replace(f, '''mgr_sig'', (select',
      '''parts13'', coalesce((select jsonb_agg(jsonb_build_object(''year'', q.year, ''amount'', q.amount, ''paid_on'', q.paid_on, ''paid_via'', q.paid_via) order by q.paid_on)
      from public.pr_13_part q where q.employee_id = e.id), ''[]''::jsonb),
    ''mgr_sig'', (select');
    execute f;
  end if;

  f := pg_get_functiondef('public.pr_recv_list()'::regprocedure);
  if position('''part''' in f) = 0 then
    f := replace(f, '''paid'', x.paid_on is not null)',
      '''paid'', x.paid_on is not null, ''part'', (select coalesce(sum(q.amount), 0) from public.pr_13_part q where q.employee_id = a.employee_id and q.year = a.year and x.paid_on is null))');
    execute f;
  end if;

  f := pg_get_functiondef('public.pr_emp_recv(text,text,text,text,text)'::regprocedure);
  if position('pr_13_part' in f) = 0 then
    f := replace(f, 'amt := coalesce(x.amount, a.amount, 0);',
      'amt := coalesce(x.amount, a.amount - coalesce((select sum(q.amount) from public.pr_13_part q where q.employee_id = e.id and q.year = yr), 0), 0);');
    execute f;
  end if;
end $$;
