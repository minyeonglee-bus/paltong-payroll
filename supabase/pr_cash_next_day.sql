-- 💰 다음날로 넘어간 수익 — GCash·Maya 마감 사진 초과(+) 무시 (사장님 2026-11-26 10:41~10:46)
--
-- 하루 마감 사진은 다음날 아침에 찍어서, 그 전에 들어온 다음 영업일 매출(주문 사이트가 자동으로 다음날 날짜로 기록)이
-- 지갑엔 이미 있음 → 장부보다 그 금액 그대로 +로 나옴 (11/25 마감 GCash +1,240 = 11/26 08:02 DK ₱1,240).
-- 비교할 때 "사진 찍은 시각까지 들어온 다음날 기록"을 장부에 더함 → 그만큼의 +는 차이 아님. 다른 금액이면 그대로 차이.
-- 적용: close_problems(중간마감·마감 막기) · pr_wallet_short(부족분) · cb_handover(교대 확인 넘기기). 앱 realCheck도 같음 (cashbook nextDayAdj).

create or replace function public.next_day_adj(p_date date, p_acct text, p_ts timestamptz)
returns numeric language sql stable security definer set search_path to 'public' as $$
  select coalesce(sum(case
           when kind = 'sale' and account = p_acct then amount
           when kind = 'expense' and account = p_acct then -amount
           when kind = 'staff' and account = p_acct then -(amount + coalesce(fee, 0))
           when kind = 'savingbox' and p_acct = 'CASH' then case when from_acct = 'SAVINGBOX' then amount else -amount end
           when kind = 'savingbox' and p_acct = 'SAVINGBOX' then case when from_acct = 'SAVINGBOX' then -amount else amount end
           when kind in ('transfer','adjust') then (case when to_acct = p_acct then amount else 0 end)
                                                 - (case when from_acct = p_acct then amount + coalesce(fee, 0) else 0 end)
           else 0 end), 0)
    from public.entries
   where biz_date = p_date + 1 and created_at <= p_ts $$;

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
      b := public.book_at(p_date, a, r.created_at) + public.handover_adj(p_date, a, r.created_at, now()) + public.next_day_adj(p_date, a, r.created_at);
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
  book := public.book_at(c.biz_date, p_acct, r.created_at) + public.handover_adj(c.biz_date, p_acct, r.created_at, c.created_at) + public.next_day_adj(c.biz_date, p_acct, r.created_at);
  short := round(book - r.amount, 2);
end $function$;

-- cb_handover: 지갑 비교 줄에 next_day_adj 추가 (함수 본문은 pr_cash_handover.sql 그대로, 이 한 줄만 바뀜)
do $$
declare src text;
begin
  src := pg_get_functiondef('public.cb_handover(date, text, numeric, numeric)'::regprocedure);
  if position('next_day_adj' in src) = 0 then
    src := replace(src, 'b := public.book_at(p_date, a, r.created_at) + public.handover_adj(p_date, a, r.created_at, now());',
                        'b := public.book_at(p_date, a, r.created_at) + public.handover_adj(p_date, a, r.created_at, now()) + public.next_day_adj(p_date, a, r.created_at);');
    if position('next_day_adj' in src) = 0 then raise exception 'cb_handover line not found'; end if;
    execute src;
  end if;
end $$;
