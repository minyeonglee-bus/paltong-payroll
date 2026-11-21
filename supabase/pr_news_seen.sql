-- 🆕 "What's new" notices already confirmed → never pop up again, on any phone (owner 2026-11-21).
-- Before: the last confirmed id was kept only in the phone's localStorage, so a new phone / browser / cleared data
-- showed the same popup again. Now the server keeps it too. Staff can still find every notice on the 📢 notice tab.
create table if not exists public.pr_news_seen (
  employee_id uuid primary key references public.pr_employees(id) on delete cascade,
  seen_id text not null,
  seen_at timestamptz not null default now()
);
alter table public.pr_news_seen enable row level security;
drop policy if exists pr_news_seen_auth on public.pr_news_seen;
create policy pr_news_seen_auth on public.pr_news_seen for select to authenticated using (true);

-- staff: "확인했어요" on the popup → remember the newest id (only moves forward)
create or replace function public.pr_emp_news_seen(p_no text, p_pin text, p_id text)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare c record; s text;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  if coalesce(p_id, '') = '' or length(p_id) > 60 then return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
  insert into public.pr_news_seen (employee_id, seen_id) values (c.emp_id, p_id)
    on conflict (employee_id) do update set seen_id = greatest(pr_news_seen.seen_id, excluded.seen_id), seen_at = now()
    returning seen_id into s;
  return jsonb_build_object('ok', true, 'seen_id', s);
end $$;
revoke all on function public.pr_emp_news_seen(text, text, text) from public;
grant execute on function public.pr_emp_news_seen(text, text, text) to anon, authenticated;

-- notice_get also returns news_seen (same as pr_gov_waiver.sql + news_seen)
create or replace function public.pr_emp_notice_get(p_no text, p_pin text)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare c record;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  return jsonb_build_object('ok', true, 'acks', coalesce((select jsonb_agg(jsonb_build_object('notice_id', notice_id, 'agreed_at', agreed_at, 'disagree_n', disagree_n, 'docs_at', docs_at))
    from public.pr_notice_ack where employee_id = c.emp_id), '[]'::jsonb),
    'news_seen', (select seen_id from public.pr_news_seen where employee_id = c.emp_id));
end $$;
revoke all on function public.pr_emp_notice_get(text, text) from public;
grant execute on function public.pr_emp_notice_get(text, text) to anon, authenticated;
