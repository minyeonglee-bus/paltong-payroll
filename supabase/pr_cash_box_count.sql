-- 세이빙박스도 하루 마감 때 세기 (사장님 2026-11-16: "오늘 장사부터는 정확히")
-- 11/16부터 이전 것은 0으로 리셋한 상태에서 시작 (정산 기록은 11/15로 옮김, 11/16 시작 = 현금 시재 30,000 · 나머지 0).
-- 하루 마감: 돈을 옮기기 전에 세이빙박스를 세서 입력 → 장부 박스와 1페소라도 다르면 직원은 마감 불가.
-- 교대 확인 "차이 넘기기"에 세이빙박스 차이도 포함 (근무자 책임 · 급여 앱 연동 그대로).
alter table public.entries add column if not exists box_counted numeric;
alter table public.checkpoints add column if not exists box_counted numeric;

create or replace function public.cb_acct_ko(a text) returns text language sql immutable as $$
  select case a when 'GCASH' then 'GCash' when 'MAYA' then 'Maya' when 'METROBANK' then 'Metrobank' when 'SAVINGBOX' then '세이빙박스' else '현금' end $$;

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
  -- 세이빙박스: 옮기기 전에 센 금액 = 지금 장부 박스 (2026-11-16)
  if new.box_counted is null then
    probs := probs || '세이빙박스 Saving box: 센 금액 없음 / counted saving box missing'::text;
  elsif abs(new.box_counted - public.book_at(new.biz_date, 'SAVINGBOX', now())) >= 0.01 then
    probs := probs || ('세이빙박스 Saving box: 차이 ' || to_char(new.box_counted - public.book_at(new.biz_date, 'SAVINGBOX', now()), 'FMS999,999,990.00')
                       || ' (센 금액 ' || to_char(new.box_counted, 'FM999,999,990.00') || ' / 장부 ' || to_char(public.book_at(new.biz_date, 'SAVINGBOX', now()), 'FM999,999,990.00') || ')');
  end if;
  perform public.close_verdict2(probs, new.diff_note, new.diff_notes, '마감 불가 / Close blocked: ');
  return new;
end $function$;

drop function if exists public.cb_handover(date, text, numeric);
create or replace function public.cb_handover(p_date date, p_stage text, p_counted numeric, p_box numeric default null)
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
  -- 하루 마감: 세이빙박스도 교대자가 세서 비교 (옮기기 전 금액)
  if p_stage = 'final' then
    if p_box is null then raise exception '세이빙박스를 세어서 입력하세요 / Count the saving box'; end if;
    b := public.book_at(p_date, 'SAVINGBOX', now()); df := round(p_box - b, 2);
    if abs(df) >= 0.01 then items := items || jsonb_build_object('acct', 'SAVINGBOX', 'diff', df, 'real', p_box, 'book', b); end if;
  end if;
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
revoke all on function public.cb_handover(date, text, numeric, numeric) from public, anon;
grant execute on function public.cb_handover(date, text, numeric, numeric) to authenticated;
