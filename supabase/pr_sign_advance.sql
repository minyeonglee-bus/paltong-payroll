-- Employee signature (drawn once in the staff app) + staff cash-advance requests (auto-approved).
-- The signature is printed on: explanation letters / confirmations, cash-advance slips,
-- and payslips the employee has confirmed (ack). Staff cannot change it; the owner can reset it.

create table if not exists public.pr_signatures (
  employee_id uuid primary key references public.pr_employees(id) on delete cascade,
  image text not null check (image like 'data:image/png;base64,%' and length(image) < 300000),
  signed_at timestamptz not null default now()
);
alter table public.pr_signatures enable row level security;
drop policy if exists pr_sig_read on public.pr_signatures; create policy pr_sig_read on public.pr_signatures for select using (public.is_owner());
drop policy if exists pr_sig_del  on public.pr_signatures; create policy pr_sig_del  on public.pr_signatures for delete using (public.is_owner());

create or replace function public.pr_emp_set_signature(p_no text, p_pin text, p_image text)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare c record;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  if c.must_change then return jsonb_build_object('ok', false, 'err', 'must_change'); end if;
  if p_image is null or p_image not like 'data:image/png;base64,%' or length(p_image) >= 300000 then return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
  insert into public.pr_signatures (employee_id, image) values (c.emp_id, p_image) on conflict (employee_id) do nothing;
  if not found then return jsonb_build_object('ok', false, 'err', 'sig_locked'); end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.pr_emp_set_signature(text, text, text) from public;
grant execute on function public.pr_emp_set_signature(text, text, text) to anon, authenticated;

-- cash advance requested by the employee in the app: recorded at once (auto-approved), deducted from the payroll of that date
alter table public.pr_ledger add column if not exists self_req_at timestamptz;

create or replace function public.pr_emp_advance(p_no text, p_pin text, p_amount numeric, p_reason text)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare c record; rid uuid; r text := left(trim(coalesce(p_reason, '')), 200);
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  if c.must_change then return jsonb_build_object('ok', false, 'err', 'must_change'); end if;
  if not exists (select 1 from public.pr_signatures where employee_id = c.emp_id) then return jsonb_build_object('ok', false, 'err', 'need_sig'); end if;
  if p_amount is null or p_amount < 1 or p_amount > 100000 or p_amount <> round(p_amount, 2) then return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
  insert into public.pr_ledger (employee_id, kind, biz_date, amount, note, note_en, verified, authorized, self_req_at, created_by)
  values (c.emp_id, 'advance', (now() at time zone 'Asia/Manila')::date, p_amount,
          '📱 가불 신청 (자동 승인)' || case when r <> '' then ' · ' || r else '' end,
          '📱 Advance request (auto-approved)' || case when r <> '' then ' · ' || r else '' end,
          true, true, now(), null)
  returning id into rid;
  return jsonb_build_object('ok', true, 'id', rid);
end $$;
revoke all on function public.pr_emp_advance(text, text, numeric, text) from public;
grant execute on function public.pr_emp_advance(text, text, numeric, text) to anon, authenticated;

-- pr_emp_view: add own signature + ledger id / request time
do $do$ declare d text := pg_get_functiondef('public.pr_emp_view(text,text)'::regprocedure); n text;
begin
  n := replace(d, $a$'ledger', coalesce((select jsonb_agg(jsonb_build_object('kind', l.kind,$a$,
                  $a$'ledger', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'self_req_at', l.self_req_at, 'created_at', l.created_at, 'kind', l.kind,$a$);
  if n = d then raise exception 'ledger patch not applied'; end if;
  d := n;
  n := replace(d, $a$'sil_bal',$a$, $a$'signature', (select jsonb_build_object('image', g.image, 'signed_at', g.signed_at) from public.pr_signatures g where g.employee_id = e.id),
    'sil_bal',$a$);
  if n = d then raise exception 'signature patch not applied'; end if;
  execute n;
end $do$;
