-- 가불 신청: 현금 / GCash 선택 + 캐시북 자동 기록 (사장님 2026-11-04, 11/5 신청분부터)
--  • 직원이 앱에서 가불 신청 → pr_ledger.pay_via (CASH | GCASH)
--  • 2026-11-05 이후 앱 신청 가불은 캐시북 entries 에 자동으로 한 줄 (kind staff · note advance · 받은 사람 = vendor · staff_name 'Payroll')
--    날짜는 캐시북 영업일 기준 (새벽 신청은 전날 영업일, receipt_biz_date).
--  • 이미 캐시북에 손으로 적은 같은 가불이 있으면 (같은 금액·현금/GCash·±1일·이름 앞 3글자) 새로 안 만들고 그 줄에 연결.
--  • 자동 줄이 생긴 뒤 누가 손으로 같은 가불을 또 적으면, 자동 줄을 지우고 손으로 적은 줄에 연결 (중복 방지).
--  • 가불을 지우거나 금액·방법을 바꾸면 캐시북 자동 줄도 같이 바뀜.
alter table public.pr_ledger add column if not exists pay_via text check (pay_via in ('CASH', 'GCASH'));
alter table public.entries add column if not exists pr_ledger_id uuid references public.pr_ledger(id) on delete set null;
create index if not exists entries_pr_ledger_idx on public.entries(pr_ledger_id);

create or replace function public.pr_adv_name_key(s text) returns text language sql immutable as $$
  select left(lower(regexp_replace(coalesce(s, ''), '[^A-Za-z]', '', 'g')), 3) $$;

create or replace function public.pr_adv_cashbook_sync(lid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare l public.pr_ledger; nm text; bd date; hit uuid; n int; grp text; why text;
begin
  delete from public.entries where pr_ledger_id = lid and staff_name = 'Payroll';
  update public.entries set pr_ledger_id = null where pr_ledger_id = lid;
  select * into l from public.pr_ledger where id = lid;
  if not found or l.kind <> 'advance' or l.self_req_at is null or l.biz_date < date '2026-11-05' then return; end if;
  select name into nm from public.pr_employees where id = l.employee_id;
  bd := public.receipt_biz_date((l.self_req_at at time zone 'Asia/Manila')::date, (l.self_req_at at time zone 'Asia/Manila')::time);
  grp := coalesce(l.pay_via, 'CASH');
  select count(*), min(e.id::text)::uuid into n, hit from public.entries e
   where e.kind = 'staff' and e.note = 'advance' and e.pr_ledger_id is null and coalesce(e.staff_name, '') <> 'Payroll'
     and abs(e.amount - l.amount) < 0.01
     and (case when e.account in ('CASH', 'SAVINGBOX') then 'CASH' else e.account end) = grp
     and e.biz_date between bd - 1 and bd + 1
     and public.pr_adv_name_key(e.vendor) = public.pr_adv_name_key(nm);
  if n = 1 then
    update public.entries set pr_ledger_id = lid where id = hit;
    return;
  end if;
  why := nullif(regexp_replace(coalesce(l.note, ''), '^📱 가불 신청 \(자동 승인\)( · )?', ''), '');
  insert into public.entries (biz_date, kind, amount, account, vendor, note, details, staff_name, pr_ledger_id)
  values (bd, 'staff', l.amount, grp, nm, 'advance',
          '📱 앱 가불 신청' || coalesce(' · ' || why, ''), 'Payroll', lid);
end $$;

create or replace function public.pr_ledger_cashbook_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    delete from public.entries where pr_ledger_id = old.id and staff_name = 'Payroll';
    return old;
  end if;
  if new.kind <> 'advance' or new.self_req_at is null then return new; end if;
  if tg_op = 'UPDATE' and new.amount is not distinct from old.amount and new.pay_via is not distinct from old.pay_via
     and new.biz_date is not distinct from old.biz_date then return new; end if;
  begin
    perform public.pr_adv_cashbook_sync(new.id);
  exception when others then raise warning 'advance → cashbook 실패: %', sqlerrm;   -- 가불 신청 자체는 막지 않음
  end;
  return new;
end $$;
drop trigger if exists pr_ledger_cashbook on public.pr_ledger;
create trigger pr_ledger_cashbook after insert or update on public.pr_ledger
  for each row execute function public.pr_ledger_cashbook_trg();
-- 삭제는 BEFORE (외래키가 링크를 먼저 지우기 전에 자동 줄 삭제)
drop trigger if exists pr_ledger_cashbook_del on public.pr_ledger;
create trigger pr_ledger_cashbook_del before delete on public.pr_ledger
  for each row execute function public.pr_ledger_cashbook_trg();

-- 캐시북에 손으로 같은 가불을 또 적으면 → 자동 줄 삭제, 손 줄에 연결
create or replace function public.entries_advance_dedupe()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int; hit uuid; lid uuid; grp text := case when new.account in ('CASH', 'SAVINGBOX') then 'CASH' else new.account end;
begin
  if new.kind <> 'staff' or new.note <> 'advance' or new.pr_ledger_id is not null or coalesce(new.staff_name, '') = 'Payroll' then return new; end if;
  select count(*), min(e.id::text)::uuid, min(e.pr_ledger_id::text)::uuid into n, hit, lid from public.entries e
   where e.staff_name = 'Payroll' and e.pr_ledger_id is not null and e.kind = 'staff' and e.note = 'advance'
     and abs(e.amount - new.amount) < 0.01 and e.account = grp
     and e.biz_date between new.biz_date - 1 and new.biz_date + 1
     and public.pr_adv_name_key(e.vendor) = public.pr_adv_name_key(new.vendor);
  if n <> 1 then return new; end if;
  delete from public.entries where id = hit;
  update public.entries set pr_ledger_id = lid where id = new.id;
  return new;
end $$;
drop trigger if exists entries_advance_dedupe on public.entries;
create trigger entries_advance_dedupe after insert on public.entries
  for each row execute function public.entries_advance_dedupe();

-- 직원 가불 신청: 받는 방법 필수 (CASH | GCASH)
create or replace function public.pr_emp_advance(p_no text, p_pin text, p_amount numeric, p_reason text, p_via text)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare c record; rid uuid; r text := left(trim(coalesce(p_reason, '')), 200); lim jsonb; v text := upper(trim(coalesce(p_via, '')));
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  if c.must_change then return jsonb_build_object('ok', false, 'err', 'must_change'); end if;
  if not exists (select 1 from public.pr_signatures where employee_id = c.emp_id) then return jsonb_build_object('ok', false, 'err', 'need_sig'); end if;
  if p_amount is null or p_amount < 1 or p_amount <> round(p_amount, 2) then return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
  if v not in ('CASH', 'GCASH') then return jsonb_build_object('ok', false, 'err', 'bad_via'); end if;
  perform pg_advisory_xact_lock(hashtext('pr_adv_' || c.emp_id::text));
  lim := public.pr_adv_limit(c.emp_id);
  if p_amount > (lim->>'left')::numeric then return jsonb_build_object('ok', false, 'err', 'over_limit', 'limit', lim); end if;
  insert into public.pr_ledger (employee_id, kind, biz_date, amount, note, note_en, verified, authorized, self_req_at, created_by, pay_via)
  values (c.emp_id, 'advance', (now() at time zone 'Asia/Manila')::date, p_amount,
          '📱 가불 신청 (자동 승인)' || case when r <> '' then ' · ' || r else '' end,
          '📱 Advance request (auto-approved)' || case when r <> '' then ' · ' || r else '' end,
          true, true, now(), null, v)
  returning id into rid;
  return jsonb_build_object('ok', true, 'id', rid);
end $$;
-- 예전 화면(캐시)에서 오는 4칸 호출은 현금으로
create or replace function public.pr_emp_advance(p_no text, p_pin text, p_amount numeric, p_reason text)
returns jsonb language sql security definer set search_path to 'public' as $$
  select public.pr_emp_advance(p_no, p_pin, p_amount, p_reason, 'CASH') $$;
grant execute on function public.pr_emp_advance(text, text, numeric, text, text) to anon, authenticated;

-- 직원 화면 가불 내역에 받는 방법 표시
do $do$ declare d text := pg_get_functiondef('public.pr_emp_view(text,text)'::regprocedure); n text;
begin
  if position($a$'pay_via'$a$ in d) > 0 then return; end if;
  n := replace(d, $a$'note_en', l.note_en,$a$, $a$'note_en', l.note_en, 'pay_via', l.pay_via,$a$);
  if n = d then raise exception 'pay_via patch not applied'; end if;
  execute n;
end $do$;
