-- Cash Book expense that looks like a repair → ask every staff in the payroll app "is this a repair?" (owner 2026-11-17:
-- "수리 말 안 하는 거 대비"). First answer closes it:
--   yes → linked to an open repair (marked fixed that day with the amount) or recorded as a new repair (fixed on the
--         expense date — it was not reported in the app) · no → closed. Owner push on each answer.
-- Watches expenses dated 2026-11-17 or later. Keywords: repair, fix, clean, maintenance, technician, labor, drainage,
-- plumbing, welding, install, aircon, freon, 수리, 청소, 기사, 정비 (bills excluded).
create table if not exists public.pr_equip_cb_check (
  entry_id uuid primary key references public.entries(id) on delete cascade,
  biz_date date not null, amount numeric not null, label text,
  status text not null default 'ask' check (status in ('ask', 'repair', 'not')),
  answered_by uuid references public.pr_employees(id), answered_at timestamptz,
  issue_id uuid references public.pr_equip_issues(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.pr_equip_cb_check enable row level security;
drop policy if exists pr_equip_cb_read on public.pr_equip_cb_check;
create policy pr_equip_cb_read on public.pr_equip_cb_check for select to authenticated using (true);

create or replace function public.pr_equip_cb_text(e public.entries) returns text language sql immutable as $$
  select concat_ws(' ', e.vendor, e.details, e.note, e.items::text)
$$;
create or replace function public.pr_equip_cb_match(e public.entries) returns boolean language sql immutable as $$
  select e.kind = 'expense' and e.biz_date >= date '2026-11-17'
     and public.pr_equip_cb_text(e) ~* '(repair|fix|clean|maint|technician|labor|labour|drainage|plumb|weld|install|aircon|freon|수리|청소|기사|정비)'
     and public.pr_equip_cb_text(e) !~* '(bill|meralco|maynilad|cleaning (agent|liquid|supplies)|dishwashing)'
$$;

create or replace function public.pr_equip_cb_trg() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  begin
    if public.pr_equip_cb_match(new) then
      insert into public.pr_equip_cb_check (entry_id, biz_date, amount, label)
      values (new.id, new.biz_date, new.amount, left(concat_ws(' · ', nullif(new.vendor, ''), nullif(new.details, '')), 200))
      on conflict (entry_id) do update set biz_date = excluded.biz_date, amount = excluded.amount, label = excluded.label;
      if tg_op = 'INSERT' then
        perform public.pr_notify('💸 캐시북 수리 같은 지출: ' || coalesce(new.vendor, '') || ' ' || coalesce(new.details, '') || ' ₱' || new.amount || ' — 직원에게 수리인지 묻는 중');
      end if;
    elsif tg_op = 'UPDATE' then
      delete from public.pr_equip_cb_check where entry_id = new.id and status = 'ask';
    end if;
  exception when others then null; end;   -- never block the cash book
  return new;
end $$;
drop trigger if exists pr_equip_cb_trg on public.entries;
create trigger pr_equip_cb_trg after insert or update of kind, biz_date, amount, vendor, details, note, items on public.entries
  for each row execute function public.pr_equip_cb_trg();

create or replace function public.pr_equip_cb_rows(p_all boolean) returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object('entry_id', c.entry_id, 'biz_date', c.biz_date, 'amount', c.amount, 'label', c.label, 'status', c.status,
      'answered_by', (select name from public.pr_employees where id = c.answered_by), 'answered_at', c.answered_at,
      'issue', (select item from public.pr_equip_issues where id = c.issue_id)) order by c.biz_date desc, c.created_at desc), '[]'::jsonb)
    from public.pr_equip_cb_check c where p_all or c.status = 'ask'
$$;
revoke all on function public.pr_equip_cb_rows(boolean) from public, anon;

-- staff answer: p_ans 'repair' (+ p_issue = open repair it belongs to, or null = a repair nobody reported) / 'not'
create or replace function public.pr_emp_equip_cb(p_no text, p_pin text, p_entry uuid, p_ans text, p_issue uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare c record; nm text; k public.pr_equip_cb_check; i public.pr_equip_issues;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  if c.must_change then return jsonb_build_object('ok', false, 'err', 'must_change'); end if;
  select * into k from public.pr_equip_cb_check where entry_id = p_entry for update;
  if not found then return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
  if k.status <> 'ask' then return jsonb_build_object('ok', true, 'done', k.status); end if;   -- someone already answered
  select name into nm from public.pr_employees where id = c.emp_id;
  if p_ans = 'repair' then
    if p_issue is not null then
      select * into i from public.pr_equip_issues where id = p_issue for update;
      if not found then return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
      if i.fixed_date is null and i.waived_at is null then
        update public.pr_equip_issues set fixed_date = greatest(k.biz_date, i.start_date), fixed_by = c.emp_id, fixed_at = now(), cost = k.amount, searching = false
         where id = i.id returning * into i;
      end if;
    else
      insert into public.pr_equip_issues (cat, item, note, reported_by, start_date, fixed_date, fixed_by, fixed_at, cost)
      values ('other', coalesce(k.label, '캐시북 지출'), '캐시북 지출에서 확인 (앱 통보 없음)', c.emp_id, k.biz_date, k.biz_date, c.emp_id, now(), k.amount) returning * into i;
    end if;
    update public.pr_equip_cb_check set status = 'repair', answered_by = c.emp_id, answered_at = now(), issue_id = i.id where entry_id = k.entry_id;
    begin perform public.pr_notify('🔧 캐시북 지출 = 수리 (' || nm || '): ' || coalesce(k.label, '') || ' ₱' || k.amount
      || case when p_issue is null then ' · 앱 통보 없던 수리' else ' → ' || i.item || ' 수리 완료' end); exception when others then null; end;
  elsif p_ans = 'not' then
    update public.pr_equip_cb_check set status = 'not', answered_by = c.emp_id, answered_at = now() where entry_id = k.entry_id;
    begin perform public.pr_notify('💸 캐시북 지출 = 수리 아님 (' || nm || '): ' || coalesce(k.label, '') || ' ₱' || k.amount); exception when others then null; end;
  else return jsonb_build_object('ok', false, 'err', 'bad_value');
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.pr_emp_equip_cb(text, text, uuid, text, uuid) from public;
grant execute on function public.pr_emp_equip_cb(text, text, uuid, text, uuid) to anon, authenticated;

-- lists now also carry the open questions
create or replace function public.pr_emp_equip_list(p_no text, p_pin text)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare c record;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  return jsonb_build_object('ok', true, 'issues', public.pr_equip_rows(false), 'bal', public.pr_equip_balance(), 'checks', public.pr_equip_cb_rows(false));
end $$;

create or replace function public.pr_equip_admin() returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_owner() then raise exception 'OWNER_ONLY'; end if;
  return jsonb_build_object('issues', public.pr_equip_rows(true), 'bal', public.pr_equip_balance(),
    'days', coalesce((select jsonb_agg(to_jsonb(x)) from public.pr_equip_loss_days() x), '[]'::jsonb),
    'avg', (select jsonb_object_agg(dow, avg_sales) from public.pr_sales_dow_avg),
    'checks', public.pr_equip_cb_rows(true),
    'recover', coalesce((select jsonb_agg(jsonb_build_object('name', e.name, 'amount', r.amount, 'source', r.source, 'at', r.at) order by r.at desc)
      from public.pr_equip_recover r left join public.pr_employees e on e.id = r.employee_id), '[]'::jsonb));
end $$;
