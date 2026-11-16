-- SIL only after 1 year of service (owner 2026-11-17: "일년미만은 SIL 삭제", Labor Code Art. 95).
-- Under 1 year (hired_on + 1 year > today, Manila) → allowance 0, so the app shows 0 left and SIL requests are refused
-- (pr_emp_leave_request / pr_emp_sil_request check pr_sil_left). From the 1-year anniversary the normal allowance applies
-- automatically. No date hired → treated as eligible (owner sets it in the Staff tab). Monthly perfect-attendance leave (MPV,
-- contract §3.2) is separate and not affected. pr_sil rows are kept (ignored while under 1 year).
create or replace function public.pr_sil_under1y(p_emp uuid) returns date language sql stable security definer set search_path to 'public' as $$
  select (hired_on + interval '1 year')::date from public.pr_employees
   where id = p_emp and hired_on is not null and (hired_on + interval '1 year')::date > (now() at time zone 'Asia/Manila')::date
$$;
revoke all on function public.pr_sil_under1y(uuid) from public, anon;

do $do$ declare d text := pg_get_functiondef('public.pr_sil_summary(uuid,integer)'::regprocedure); n text;
begin
  if position('pr_sil_under1y' in d) > 0 then return; end if;
  n := replace(d, $a$'allowance', coalesce(a.allowance, 5)$a$,
    $a$'allowance', case when public.pr_sil_under1y(p_emp) is not null then 0 else coalesce(a.allowance, 5) end, 'sil_from', public.pr_sil_under1y(p_emp)$a$);
  if n = d then raise exception 'sil 1-year patch not applied'; end if;
  execute n;
end $do$;
