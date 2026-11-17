-- 현금·세이빙박스 센타보 버림 (사장님 2026-11-17)
-- 지폐·동전 장수로만 세니까, 현금(CASH)·세이빙박스(SAVINGBOX)는 장부 금액의 센타보를 버리고(trunc) 비교한다.
-- GCash·Maya 잔고는 그대로 센타보까지 비교. 앱(cashbook app.js pesoDown)과 같은 규칙.
create or replace function public.peso_down(x numeric) returns numeric language sql immutable as $$ select trunc(round(coalesce(x, 0), 2)) $$;

create or replace function public.box_count_problem(p_date date, p_box numeric)
 returns text language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if p_box is null then
    return '세이빙박스 Saving box: 센 금액 없음 / counted saving box missing';
  end if;
  if abs(p_box - public.peso_down(public.book_at(p_date, 'SAVINGBOX', now()))) >= 0.01 then
    return '세이빙박스 Saving box: 장부와 달라요 — 다시 세세요 / does not match the book — count again';
  end if;
  return null;
end $function$;

create or replace function public.checkpoint_guard()
 returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare probs text[]; who uuid := coalesce(auth.uid(), new.created_by); bk numeric; bp text;
begin
  if public.is_owner_id(who) then return new; end if;
  perform public.close_worker_block(new.biz_date, new.stage, who);
  probs := public.close_problems(new.biz_date, new.stage);
  bk := public.peso_down(case when new.stage = 'mid' then public.book_at(new.biz_date, 'CASH', now()) else new.expected end);
  if new.counted is null then
    probs := probs || '현금 Cash: 센 금액 없음 / counted cash missing'::text;
  elsif bk is not null and abs(new.counted - bk) >= 0.01 then
    probs := probs || ('현금 Cash: 차이 ' || to_char(new.counted - bk, 'FMS999,999,990.00')
                       || ' (센 금액 ' || to_char(new.counted, 'FM999,999,990.00') || ' / 장부 ' || to_char(bk, 'FM999,999,990.00') || ')');
  end if;
  if new.stage = 'final' then
    if not exists (select 1 from public.entries where biz_date = new.biz_date and kind = 'savingbox') then
      bp := public.box_count_problem(new.biz_date, new.box_counted);
      if bp is not null then probs := probs || bp; end if;
    end if;
  end if;
  perform public.close_verdict2(probs, new.diff_note, new.diff_notes,
    case when new.stage = 'mid' then '중간마감 불가 / Mid-close blocked: ' else '마감 불가 / Close blocked: ' end);
  return new;
end $function$;

create or replace function public.close_move_guard()
 returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare probs text[]; who uuid := coalesce(auth.uid(), new.created_by); bp text; ex numeric;
begin
  if new.kind <> 'savingbox' or public.is_owner_id(who) then return new; end if;
  perform public.close_worker_block(new.biz_date, 'final', who);
  probs := public.close_problems(new.biz_date, 'final');
  ex := case when new.expected is null then null else public.peso_down(new.expected) end;
  if new.counted is null then
    probs := probs || '현금 Cash: 센 금액 없음 / counted cash missing'::text;
  elsif ex is not null and abs(new.counted - ex) >= 0.01 then
    probs := probs || ('현금 Cash: 차이 ' || to_char(new.counted - ex, 'FMS999,999,990.00')
                       || ' (센 금액 ' || to_char(new.counted, 'FM999,999,990.00') || ' / 장부 ' || to_char(ex, 'FM999,999,990.00') || ')');
  end if;
  bp := public.box_count_problem(new.biz_date, new.box_counted);
  if bp is not null then probs := probs || bp; end if;
  perform public.close_verdict2(probs, new.diff_note, new.diff_notes, '마감 불가 / Close blocked: ');
  return new;
end $function$;

-- 경고·부족분 기록도 센타보는 차이로 안 봄
create or replace function public.close_alert()
 returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare who uuid := coalesce(auth.uid(), new.created_by);
begin
  if new.kind = 'savingbox' and new.counted is not null and new.expected is not null
     and abs(new.counted - public.peso_down(new.expected)) >= 0.01
     and (tg_op = 'INSERT' or new.counted is distinct from old.counted or new.expected is distinct from old.expected) then
    insert into public.alerts (biz_date, account, kind, book, actual, diff, source_id, actor, actor_name)
    values (new.biz_date, 'CASH', 'close_count', new.expected, new.counted, new.counted - public.peso_down(new.expected), new.id, who,
            coalesce(new.staff_name, (select name from public.staff where user_id = who)));
  end if;
  return new;
end $function$;

create or replace function public.mid_alert()
 returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare who uuid := coalesce(auth.uid(), new.created_by);
begin
  if new.stage = 'mid' and new.counted is not null and new.expected is not null
     and abs(new.counted - public.peso_down(new.expected)) >= 0.01 then
    insert into public.alerts (biz_date, account, kind, book, actual, diff, source_id, actor, actor_name)
    values (new.biz_date, 'CASH', 'mid_count', new.expected, new.counted, new.counted - public.peso_down(new.expected), new.id, who,
            coalesce(new.staff_name, (select name from public.staff where user_id = who)));
  end if;
  return new;
end $function$;

create or replace function public.pr_cash_issue_from_checkpoint()
 returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare duty text[]; ex numeric;
begin
  ex := case when new.expected is null then null else public.peso_down(new.expected) end;
  if new.counted is not null and ex is not null and new.counted < ex - 0.01 then
    select coalesce(array_agg(coalesce(s.staff_name, st.name) || ' ' || s.shift order by s.shift), '{}') into duty
      from public.shifts s left join public.staff st on st.user_id = s.user_id
     where s.day = new.biz_date and s.shift is not null and s.shift <> 'off';
    insert into public.pr_cash_issues (checkpoint_id, acct, biz_date, stage, amount, counted, expected, reason, counted_by, on_duty)
    values (new.id, 'CASH', new.biz_date, new.stage, round(ex - new.counted, 2), new.counted, ex,
            coalesce(new.diff_notes->>'CASH', new.diff_note), new.staff_name, duty)
    on conflict (checkpoint_id, acct) do nothing;
  end if;
  perform public.pr_cash_issue_wallets(new.id);
  return new;
end $function$;

-- 교대 확인 차이 넘기기: 현금·박스 차이도 센타보 버린 장부와 비교 (pr_cash_handover.sql / pr_cash_box_count.sql의 cb_handover 패치)
do $$
declare d text := pg_get_functiondef('public.cb_handover(date,text,numeric,numeric)'::regprocedure);
begin
  if position('peso_down' in d) = 0 then
    d := replace(d, $q$b := public.book_at(p_date, 'CASH', now());$q$, $q$b := public.peso_down(public.book_at(p_date, 'CASH', now()));$q$);
    d := replace(d, $q$b := public.book_at(p_date, 'SAVINGBOX', now());$q$, $q$b := public.peso_down(public.book_at(p_date, 'SAVINGBOX', now()));$q$);
    if (length(d) - length(replace(d, 'peso_down', ''))) / length('peso_down') <> 2 then raise exception 'cb_handover patch did not match'; end if;
    execute d;
  end if;
end $$;
