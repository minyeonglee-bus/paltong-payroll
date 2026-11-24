-- 📢 Notices tab (owner 2026-11-24): an update counts as read ONLY when the employee presses "✅ 확인했어요" on it.
-- Before: pressing "확인했어요" on the popup moved one "seen up to" id forward, so every older update — even ones never
-- shown — stopped being NEW. Now each confirmed id is kept in seen_ids. seen_id (the old "up to" mark) is still read
-- for updates confirmed before this change.
alter table public.pr_news_seen add column if not exists seen_ids text[] not null default '{}';

-- staff: "확인했어요" on one or more updates (popup = the ones shown · notice tab = that one)
create or replace function public.pr_emp_news_ack(p_no text, p_pin text, p_ids text[])
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare c record; ids text[];
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 100
     or exists (select 1 from unnest(p_ids) x where coalesce(x, '') = '' or length(x) > 60) then
    return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
  insert into public.pr_news_seen (employee_id, seen_id, seen_ids) values (c.emp_id, '', p_ids)
    on conflict (employee_id) do update
      set seen_ids = (select coalesce(array_agg(distinct x order by x), '{}') from unnest(pr_news_seen.seen_ids || excluded.seen_ids) x),
          seen_at = now()
    returning seen_ids into ids;
  return jsonb_build_object('ok', true, 'seen_ids', to_jsonb(ids));
end $$;
revoke all on function public.pr_emp_news_ack(text, text, text[]) from public;
grant execute on function public.pr_emp_news_ack(text, text, text[]) to anon, authenticated;

-- notice_get also returns news_ids (same as pr_news_seen.sql + news_ids)
create or replace function public.pr_emp_notice_get(p_no text, p_pin text)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare c record;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  return jsonb_build_object('ok', true, 'acks', coalesce((select jsonb_agg(jsonb_build_object('notice_id', notice_id, 'agreed_at', agreed_at, 'disagree_n', disagree_n, 'docs_at', docs_at))
    from public.pr_notice_ack where employee_id = c.emp_id), '[]'::jsonb),
    'news_seen', (select nullif(seen_id, '') from public.pr_news_seen where employee_id = c.emp_id),
    'news_ids', coalesce((select to_jsonb(seen_ids) from public.pr_news_seen where employee_id = c.emp_id), '[]'::jsonb));
end $$;
revoke all on function public.pr_emp_notice_get(text, text) from public;
grant execute on function public.pr_emp_notice_get(text, text) to anon, authenticated;
