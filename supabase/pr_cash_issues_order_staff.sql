-- Who is responsible for a Cash Book shortage = the employee who completed (took payment for) the order,
-- NOT whoever did the mid-close / close (owner 2026-11-05).
--
-- 1) ORDER DB (PALTONG ORDER/RIDER): cashbook_row() also sends 'staff' = orders.staff_name (the employee who took the
--    order / payment, confirmed with their own PIN). See ../../paltong-order/sql/cashbook_row_staff.sql.
-- 2) MONEY TRACKER (this file): order_sale_put() stores it in order_staff (entries are untouched).
-- 3) Each shortage issue lists the sales of that account (cash / GCash / Maya) saved since the previous checkpoint,
--    with the employee for each. An order whose amount equals the shortage → that employee is suggested.
--    If every sale in the window was taken by one person → that person is suggested. Otherwise the owner picks.
create table if not exists public.order_staff (
  order_id uuid primary key,
  code text,
  order_date date,
  payment text,
  amount numeric,
  staff_name text,
  updated_at timestamptz not null default now()
);
alter table public.order_staff enable row level security;
drop policy if exists order_staff_read on public.order_staff; create policy order_staff_read on public.order_staff for select using (public.is_owner());

create or replace function public.order_staff_put(r jsonb) returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if r is null or (r->>'id') is null or not (r ? 'staff') then return; end if;
  insert into public.order_staff (order_id, code, order_date, payment, amount, staff_name, updated_at)
  values ((r->>'id')::uuid, r->>'code', (r->>'order_date')::date, r->>'payment', (r->>'amount')::numeric, nullif(trim(r->>'staff'), ''), now())
  on conflict (order_id) do update set code = excluded.code, order_date = excluded.order_date, payment = excluded.payment,
    amount = excluded.amount, staff_name = excluded.staff_name, updated_at = now();
end $$;
revoke all on function public.order_staff_put(jsonb) from public, anon, authenticated;

-- order_sale_put: remember the staff first (nothing else changes)
do $do$ declare d text := pg_get_functiondef('public.order_sale_put(date,jsonb)'::regprocedure); n text;
begin
  if position('order_staff_put' in d) > 0 then return; end if;
  n := regexp_replace(d, E'\\nbegin\\s*\\n', E'\nbegin\n  perform public.order_staff_put(r);\n');
  if n = d then raise exception 'order_sale_put patch not applied'; end if;
  execute n;
end $do$;

alter table public.pr_cash_issues add column if not exists suspects jsonb;
alter table public.pr_cash_issues add column if not exists suggested text;

-- sales of the issue's account saved between the previous checkpoint and this one, with who completed each
create or replace function public.pr_cash_issue_fill(p_issue uuid) returns void language plpgsql security definer set search_path to 'public' as $$
declare i public.pr_cash_issues; c public.checkpoints; t0 timestamptz; lst jsonb; sug text; ex jsonb; n_staff int;
begin
  select * into i from public.pr_cash_issues where id = p_issue;
  select * into c from public.checkpoints where id = i.checkpoint_id;
  if not found then return; end if;
  select coalesce(max(created_at), c.created_at - interval '1 day') into t0 from public.checkpoints where created_at < c.created_at;
  select coalesce(jsonb_agg(jsonb_build_object('code', e.receipt, 'amount', e.amount, 'staff', coalesce(s.staff_name, case when e.staff_name <> 'Order site' then e.staff_name end),
           'at', e.created_at, 'order', e.src_order is not null or e.src_order_x is not null) order by e.created_at), '[]'::jsonb)
    into lst
    from public.entries e left join public.order_staff s on s.order_id = coalesce(e.src_order, e.src_order_x)
   where e.kind = 'sale' and e.account = i.acct and e.created_at > t0 and e.created_at <= c.created_at;
  select x into ex from jsonb_array_elements(lst) x where abs((x->>'amount')::numeric - i.amount) < 0.01 and x->>'staff' is not null limit 1;
  select count(distinct x->>'staff') into n_staff from jsonb_array_elements(lst) x where x->>'staff' is not null;
  sug := case when ex is not null then ex->>'staff'
              when n_staff = 1 then (select x->>'staff' from jsonb_array_elements(lst) x where x->>'staff' is not null limit 1) end;
  update public.pr_cash_issues set suspects = lst, suggested = sug where id = p_issue;
end $$;
revoke all on function public.pr_cash_issue_fill(uuid) from public, anon, authenticated;

create or replace function public.pr_cash_issue_filled() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin perform public.pr_cash_issue_fill(new.id); return new; end $$;
drop trigger if exists pr_cash_issue_fill_trg on public.pr_cash_issues;
create trigger pr_cash_issue_fill_trg after insert on public.pr_cash_issues for each row execute function public.pr_cash_issue_filled();

-- owner can refresh the list (e.g. after the order app sent the staff names)
create or replace function public.pr_cash_issue_refresh(p_issue uuid) returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_owner() then raise exception 'NO_PERMISSION'; end if;
  perform public.pr_cash_issue_fill(p_issue);
  return (select jsonb_build_object('suspects', suspects, 'suggested', suggested) from public.pr_cash_issues where id = p_issue);
end $$;
revoke all on function public.pr_cash_issue_refresh(uuid) from public;
grant execute on function public.pr_cash_issue_refresh(uuid) to authenticated;

-- push text names the account (cash / GCash / Maya) and the suggested employee (who completed the order), not the closer.
-- pr_cash_issue_fill_trg fires first (trigger names run in alphabetical order), so the row already has `suggested`.
create or replace function public.pr_cash_issue_notify()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare sug text; codes text;
begin
  if new.status <> 'open' then return null; end if;
  select suggested, (select string_agg(x->>'code', ', ') from jsonb_array_elements(coalesce(suspects, '[]'::jsonb)) x where x->>'staff' = suggested and abs((x->>'amount')::numeric - amount) < 0.01)
    into sug, codes from public.pr_cash_issues where id = new.id;
  perform public.pr_notify('🧾 캐시북 ' || case new.acct when 'GCASH' then 'GCash' when 'MAYA' then 'Maya' else '현금' end || ' 부족 · '
    || public.pr_md(new.biz_date) || ' ' || case new.stage when 'mid' then '중간마감' else '마감' end || E'\n₱'
    || to_char(abs(new.amount), 'FM999,999.00')
    || coalesce(E'\n🙋 주문 완료: ' || sug || coalesce(' (' || codes || ')', ''), '')
    || coalesce(E'\n사유: ' || nullif(new.reason, ''), '')
    || E'\n👉 급여 앱 → 가불·부족분·보너스');
  return null;
end $function$;
