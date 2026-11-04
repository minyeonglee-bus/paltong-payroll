-- Intro video (Tagalog) must be watched to the end and confirmed before the employee signs (owner 2026-11-04).
-- Order in the staff app: PIN → video + "Naintindihan ko" → signature (same as the contract, locked) → app.
alter table public.pr_employees add column if not exists intro_seen_at timestamptz;

create or replace function public.pr_emp_intro_done(p_no text, p_pin text)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare c record;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  if c.must_change then return jsonb_build_object('ok', false, 'err', 'must_change'); end if;
  update public.pr_employees set intro_seen_at = coalesce(intro_seen_at, now()) where id = c.emp_id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.pr_emp_intro_done(text, text) from public;
grant execute on function public.pr_emp_intro_done(text, text) to anon, authenticated;

-- signature only after the video
create or replace function public.pr_emp_set_signature(p_no text, p_pin text, p_image text)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare c record;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  if c.must_change then return jsonb_build_object('ok', false, 'err', 'must_change'); end if;
  if (select intro_seen_at from public.pr_employees where id = c.emp_id) is null then return jsonb_build_object('ok', false, 'err', 'need_intro'); end if;
  if p_image is null or p_image not like 'data:image/png;base64,%' or length(p_image) >= 300000 then return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
  insert into public.pr_signatures (employee_id, image) values (c.emp_id, p_image) on conflict (employee_id) do nothing;
  if not found then return jsonb_build_object('ok', false, 'err', 'sig_locked'); end if;
  return jsonb_build_object('ok', true);
end $$;

do $do$ declare d text := pg_get_functiondef('public.pr_emp_view(text,text)'::regprocedure); n text;
begin
  if position($a$'intro_seen_at'$a$ in d) > 0 then return; end if;
  n := replace(d, $a$'gov_fixed', e.gov_fixed)$a$, $a$'gov_fixed', e.gov_fixed, 'intro_seen_at', e.intro_seen_at)$a$);
  if n = d then raise exception 'intro patch not applied'; end if;
  execute n;
end $do$;
