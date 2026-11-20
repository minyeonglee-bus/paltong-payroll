-- Gov contributions waiver notice (owner 2026-11-20 22:45, app.js NOTICES "2026-11-20-govwaiver").
-- Staff choose only: ✅ agree  or  📄 "I will hand in my documents and register" (counted in disagree_n).
-- 3+ times documents-instead-of-agree → app says "documents required by 11/30".
-- After 11/30, not agreed and no documents → pr_gov_cut() lists them; the weekly plan / daily re-plan
-- (tools/schedule) give them "fewer" (work as few days as possible) from 12/1. The app shows one last notice, then no popups.
-- Owner presses "📄 서류 받음" (pr_notice_docs) → docs_at set → popup and schedule cut stop.
alter table public.pr_notice_ack add column if not exists docs_at timestamptz;

create or replace function public.pr_emp_notice_get(p_no text, p_pin text)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare c record;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  return jsonb_build_object('ok', true, 'acks', coalesce((select jsonb_agg(jsonb_build_object('notice_id', notice_id, 'agreed_at', agreed_at, 'disagree_n', disagree_n, 'docs_at', docs_at))
    from public.pr_notice_ack where employee_id = c.emp_id), '[]'::jsonb));
end $$;
revoke all on function public.pr_emp_notice_get(text, text) from public;
grant execute on function public.pr_emp_notice_get(text, text) to anon, authenticated;

-- owner: documents handed in (or undo)
create or replace function public.pr_notice_docs(p_emp uuid, p_notice text, p_on boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'not allowed'; end if;
  if coalesce(p_notice, '') = '' or length(p_notice) > 60 then return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
  insert into public.pr_notice_ack (employee_id, notice_id, docs_at) values (p_emp, p_notice, case when p_on then now() end)
    on conflict (employee_id, notice_id) do update set docs_at = case when p_on then now() end;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.pr_notice_docs(uuid, text, boolean) from public;
grant execute on function public.pr_notice_docs(uuid, text, boolean) to authenticated;

-- schedule: names to plan as few days as possible (empty until the deadline has passed).
-- Keep the emp_no list and the deadline in step with app.js NOTICES "2026-11-20-govwaiver".
create or replace function public.pr_gov_cut()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(e.name order by e.name), '[]'::jsonb)
  from public.pr_employees e
  left join public.pr_notice_ack a on a.employee_id = e.id and a.notice_id = '2026-11-20-govwaiver'
  where e.resigned_on is null and e.emp_no = any (array['00010', '00012', '00009', '00005', '00002', '00011'])
    and a.agreed_at is null and a.docs_at is null
    and (now() at time zone 'Asia/Manila')::date > date '2026-11-30';
$$;
revoke all on function public.pr_gov_cut() from public, anon, authenticated;
