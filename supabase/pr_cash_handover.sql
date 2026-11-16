-- Cash Book 교대 확인 · 차이 넘기기 (사장님 2026-11-16)
--
-- 1) 장부와 1페소라도 다르면 직원은 중간마감·마감 불가 (사유를 적어도 안 됨). 사장님은 그대로 가능.
-- 2) 근무자(오전 파트 = 중간마감, 저녁 파트 = 마감)는 임시저장만. 임시저장한 사람(close_drafts.worker)은 그 마감을 못 함.
-- 3) 교대자가 현금을 다시 세고 잔고 사진을 다시 찍어서 재검사. 다르면 "차이 넘기기"(cb_handover):
--    - 계좌마다 조정 줄(entries kind=adjust, ref='handover')이 들어가서 장부 = 실제 → 바로 마감 가능
--    - 차이는 임시저장한 근무자 책임 → pr_cash_issues (handover=true, status wait_emp)
-- 4) 근무자는 급여 앱에서 답함 (pr_emp_cash_answer):
--    - 이유를 알아요 → 이유 적기 → 부족: 사장님이 결정 (wait_owner → 면제 / 직원 부담) · 초과: 기록만 (noted)
--    - 이유 모름 → 부족: 💸 급여 차감 (본인 동의, 바로 공제 대상) 또는 💵 바로 채워두기 (wait_fill → 캐시북에서 받은 직원이 확인)
--    - 사장님이 '직원 부담'으로 정하면 다시 근무자에게 → 급여 차감 / 채우기만 고를 수 있음
-- 5) 채우기 확인(cb_fill_confirm) → 그날 장부에 조정 + 줄 (ref='fill')
-- 11/5 규칙(주문 완료 직원 책임)은 교대 확인 차이에는 쓰지 않음. 사장님 계정으로 저장한 마감의 차이는 예전 흐름(open) 그대로.

-- ---------- columns ----------
alter table public.pr_cash_issues drop constraint if exists pr_cash_issues_status_check;
alter table public.pr_cash_issues add constraint pr_cash_issues_status_check
  check (status in ('open','assigned','dismissed','wait_emp','wait_owner','wait_fill','filled','noted'));
alter table public.pr_cash_issues add column if not exists handover boolean not null default false;
alter table public.pr_cash_issues add column if not exists kind text not null default 'short';
alter table public.pr_cash_issues drop constraint if exists pr_cash_issues_kind_check;
alter table public.pr_cash_issues add constraint pr_cash_issues_kind_check check (kind in ('short','over'));
alter table public.pr_cash_issues add column if not exists emp_id uuid references public.pr_employees(id) on delete set null;
alter table public.pr_cash_issues add column if not exists checker text;
alter table public.pr_cash_issues add column if not exists emp_choice text;
alter table public.pr_cash_issues add column if not exists emp_reason text;
alter table public.pr_cash_issues add column if not exists emp_at timestamptz;
alter table public.pr_cash_issues add column if not exists owner_decided boolean not null default false;
alter table public.pr_cash_issues add column if not exists fill_by text;
alter table public.pr_cash_issues add column if not exists fill_at timestamptz;
alter table public.pr_cash_issues add column if not exists adjust_id uuid;
alter table public.pr_cash_issues add column if not exists fill_entry_id uuid;
alter table public.entries add column if not exists handover_id uuid references public.pr_cash_issues(id) on delete set null;

-- who started the draft (근무자) — kept when the next shift opens / re-saves it, reset when the draft is cleared
alter table public.close_drafts add column if not exists worker text;
alter table public.close_drafts add column if not exists worker_at timestamptz;
create or replace function public.close_draft_worker() returns trigger language plpgsql as $$
begin
  if new.data is null then new.worker := null; new.worker_at := null; return new; end if;
  if tg_op = 'UPDATE' and old.data is not null and old.worker is not null then
    new.worker := old.worker; new.worker_at := old.worker_at;
  else
    new.worker := new.staff_name; new.worker_at := coalesce(new.updated_at, now());
  end if;
  return new;
end $$;
drop trigger if exists close_draft_worker_trg on public.close_drafts;
create trigger close_draft_worker_trg before insert or update on public.close_drafts for each row execute function public.close_draft_worker();
update public.close_drafts set worker = staff_name, worker_at = updated_at where data is not null and worker is null;

-- ---------- book at photo time + handover corrections made after that photo ----------
create or replace function public.handover_adj(p_date date, p_acct text, p_after timestamptz, p_before timestamptz)
returns numeric language sql stable security definer set search_path to 'public' as $$
  select coalesce(sum(case when to_acct = p_acct then amount when from_acct = p_acct then -amount else 0 end), 0)
    from public.entries
   where biz_date = p_date and kind = 'adjust' and ref = 'handover' and handover_id is not null
     and created_at > p_after and created_at <= p_before $$;

create or replace function public.close_problems(p_date date, p_stage text)
returns text[] language plpgsql stable security definer set search_path to 'public' as $function$
declare
  since timestamptz := '-infinity';
  a text; r record; b numeric; probs text[] := '{}';
  nm jsonb := '{"GCASH":"GCash","MAYA":"Maya"}';
begin
  if p_stage = 'final' then
    select coalesce(max(created_at), '-infinity') into since
      from public.checkpoints where biz_date = p_date and stage = 'mid';
  end if;
  foreach a in array array['GCASH','MAYA'] loop
    select * into r from public.real_balances
     where biz_date = p_date and account = a and created_at > since
     order by created_at desc limit 1;
    if not found then
      probs := probs || ((nm->>a) || ': 실제잔고 없음 / missing');
    else
      b := public.book_at(p_date, a, r.created_at) + public.handover_adj(p_date, a, r.created_at, now());
      if abs(r.amount - b) >= 0.01 then
        probs := probs || ((nm->>a) || ': 차이 ' || to_char(r.amount - b, 'FMS999,999,990.00')
                           || ' (실제 ' || to_char(r.amount, 'FM999,999,990.00') || ' / 장부 ' || to_char(b, 'FM999,999,990.00') || ')');
      end if;
    end if;
  end loop;
  return probs;
end $function$;

create or replace function public.pr_wallet_short(p_cp uuid, p_acct text, out real_amt numeric, out book numeric, out short numeric)
language plpgsql stable security definer set search_path to 'public' as $function$
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
  real_amt := r.amount;
  book := public.book_at(c.biz_date, p_acct, r.created_at) + public.handover_adj(c.biz_date, p_acct, r.created_at, c.created_at);
  short := round(book - r.amount, 2);
end $function$;

-- ---------- staff: any difference blocks (reasons no longer let it through) ----------
create or replace function public.close_verdict2(probs text[], p_note text, p_notes jsonb, p_label text)
returns void language plpgsql immutable as $function$
declare miss text[]; diffs text[];
begin
  select coalesce(array_agg(y), '{}') into miss from unnest(probs) y where y like '%missing%';
  select coalesce(array_agg(y), '{}') into diffs from unnest(probs) y where y not like '%missing%';
  if array_length(miss, 1) > 0 then
    raise exception '%', p_label || array_to_string(probs, ' · ');
  end if;
  if coalesce(array_length(diffs, 1), 0) > 0 then
    raise exception '%', p_label || array_to_string(diffs, ' · ')
      || ' → 장부와 다르면 마감할 수 없어요. 교대자가 확인 후 "차이 넘기기"를 해야 해요 / Doesn''t match the book — the next shift must hand the difference over first';
  end if;
end $function$;

-- the worker who saved the draft cannot finish that close
create or replace function public.close_worker_block(p_date date, p_stage text, p_who uuid)
returns void language plpgsql stable security definer set search_path to 'public' as $$
declare w text; me text;
begin
  select worker into w from public.close_drafts where biz_date = p_date and stage = p_stage and data is not null;
  if w is null then return; end if;
  select name into me from public.staff where user_id = p_who;
  if me is not null and lower(trim(me)) = lower(trim(w)) then
    raise exception '근무자는 마감할 수 없어요 — 임시저장하고 교대자가 다시 확인 후 마감해요 / The worker who saved the draft cannot close — the next shift checks and closes';
  end if;
end $$;

create or replace function public.checkpoint_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare probs text[]; who uuid := coalesce(auth.uid(), new.created_by); bk numeric;
begin
  if public.is_owner_id(who) then return new; end if;
  perform public.close_worker_block(new.biz_date, new.stage, who);
  probs := public.close_problems(new.biz_date, new.stage);
  bk := case when new.stage = 'mid' then public.book_at(new.biz_date, 'CASH', now()) else new.expected end;
  if new.counted is null then
    probs := probs || '현금 Cash: 센 금액 없음 / counted cash missing'::text;
  elsif bk is not null and abs(new.counted - bk) >= 0.01 then
    probs := probs || ('현금 Cash: 차이 ' || to_char(new.counted - bk, 'FMS999,999,990.00')
                       || ' (센 금액 ' || to_char(new.counted, 'FM999,999,990.00') || ' / 장부 ' || to_char(bk, 'FM999,999,990.00') || ')');
  end if;
  perform public.close_verdict2(probs, new.diff_note, new.diff_notes,
    case when new.stage = 'mid' then '중간마감 불가 / Mid-close blocked: ' else '마감 불가 / Close blocked: ' end);
  return new;
end $function$;

create or replace function public.close_move_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare probs text[]; who uuid := coalesce(auth.uid(), new.created_by);
begin
  if new.kind <> 'savingbox' or public.is_owner_id(who) then return new; end if;
  perform public.close_worker_block(new.biz_date, 'final', who);
  probs := public.close_problems(new.biz_date, 'final');
  if new.counted is null then
    probs := probs || '현금 Cash: 센 금액 없음 / counted cash missing'::text;
  elsif new.expected is not null and abs(new.counted - new.expected) >= 0.01 then
    probs := probs || ('현금 Cash: 차이 ' || to_char(new.counted - new.expected, 'FMS999,999,990.00')
                       || ' (센 금액 ' || to_char(new.counted, 'FM999,999,990.00') || ' / 장부 ' || to_char(new.expected, 'FM999,999,990.00') || ')');
  end if;
  perform public.close_verdict2(probs, new.diff_note, new.diff_notes, '마감 불가 / Close blocked: ');
  return new;
end $function$;

-- ---------- helpers ----------
create or replace function public.cb_acct_ko(a text) returns text language sql immutable as $$
  select case a when 'GCASH' then 'GCash' when 'MAYA' then 'Maya' when 'METROBANK' then 'Metrobank' else '현금' end $$;
create or replace function public.cb_issue_label(i public.pr_cash_issues) returns text language sql stable set search_path to 'public' as $$
  select to_char(i.biz_date, 'MM/DD') || ' ' || case when i.stage = 'mid' then '중간마감' else '마감' end || ' '
      || public.cb_acct_ko(i.acct) || ' ' || case when i.kind = 'over' then '초과 +₱' else '부족 −₱' end || to_char(i.amount, 'FM999,999,990.00') $$;
-- the business day it is now (Cash Book cutoff hour, Manila)
create or replace function public.cb_today() returns date language sql stable security definer set search_path to 'public' as $$
  select ((now() at time zone 'Asia/Manila') - make_interval(hours => coalesce((select cutoff_hour from public.settings where id = 1), 8)))::date $$;

-- ---------- 교대자: 차이 넘기기 ----------
create or replace function public.cb_handover(p_date date, p_stage text, p_counted numeric)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare me text; d public.close_drafts; since timestamptz := '-infinity'; a text; r public.real_balances; b numeric; df numeric;
  items jsonb := '[]'; x jsonb; emp uuid; emp_n int; iss uuid; ent public.entries; ents jsonb := '[]'; lines text := '';
begin
  if not public.is_staff() then raise exception 'NO_PERMISSION'; end if;
  if p_stage not in ('mid','final') then raise exception 'BAD_STAGE'; end if;
  select name into me from public.staff where user_id = auth.uid();
  if exists (select 1 from public.checkpoints where biz_date = p_date and stage = 'final') then
    raise exception '이미 마감된 날이에요 / This day is already closed';
  end if;
  select * into d from public.close_drafts where biz_date = p_date and stage = p_stage;
  if not found or d.data is null or d.worker is null then
    raise exception 'NO_DRAFT: 전 근무자의 임시저장이 없어서 차이를 넘길 수 없어요. 사장님께 연락하세요 / No draft from the previous shift — call the owner';
  end if;
  if lower(trim(d.worker)) = lower(trim(coalesce(me, ''))) then
    raise exception 'SAME_PERSON: 본인이 임시저장한 마감은 넘길 수 없어요 / You saved this draft yourself — the next shift must check it';
  end if;
  if p_stage = 'final' then
    select coalesce(max(created_at), '-infinity') into since from public.checkpoints where biz_date = p_date and stage = 'mid';
  end if;
  foreach a in array array['GCASH','MAYA'] loop
    select * into r from public.real_balances where biz_date = p_date and account = a and created_at > since order by created_at desc limit 1;
    if not found then raise exception '% 잔고 사진이 없어요 / missing balance photo', public.cb_acct_ko(a); end if;
    if r.created_at <= d.worker_at then
      raise exception '% 잔고 사진을 교대자가 다시 찍어야 해요 / Retake the % balance photo yourself', public.cb_acct_ko(a), public.cb_acct_ko(a);
    end if;
    b := public.book_at(p_date, a, r.created_at) + public.handover_adj(p_date, a, r.created_at, now());
    df := round(r.amount - b, 2);
    if abs(df) >= 0.01 then items := items || jsonb_build_object('acct', a, 'diff', df, 'real', r.amount, 'book', b); end if;
  end loop;
  if p_counted is null then raise exception '센 현금을 입력하세요 / Enter the counted cash'; end if;
  b := public.book_at(p_date, 'CASH', now()); df := round(p_counted - b, 2);
  if abs(df) >= 0.01 then items := items || jsonb_build_object('acct', 'CASH', 'diff', df, 'real', p_counted, 'book', b); end if;
  if jsonb_array_length(items) = 0 then return jsonb_build_object('items', '[]'::jsonb, 'entries', '[]'::jsonb); end if;

  select count(*) into emp_n from public.pr_employees where active and lower(split_part(trim(name), ' ', 1)) = lower(split_part(trim(d.worker), ' ', 1));
  if emp_n = 1 then
    select id into emp from public.pr_employees where active and lower(split_part(trim(name), ' ', 1)) = lower(split_part(trim(d.worker), ' ', 1));
  end if;

  for x in select * from jsonb_array_elements(items) loop
    df := (x->>'diff')::numeric;
    insert into public.pr_cash_issues (biz_date, stage, acct, amount, counted, expected, counted_by, status, handover, kind, emp_id, checker, on_duty)
    values (p_date, p_stage, x->>'acct', abs(df), (x->>'real')::numeric, (x->>'book')::numeric, d.worker,
            case when df > 0 and emp is null then 'noted' when emp is null then 'open' else 'wait_emp' end,
            true, case when df < 0 then 'short' else 'over' end, emp, me, '{}')
    returning id into iss;
    insert into public.entries (biz_date, kind, amount, from_acct, to_acct, ref, details, staff_name, created_by, handover_id)
    values (p_date, 'adjust', abs(df), case when df < 0 then x->>'acct' end, case when df > 0 then x->>'acct' end, 'handover',
            '교대 확인 ' || case when df < 0 then '부족' else '초과' end || ' → ' || d.worker || ' 책임 · 확인 ' || coalesce(me, '')
              || ' / handover ' || case when df < 0 then 'short' else 'over' end || ' (' || d.worker || ')',
            me, auth.uid(), iss)
    returning * into ent;
    update public.pr_cash_issues set adjust_id = ent.id where id = iss;
    ents := ents || to_jsonb(ent);
    lines := lines || E'\n' || public.cb_acct_ko(x->>'acct') || ' ' || case when df < 0 then '−' else '+' end || '₱' || to_char(abs(df), 'FM999,999,990.00');
  end loop;

  perform public.pr_notify('🔁 교대 확인 차이 · ' || to_char(p_date, 'MM/DD') || ' ' || case when p_stage = 'mid' then '중간마감' else '마감' end
    || lines || E'\n근무자 ' || d.worker || ' 책임 · 확인 ' || coalesce(me, '')
    || case when emp is null then E'\n⚠️ 급여 앱 직원을 못 찾음 → 급여 앱에서 직접 지정' else E'\n근무자가 급여 앱에서 이유 / 급여 차감 / 채우기를 골라요' end);
  return jsonb_build_object('items', items, 'entries', ents, 'worker', d.worker);
end $function$;
revoke all on function public.cb_handover(date, text, numeric) from public, anon;
grant execute on function public.cb_handover(date, text, numeric) to authenticated;

-- ---------- 캐시북: 채움 대기 목록 / 받았어요 ----------
create or replace function public.cb_fill_list()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.is_staff() then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'biz_date', biz_date, 'stage', stage, 'acct', acct, 'amount', amount, 'worker', counted_by,
      'at', emp_at) order by emp_at) from public.pr_cash_issues where status = 'wait_fill'), '[]'::jsonb);
end $$;
revoke all on function public.cb_fill_list() from public, anon;
grant execute on function public.cb_fill_list() to authenticated;

create or replace function public.cb_fill_confirm(p_issue uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare me text; i public.pr_cash_issues; ent public.entries;
begin
  if not public.is_staff() then raise exception 'NO_PERMISSION'; end if;
  select name into me from public.staff where user_id = auth.uid();
  select * into i from public.pr_cash_issues where id = p_issue for update;
  if not found or i.status <> 'wait_fill' then raise exception 'ALREADY_DONE'; end if;
  if not public.is_owner() and lower(trim(coalesce(me, ''))) = lower(trim(coalesce(i.counted_by, ''))) then
    raise exception '본인이 채운 돈은 다른 직원이 확인해야 해요 / Another staff member must confirm the money';
  end if;
  insert into public.entries (biz_date, kind, amount, to_acct, ref, details, staff_name, created_by, handover_id)
  values (public.cb_today(), 'adjust', i.amount, i.acct, 'fill',
          '부족분 채움 · ' || i.counted_by || ' (' || to_char(i.biz_date, 'MM/DD') || ' ' || case when i.stage = 'mid' then '중간마감' else '마감' end
            || ') · 받은 사람 ' || coalesce(me, '') || ' / shortage refilled', me, auth.uid(), i.id)
  returning * into ent;
  update public.pr_cash_issues set status = 'filled', fill_by = me, fill_at = now(), fill_entry_id = ent.id where id = i.id;
  perform public.pr_notify('💵 부족분 채움 확인 · ' || public.cb_issue_label(i) || E'\n' || i.counted_by || ' → 받은 사람 ' || coalesce(me, ''));
  return to_jsonb(ent);
end $$;
revoke all on function public.cb_fill_confirm(uuid) from public, anon;
grant execute on function public.cb_fill_confirm(uuid) to authenticated;

-- ---------- 급여 앱 직원: 내 차이 목록 / 답하기 ----------
create or replace function public.pr_emp_cash_list(p_no text, p_pin text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare c record;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then raise exception '%', c.err; end if;
  return coalesce((select jsonb_agg(to_jsonb(i) - 'suspects' - 'on_duty' order by i.created_at desc) from public.pr_cash_issues i
    where i.emp_id = c.emp_id and i.handover and (i.status in ('wait_emp','wait_owner','wait_fill') or i.created_at > now() - interval '30 days')), '[]'::jsonb);
end $$;
revoke all on function public.pr_emp_cash_list(text, text) from public;
grant execute on function public.pr_emp_cash_list(text, text) to anon, authenticated;

create or replace function public.pr_emp_cash_answer(p_no text, p_pin text, p_issue uuid, p_choice text, p_reason text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare c record; i public.pr_cash_issues; e public.pr_employees; lid uuid; rs text := nullif(trim(coalesce(p_reason, '')), ''); today date := (now() at time zone 'Asia/Manila')::date;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then raise exception '%', c.err; end if;
  select * into e from public.pr_employees where id = c.emp_id;
  select * into i from public.pr_cash_issues where id = p_issue and emp_id = c.emp_id and handover for update;
  if not found or i.status <> 'wait_emp' then raise exception 'ALREADY_DONE'; end if;

  if p_choice = 'reason' then
    if i.owner_decided then raise exception 'OWNER_DECIDED'; end if;
    if rs is null or length(rs) < 2 then raise exception 'NEED_REASON'; end if;
    update public.pr_cash_issues set emp_choice = 'reason', emp_reason = rs, emp_at = now(),
      status = case when i.kind = 'over' then 'noted' else 'wait_owner' end where id = i.id;
    perform public.pr_notify(case when i.kind = 'over' then '📝 초과 이유 · ' else '📝 부족 이유 (결정 필요) · ' end || public.cb_issue_label(i)
      || E'\n' || e.name || ': ' || rs || case when i.kind = 'over' then '' else E'\n👉 급여 앱 → 가불·부족분·보너스 → 면제 / 직원 부담' end);
  elsif p_choice = 'unknown' and i.kind = 'over' then
    update public.pr_cash_issues set emp_choice = 'unknown', emp_reason = '이유 모름', emp_at = now(), status = 'noted' where id = i.id;
  elsif p_choice = 'deduct' and i.kind = 'short' then
    insert into public.pr_ledger (employee_id, kind, biz_date, amount, note, note_en, verified, authorized, self_req_at)
    values (e.id, 'shortage', today, i.amount,
      '캐시북 ' || public.cb_issue_label(i) || ' · 교대 확인 ' || coalesce(i.checker, '') || ' · 본인 선택: 급여 차감 (' || to_char(now() at time zone 'Asia/Manila', 'YYYY-MM-DD HH24:MI') || ')',
      'Cash Book ' || to_char(i.biz_date, 'MM/DD') || ' ' || case when i.stage = 'mid' then 'mid-close' else 'close' end || ' '
        || case i.acct when 'GCASH' then 'GCash' when 'MAYA' then 'Maya' else 'cash' end || ' short ₱' || to_char(i.amount, 'FM999,999,990.00')
        || ' · checked by ' || coalesce(i.checker, '') || ' · employee chose salary deduction (' || to_char(now() at time zone 'Asia/Manila', 'YYYY-MM-DD HH24:MI') || ')',
      true, true, now())
    returning id into lid;
    update public.pr_cash_issues set emp_choice = 'deduct', emp_reason = coalesce(rs, emp_reason), emp_at = now(), status = 'assigned', ledger_id = lid where id = i.id;
    perform public.pr_notify('💸 급여 차감 선택 · ' || public.cb_issue_label(i) || E'\n' || e.name || ' (본인 동의)');
  elsif p_choice = 'fill' and i.kind = 'short' then
    update public.pr_cash_issues set emp_choice = 'fill', emp_reason = coalesce(rs, emp_reason), emp_at = now(), status = 'wait_fill' where id = i.id;
    perform public.pr_notify('💵 바로 채우기 선택 · ' || public.cb_issue_label(i) || E'\n' || e.name || ' → 캐시북에서 받은 직원이 확인');
  else
    raise exception 'BAD_CHOICE';
  end if;
  return (select to_jsonb(x) - 'suspects' - 'on_duty' from public.pr_cash_issues x where id = i.id);
end $$;
revoke all on function public.pr_emp_cash_answer(text, text, uuid, text, text) from public;
grant execute on function public.pr_emp_cash_answer(text, text, uuid, text, text) to anon, authenticated;

-- ---------- 사장님: 이유 보고 결정 / 직원 지정 ----------
create or replace function public.pr_cash_owner_decide(p_issue uuid, p_decision text, p_note text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare i public.pr_cash_issues;
begin
  if not public.is_owner() then raise exception 'NO_PERMISSION'; end if;
  select * into i from public.pr_cash_issues where id = p_issue for update;
  if not found or i.status <> 'wait_owner' then raise exception 'ALREADY_DONE'; end if;
  if p_decision = 'waive' then
    update public.pr_cash_issues set status = 'dismissed', resolved_note = nullif(trim(coalesce(p_note, '')), '') where id = i.id;
  elsif p_decision = 'charge' then
    update public.pr_cash_issues set status = 'wait_emp', owner_decided = true, resolved_note = nullif(trim(coalesce(p_note, '')), '') where id = i.id;
  else raise exception 'BAD_DECISION'; end if;
end $$;
revoke all on function public.pr_cash_owner_decide(uuid, text, text) from public, anon;
grant execute on function public.pr_cash_owner_decide(uuid, text, text) to authenticated;

create or replace function public.pr_cash_handover_assign(p_issue uuid, p_employee uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare i public.pr_cash_issues;
begin
  if not public.is_owner() then raise exception 'NO_PERMISSION'; end if;
  select * into i from public.pr_cash_issues where id = p_issue for update;
  if not found or not i.handover or i.status <> 'open' then raise exception 'ALREADY_DONE'; end if;
  update public.pr_cash_issues set emp_id = p_employee, status = 'wait_emp' where id = i.id;
end $$;
revoke all on function public.pr_cash_handover_assign(uuid, uuid) from public, anon;
grant execute on function public.pr_cash_handover_assign(uuid, uuid) to authenticated;

-- owner's pending bar: reasons waiting for a decision count too
create or replace function public.pr_pending_raw()
returns jsonb language sql stable security definer set search_path = public as $function$
  select jsonb_build_object(
    'leave', (select count(distinct coalesce(grp::text, id::text)) from public.pr_sil_req where status = 'pending'),
    'punch', (select count(*) from public.pr_punches where status = 'pending'),
    'cash',  (select count(*) from public.pr_cash_issues where status in ('open', 'wait_owner')),
    'recv',  (select count(*) from public.pr_payrolls where recv_at is not null and recv_ok_at is null)
           + (select count(*) from public.pr_13_ack a where a.recv_at is not null and a.recv_ok_at is null)) $function$;
