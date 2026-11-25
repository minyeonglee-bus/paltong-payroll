-- 현금 지급 영수증 센타보 버림 (사장님 2026-11-26 04:39 "영수증 처리 현금 지급 시 1 미만 숫자는 버려달라 했는데").
-- pr_cash_cents.sql(11/17)은 마감 때 "장부 합계"의 센타보만 버렸고, 줄마다 금액은 그대로 둬서
-- 11/25 June 유류비 ₱120.06 (CASH)이 그대로 들어감 → 서랍(₱120 줌)과 장부가 ₱0.06 어긋남.
-- 이제 현금·세이빙박스로 나가는 돈(지출 expense · 직원 staff)은 저장할 때 1 미만을 버림 (₱120.06 → ₱120).
-- GCash · Maya는 센타보까지 그대로 (실제로 센타보까지 나감). 원래 금액은 details 끝에 남김.
create or replace function public.cash_out_peso_down()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.kind in ('expense', 'staff') and new.account in ('CASH', 'SAVINGBOX') and new.amount is not null and new.amount <> trunc(new.amount) then
    new.details := left(concat_ws(' ', nullif(new.details, ''), '(receipt ₱' || to_char(new.amount, 'FM999999990.00') || ' → ₱' || trunc(new.amount)::text || ', centavos dropped)'), 500);
    new.amount := trunc(new.amount);
  end if;
  return new;
end $$;
drop trigger if exists a_cash_out_peso_down on public.entries;
create trigger a_cash_out_peso_down before insert or update of amount, account, kind on public.entries
  for each row execute function public.cash_out_peso_down();
