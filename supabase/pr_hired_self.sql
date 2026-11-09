-- Staff re-enter their own date hired once (owner 2026-11-09: "입사일 정확히 다시 적으라고 창 한번").
-- Used for the 13th month rule (under 1 year → ÷12, 1 year+ → monthly average).
-- Staff app: after PIN → video → signature, a one-time screen asks for the date hired. Once saved it is locked
-- for the employee (only the owner can change it in the Staff tab). The old value is kept in hired_prev and the owner gets a push.
alter table public.pr_employees add column if not exists hired_self_at timestamptz;
alter table public.pr_employees add column if not exists hired_prev date;

create or replace function public.pr_emp_set_hired(p_no text, p_pin text, p_date date)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare c record; e public.pr_employees; td date := (now() at time zone 'Asia/Manila')::date;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  if c.must_change then return jsonb_build_object('ok', false, 'err', 'must_change'); end if;
  if p_date is null or p_date < date '2000-01-01' or p_date > td then return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
  select * into e from public.pr_employees where id = c.emp_id;
  if e.hired_self_at is not null then return jsonb_build_object('ok', false, 'err', 'hired_locked'); end if;
  update public.pr_employees set hired_prev = hired_on, hired_on = p_date, hired_self_at = now()
   where id = c.emp_id and hired_self_at is null;
  if not found then return jsonb_build_object('ok', false, 'err', 'hired_locked'); end if;
  begin
    perform public.pr_notify('📅 입사일 입력: ' || e.name || ' ' || to_char(p_date, 'YYYY-MM-DD')
      || case when e.hired_on is null then ' (전: 없음)' when e.hired_on <> p_date then ' (전: ' || to_char(e.hired_on, 'YYYY-MM-DD') || ')' else ' (같음)' end);
  exception when others then null; end;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.pr_emp_set_hired(text, text, date) from public;
grant execute on function public.pr_emp_set_hired(text, text, date) to anon, authenticated;

-- pr_emp_view: also return hired_self_at (shows the one-time screen until it is set)
do $do$ declare d text := pg_get_functiondef('public.pr_emp_view(text,text)'::regprocedure); n text;
begin
  if position($a$'hired_self_at'$a$ in d) > 0 then return; end if;
  n := replace(d, $a$'intro_seen_at', e.intro_seen_at)$a$, $a$'intro_seen_at', e.intro_seen_at, 'hired_self_at', e.hired_self_at)$a$);
  if n = d then raise exception 'hired patch not applied'; end if;
  execute n;
end $do$;
