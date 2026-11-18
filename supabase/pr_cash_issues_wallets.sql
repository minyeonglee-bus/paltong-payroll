-- Cash Book shortages now include Maya and GCash, not only cash (owner 2026-11-05).
-- At each mid-close / close the Cash Book already checks the Maya / GCash balance photo against the book
-- (close_problems / book_at). A wallet that is SHORT opens an issue in the payroll app, like a cash shortage.
-- A wallet difference carries over to the next checkpoints until it is fixed, so only NEW missing money opens an
-- issue: amount = shortage now − shortage at the previous checkpoint (any day). Over-payments (more than the book) are ignored.
-- Nothing is deducted automatically: the owner assigns it to an employee (→ unverified shortage) or dismisses it.
alter table public.pr_cash_issues add column if not exists acct text not null default 'CASH';
alter table public.pr_cash_issues drop constraint if exists pr_cash_issues_checkpoint_id_key;
create unique index if not exists pr_cash_issues_cp_acct on public.pr_cash_issues(checkpoint_id, acct);

-- wallet balance photo vs book for one checkpoint (same photo the Cash Book used: latest of the day,
-- after the mid-close for a close, taken before the checkpoint was saved)
create or replace function public.pr_wallet_short(p_cp uuid, p_acct text, out real_amt numeric, out book numeric, out short numeric)
language plpgsql stable security definer set search_path to 'public' as $$
declare c public.checkpoints; since timestamptz := '-infinity'; r public.real_balances;
begin
  select * into c from public.checkpoints where id = p_cp;
  if not found then return; end if;
  if c.stage = 'final' then
    select coalesce(max(created_at), '-infinity') into since from public.checkpoints
     where biz_date = c.biz_date and stage = 'mid' and created_at < c.created_at;
  end if;
  select * into r from public.real_balances where biz_date = c.biz_date and account = p_acct and created_at > since and created_at <= c.created_at
   order by created_at desc limit 1;
  if not found then return; end if;
  real_amt := r.amount; book := public.book_at(c.biz_date, p_acct, r.created_at); short := round(book - r.amount, 2);
end $$;
revoke all on function public.pr_wallet_short(uuid, text) from public, anon, authenticated;

create or replace function public.pr_cash_issue_wallets(p_cp uuid)
returns int language plpgsql security definer set search_path to 'public' as $$
declare c public.checkpoints; prev uuid; a text; now_s record; prev_s numeric; amt numeric; duty text[]; n int := 0;
begin
  select * into c from public.checkpoints where id = p_cp;
  select id into prev from public.checkpoints where created_at < c.created_at order by created_at desc limit 1;
  select coalesce(array_agg(coalesce(s.staff_name, st.name) || ' ' || s.shift order by s.shift), '{}') into duty
    from public.shifts s left join public.staff st on st.user_id = s.user_id
   where s.day = c.biz_date and s.shift is not null and s.shift <> 'off';
  foreach a in array array['GCASH', 'MAYA'] loop
    select * into now_s from public.pr_wallet_short(c.id, a);
    if now_s.short is null or now_s.short < 0.01 then continue; end if;
    prev_s := greatest(coalesce(case when prev is not null then (public.pr_wallet_short(prev, a)).short end, 0), 0);
    amt := round(now_s.short - prev_s, 2);
    if amt < 0.01 then continue; end if;   -- same shortage carried over from the previous checkpoint
    insert into public.pr_cash_issues (checkpoint_id, acct, biz_date, stage, amount, counted, expected, reason, counted_by, on_duty)
    values (c.id, a, c.biz_date, c.stage, amt, now_s.real_amt, now_s.book, c.diff_notes->>a, c.staff_name, duty)
    on conflict (checkpoint_id, acct) do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.pr_cash_issue_wallets(uuid) from public, anon, authenticated;

create or replace function public.pr_cash_issue_from_checkpoint()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare duty text[];
begin
  if new.counted is not null and new.expected is not null and new.counted < new.expected - 0.01 then
    select coalesce(array_agg(coalesce(s.staff_name, st.name) || ' ' || s.shift order by s.shift), '{}') into duty
      from public.shifts s left join public.staff st on st.user_id = s.user_id
     where s.day = new.biz_date and s.shift is not null and s.shift <> 'off';
    insert into public.pr_cash_issues (checkpoint_id, acct, biz_date, stage, amount, counted, expected, reason, counted_by, on_duty)
    values (new.id, 'CASH', new.biz_date, new.stage, round(new.expected - new.counted, 2), new.counted, new.expected,
            coalesce(new.diff_notes->>'CASH', new.diff_note), new.staff_name, duty)
    on conflict (checkpoint_id, acct) do nothing;
  end if;
  perform public.pr_cash_issue_wallets(new.id);
  return new;
end $function$;

create or replace function public.pr_cash_issue_assign(p_issue uuid, p_employee uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare i public.pr_cash_issues; lid uuid;
begin
  if not public.is_owner() then raise exception 'NO_PERMISSION'; end if;
  select * into i from public.pr_cash_issues where id = p_issue for update;
  if not found or i.status <> 'open' then raise exception 'ALREADY_DONE'; end if;
  insert into public.pr_ledger (employee_id, kind, biz_date, amount, note, verified, authorized)
  values (p_employee, 'shortage', i.biz_date, i.amount,
          '캐시북 ' || to_char(i.biz_date, 'MM/DD') || ' ' || case when i.stage = 'mid' then '중간마감' else '마감' end || ' '
          || case i.acct when 'GCASH' then 'GCash' when 'MAYA' then 'Maya' else '현금' end
          || ' 부족 ₱' || to_char(i.amount, 'FM999,999,990.00') || coalesce(' · 사유: ' || i.reason, ''), false, false)
  returning id into lid;
  update public.pr_cash_issues set status = 'assigned', ledger_id = lid where id = p_issue;
  return lid;
end $function$;

-- this month's checkpoints that were saved before this rule
do $$ declare c record; begin
  for c in select id from public.checkpoints where biz_date >= date '2026-11-01' order by created_at loop
    perform public.pr_cash_issue_wallets(c.id);
  end loop;
end $$;
