-- Certificate of Employment (COE) — owner 2026-11-09: "COE 발행하기 따로 넣어주고", "모든 서류 본인꺼 본인이 인쇄 및 저장 가능하게".
-- Staff issue their own COE in the staff app (Documents tab); the owner can issue one for anyone (Staff tab → employee).
-- Every issue gets a number (COE-YYYY-0001) and is logged here; the owner gets a push when staff issue one.
create table if not exists public.pr_coe (
  id bigserial primary key,
  employee_id uuid not null references public.pr_employees(id) on delete cascade,
  no text not null unique,
  purpose text not null,
  with_salary boolean not null default false,
  issued_by text not null default 'staff',        -- 'staff' | 'owner'
  issued_at timestamptz not null default now()
);
alter table public.pr_coe enable row level security;
drop policy if exists pr_coe_read on public.pr_coe; create policy pr_coe_read on public.pr_coe for select using (public.is_owner());

create or replace function public.pr_coe_new(p_emp uuid, p_purpose text, p_salary boolean, p_by text)
returns public.pr_coe language plpgsql security definer set search_path to 'public' as $$
declare r public.pr_coe; y text := to_char(now() at time zone 'Asia/Manila', 'YYYY'); n int;
begin
  perform pg_advisory_xact_lock(hashtext('pr_coe_no'));
  select count(*) + 1 into n from public.pr_coe where no like 'COE-' || y || '-%';
  insert into public.pr_coe (employee_id, no, purpose, with_salary, issued_by)
  values (p_emp, 'COE-' || y || '-' || lpad(n::text, 4, '0'), left(trim(p_purpose), 120), coalesce(p_salary, false), p_by) returning * into r;
  return r;
end $$;
revoke all on function public.pr_coe_new(uuid, text, boolean, text) from public, anon, authenticated;

-- staff (PIN)
create or replace function public.pr_emp_coe(p_no text, p_pin text, p_purpose text, p_salary boolean)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare c record; e public.pr_employees; r public.pr_coe;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  if c.must_change then return jsonb_build_object('ok', false, 'err', 'must_change'); end if;
  if coalesce(trim(p_purpose), '') = '' then return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
  select * into e from public.pr_employees where id = c.emp_id;
  r := public.pr_coe_new(e.id, p_purpose, p_salary, 'staff');
  begin perform public.pr_notify('📄 COE 발행: ' || e.name || ' · ' || r.purpose || case when r.with_salary then ' (급여 포함)' else '' end || ' · ' || r.no);
  exception when others then null; end;
  return jsonb_build_object('ok', true, 'no', r.no, 'issued_at', r.issued_at);
end $$;
revoke all on function public.pr_emp_coe(text, text, text, boolean) from public;
grant execute on function public.pr_emp_coe(text, text, text, boolean) to anon, authenticated;

-- owner
create or replace function public.pr_coe_issue(p_emp uuid, p_purpose text, p_salary boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r public.pr_coe;
begin
  if not public.is_owner() then raise exception 'permission denied'; end if;
  if coalesce(trim(p_purpose), '') = '' then return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
  r := public.pr_coe_new(p_emp, p_purpose, p_salary, 'owner');
  return jsonb_build_object('ok', true, 'no', r.no, 'issued_at', r.issued_at);
end $$;
revoke all on function public.pr_coe_issue(uuid, text, boolean) from public, anon;
grant execute on function public.pr_coe_issue(uuid, text, boolean) to authenticated;
