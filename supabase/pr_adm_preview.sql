-- Admin: preview the staff screen of one employee (owner 2026-11-14: "나도 직원용 화면 볼 수 있게해줘").
-- Owner only (is_owner()). Mints a throw-away device token, builds pr_emp_view with it, then deletes the token,
-- so the preview is read-only: any button the admin presses in the preview fails with a token error.
create or replace function public.pr_adm_emp_view(p_emp uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare e public.pr_employees; tok text := encode(gen_random_bytes(24), 'hex'); th text; v jsonb;
begin
  if not public.is_owner() then raise exception 'not allowed'; end if;
  select * into e from public.pr_employees where id = p_emp;
  if not found then return jsonb_build_object('ok', false, 'err', 'wrong'); end if;
  if e.pin_hash is null then return jsonb_build_object('ok', false, 'err', 'no_pin'); end if;
  th := encode(digest(tok, 'sha256'), 'hex');
  insert into public.pr_emp_sessions (token_hash, employee_id) values (th, e.id);
  begin
    v := public.pr_emp_view(e.emp_no, 'tok:' || tok);
  exception when others then
    delete from public.pr_emp_sessions where token_hash = th; raise;
  end;
  delete from public.pr_emp_sessions where token_hash = th;
  return v;
end $$;
revoke all on function public.pr_adm_emp_view(uuid) from public, anon;
grant execute on function public.pr_adm_emp_view(uuid) to authenticated;
