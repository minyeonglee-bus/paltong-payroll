-- Payroll notice popup (owner 2026-11-17: equipment repair policy).
-- Staff app: after login a locked popup shows the notice until the employee presses Agree.
--   Agree    → saved here (time + the exact text they agreed to) → never shows again · owner push.
--   Disagree → "contact the manager", closes for now, shows again next time the app opens · owner push.
-- The notice text lives in app.js (NOTICES); text_en keeps a copy of what was agreed for the printed form.
create table if not exists public.pr_notice_ack (
  employee_id uuid not null references public.pr_employees(id) on delete cascade,
  notice_id text not null,
  agreed_at timestamptz,
  text_en text,
  disagree_n int not null default 0,
  last_disagree_at timestamptz,
  primary key (employee_id, notice_id)
);
alter table public.pr_notice_ack enable row level security;
drop policy if exists pr_notice_ack_auth on public.pr_notice_ack;
create policy pr_notice_ack_auth on public.pr_notice_ack for select to authenticated using (true);

-- staff: which notices did I answer
create or replace function public.pr_emp_notice_get(p_no text, p_pin text)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare c record;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  return jsonb_build_object('ok', true, 'acks', coalesce((select jsonb_agg(jsonb_build_object('notice_id', notice_id, 'agreed_at', agreed_at, 'disagree_n', disagree_n))
    from public.pr_notice_ack where employee_id = c.emp_id), '[]'::jsonb));
end $$;
revoke all on function public.pr_emp_notice_get(text, text) from public;
grant execute on function public.pr_emp_notice_get(text, text) to anon, authenticated;

-- staff: agree / disagree
create or replace function public.pr_emp_notice_answer(p_no text, p_pin text, p_notice text, p_agree boolean, p_text text)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare c record; nm text; r public.pr_notice_ack;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  if c.must_change then return jsonb_build_object('ok', false, 'err', 'must_change'); end if;
  if coalesce(p_notice, '') = '' or length(p_notice) > 60 then return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
  select name into nm from public.pr_employees where id = c.emp_id;
  select * into r from public.pr_notice_ack where employee_id = c.emp_id and notice_id = p_notice;
  if r.agreed_at is not null then return jsonb_build_object('ok', true, 'agreed_at', r.agreed_at); end if;   -- already agreed (retry)
  if p_agree then
    insert into public.pr_notice_ack (employee_id, notice_id, agreed_at, text_en) values (c.emp_id, p_notice, now(), left(p_text, 4000))
      on conflict (employee_id, notice_id) do update set agreed_at = now(), text_en = excluded.text_en
      returning * into r;
    begin perform public.pr_notify('📢 공지 동의: ' || nm || ' · ' || p_notice); exception when others then null; end;
  else
    insert into public.pr_notice_ack (employee_id, notice_id, disagree_n, last_disagree_at) values (c.emp_id, p_notice, 1, now())
      on conflict (employee_id, notice_id) do update set disagree_n = pr_notice_ack.disagree_n + 1, last_disagree_at = now()
      returning * into r;
    begin perform public.pr_notify('⚠️ 공지 미동의: ' || nm || ' · ' || p_notice || ' (' || r.disagree_n || '번째) — 연락이 올 수 있어요'); exception when others then null; end;
  end if;
  return jsonb_build_object('ok', true, 'agreed_at', r.agreed_at, 'disagree_n', r.disagree_n);
end $$;
revoke all on function public.pr_emp_notice_answer(text, text, text, boolean, text) from public;
grant execute on function public.pr_emp_notice_answer(text, text, text, boolean, text) to anon, authenticated;
