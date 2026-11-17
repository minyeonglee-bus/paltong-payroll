-- 세이빙박스 확인 나누기 (사장님 2026-11-17)
-- 1) 홀 직원 하루 마감: 박스 전체는 안 셈. 오늘 박스에 넣는(꺼내는) 돈만 장수로 세서 이동 금액과 맞으면 마감 (앱에서 확인).
--    → box_count_problem: 박스 센 금액이 없으면 문제 아님 (넣었으면 장부와 비교). cb_handover: 박스 없으면 건너뜀.
-- 2) Mina (권한 box_check): 박스 장부 총액을 보고 전부 세서 맞으면 "박스 확인" (cb_box_check).
-- 3) 박스 확인까지 끝난 날(마감된 날 중 upto_date 이하)은 관리자만 고칠 수 있음 (entries · real_balances · checkpoints).

-- 권한: Mina에게 box_check
update public.staff set perms = coalesce(perms, '{}'::jsonb) || '{"box_check": true}' where name = 'Mina';

create table if not exists public.box_checks (
  id uuid primary key default gen_random_uuid(),
  checked_at timestamptz not null default now(),
  checked_by text,
  user_id uuid,
  upto_date date,
  book numeric not null,
  counted numeric not null,
  denoms jsonb
);
alter table public.box_checks enable row level security;
drop policy if exists box_checks_read on public.box_checks;
create policy box_checks_read on public.box_checks for select using (public.is_staff());
grant select on public.box_checks to authenticated;

-- 박스 확인으로 잠긴 마지막 날 (마감된 날 중)
create or replace function public.box_locked_through() returns date language sql stable security definer set search_path to 'public' as $$
  select max(upto_date) from public.box_checks $$;
create or replace function public.box_locked(p_date date) returns boolean language sql stable security definer set search_path to 'public' as $$
  select p_date is not null and p_date <= coalesce(public.box_locked_through(), date '0001-01-01')
     and exists (select 1 from public.checkpoints where biz_date = p_date and stage = 'final') $$;

create or replace function public.cb_box_check(p_counted numeric, p_denoms jsonb default null)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare me text; bk numeric; upto date; r public.box_checks;
begin
  if not (public.is_owner() or public.has_perm('box_check')) then raise exception 'NO_PERMISSION: 세이빙박스 확인 권한이 없어요 / No permission'; end if;
  if p_counted is null then raise exception '박스를 세어서 입력하세요 / Count the saving box'; end if;
  select name into me from public.staff where user_id = auth.uid();
  bk := public.peso_down(public.book_at(public.cb_today(), 'SAVINGBOX', now()));
  if abs(p_counted - bk) >= 0.01 then
    perform public.pr_notify('⚠️ 세이빙박스 확인 — 안 맞음 · ' || coalesce(me, '') || E'\n센 금액 ₱' || to_char(p_counted, 'FM999,999,990') || ' / 장부 ₱' || to_char(bk, 'FM999,999,990')
      || ' (' || case when p_counted < bk then '부족 ' else '초과 ' end || '₱' || to_char(abs(p_counted - bk), 'FM999,999,990') || ')');
    raise exception '장부와 달라요 (장부 ₱%) — 확인할 수 없어요. 관리자에게 연락하세요 / Does not match the book — contact the owner', to_char(bk, 'FM999,999,990');
  end if;
  select max(biz_date) into upto from public.checkpoints where stage = 'final' and biz_date <= public.cb_today();
  insert into public.box_checks (checked_by, user_id, upto_date, book, counted, denoms) values (me, auth.uid(), upto, bk, p_counted, p_denoms) returning * into r;
  perform public.pr_notify('🏦 세이빙박스 확인 ✓ · ' || coalesce(me, '') || E'\n₱' || to_char(bk, 'FM999,999,990') || ' 일치 · ' || coalesce(to_char(upto, 'MM/DD'), '-') || '까지 잠금 (관리자만 수정)');
  return to_jsonb(r);
end $function$;
grant execute on function public.cb_box_check(numeric, jsonb) to authenticated;

-- 잠금: 박스 확인까지 끝난 날은 관리자만
create or replace function public.box_lock_guard() returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if auth.uid() is null or public.is_owner() then return coalesce(new, old); end if;
  if (tg_op <> 'INSERT' and public.box_locked(old.biz_date)) or (tg_op <> 'DELETE' and public.box_locked(new.biz_date)) then
    raise exception '세이빙박스 확인까지 끝난 날이에요 — 관리자만 고칠 수 있어요 / Locked after the saving box check (%). Ask the owner.', coalesce(new.biz_date, old.biz_date);
  end if;
  return coalesce(new, old);
end $function$;
drop trigger if exists box_lock_guard_trg on public.entries;
create trigger box_lock_guard_trg before insert or update or delete on public.entries for each row execute function public.box_lock_guard();
drop trigger if exists box_lock_guard_trg on public.real_balances;
create trigger box_lock_guard_trg before insert or update or delete on public.real_balances for each row execute function public.box_lock_guard();
drop trigger if exists box_lock_guard_trg on public.checkpoints;
create trigger box_lock_guard_trg before insert or update or delete on public.checkpoints for each row execute function public.box_lock_guard();

-- 홀 직원: 박스 전체 숫자는 없어도 됨 (넣었으면 장부와 맞아야)
create or replace function public.box_count_problem(p_date date, p_box numeric)
 returns text language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if p_box is null then return null; end if;
  if abs(p_box - public.peso_down(public.book_at(p_date, 'SAVINGBOX', now()))) >= 0.01 then
    return '세이빙박스 Saving box: 장부와 달라요 — 다시 세세요 / does not match the book — count again';
  end if;
  return null;
end $function$;

-- 교대 확인 차이 넘기기: 박스 숫자가 없으면 박스는 건너뜀
do $$
declare d text := pg_get_functiondef('public.cb_handover(date,text,numeric,numeric)'::regprocedure);
  a text := $q$    if p_box is null then raise exception '세이빙박스를 세어서 입력하세요 / Count the saving box'; end if;
    b := public.peso_down(public.book_at(p_date, 'SAVINGBOX', now())); df := round(p_box - b, 2);
    if abs(df) >= 0.01 then items := items || jsonb_build_object('acct', 'SAVINGBOX', 'diff', df, 'real', p_box, 'book', b); end if;$q$;
  b text := $q$    if p_box is not null then
      b := public.peso_down(public.book_at(p_date, 'SAVINGBOX', now())); df := round(p_box - b, 2);
      if abs(df) >= 0.01 then items := items || jsonb_build_object('acct', 'SAVINGBOX', 'diff', df, 'real', p_box, 'book', b); end if;
    end if;$q$;
begin
  if position('if p_box is not null then' in d) = 0 then
    if position(a in d) = 0 then raise exception 'cb_handover box block not found'; end if;
    execute replace(d, a, b);
  end if;
end $$;

-- 앱 표시용: 지금 박스 장부(센타보 버림) · 마지막 확인 · 잠긴 날
create or replace function public.cb_box_status() returns jsonb language sql stable security definer set search_path to 'public' as $$
  select case when not public.is_staff() then null else jsonb_build_object(
    'book', public.peso_down(public.book_at(public.cb_today(), 'SAVINGBOX', now())),
    'locked_through', public.box_locked_through(),
    'last', (select to_jsonb(b) - 'denoms' - 'user_id' from public.box_checks b order by checked_at desc limit 1)) end $$;
grant execute on function public.cb_box_status() to authenticated;
