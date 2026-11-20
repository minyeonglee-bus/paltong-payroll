-- 캐시북 직원 지출 사진 · Fuel(유류비) 규칙 (사장님 2026-11-21)
--  • 직원 지출(staff)도 사진(영수증)을 찍을 수 있음 (앱).
--  • Fuel은 사진 필수 + 영수증 날짜·시간 필수.
--  • 영수증 시간이 받는 직원(vendor)의 급여 앱 스케줄(pr_plan) 근무 시간 안이면 등록, 아니면 반려(저장 안 됨).
--    직원 목록에 없는 이름(예: Hataw 외부 기사)은 스케줄 확인 없이 사진·시간만 필수.
--  • 사장님 계정은 예외 (지난 기록 정리용). 이미 있는 줄을 고칠 때는 vendor·영수증·사진·종류가 바뀔 때만 다시 검사.

-- vendor 이름 → 직원 (이름·풀네임 첫 단어 정확히 같으면 우선, 아니면 앞 3글자가 한 명만 맞을 때)
create or replace function public.cb_emp_for(p_vendor text, p_day date)
returns public.pr_employees language plpgsql stable security definer set search_path = public as $$
declare v text := lower(regexp_replace(coalesce(p_vendor, ''), '[^A-Za-z]', '', 'g')); r public.pr_employees; n int;
begin
  if v = '' then return null; end if;
  select * into r from public.pr_employees e
   where (e.resigned_on is null or e.resigned_on >= p_day)
     and v in (lower(regexp_replace(e.name, '[^A-Za-z]', '', 'g')),
               lower(regexp_replace(split_part(coalesce(e.info->>'full_name', ''), ' ', 1), '[^A-Za-z]', '', 'g')),
               lower(regexp_replace(coalesce(e.info->>'full_name', ''), '[^A-Za-z]', '', 'g')))
   order by e.emp_no limit 1;
  if found then return r; end if;
  if length(v) < 3 then return null; end if;
  select count(*) into n from public.pr_employees e
   where (e.resigned_on is null or e.resigned_on >= p_day) and public.pr_adv_name_key(e.name) = left(v, 3);
  if n <> 1 then return null; end if;
  select * into r from public.pr_employees e
   where (e.resigned_on is null or e.resigned_on >= p_day) and public.pr_adv_name_key(e.name) = left(v, 3);
  return r;
end $$;

-- 영수증 시각이 그 직원 스케줄 안인지. 전날 야간(22-8 등)도 봄. shift "a-b": a시 시작, b<=a 이면 다음날 b시 (5-32 = 다음날 8시)
create or replace function public.cb_fuel_check(p_vendor text, p_date date, p_time time)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e public.pr_employees; ts timestamp := p_date + p_time; r record; a int; b int; s timestamp; f timestamp; list text := '';
begin
  e := public.cb_emp_for(p_vendor, p_date);
  if e.id is null then return jsonb_build_object('ok', true, 'reason', 'NO_EMP'); end if;
  for r in select day, shift from public.pr_plan where employee_id = e.id and day in (p_date - 1, p_date) order by day loop
    list := list || case when list = '' then '' else ' · ' end || to_char(r.day, 'MM/DD') || ' ' || coalesce(r.shift, '-');
    if r.shift ~ '^\d{1,2}-\d{1,2}$' then
      a := split_part(r.shift, '-', 1)::int; b := split_part(r.shift, '-', 2)::int;
      if b <= a then b := b + 24; end if;
      s := r.day + make_interval(hours => a); f := r.day + make_interval(hours => b);
      if ts between s and f then
        return jsonb_build_object('ok', true, 'reason', 'IN_SHIFT', 'emp', e.name, 'shifts', list || '');
      end if;
    end if;
  end loop;
  return jsonb_build_object('ok', false, 'reason', case when list = '' then 'NO_PLAN' else 'OUTSIDE' end, 'emp', e.name, 'shifts', list);
end $$;
grant execute on function public.cb_fuel_check(text, date, time) to authenticated;

create or replace function public.cb_fuel_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare c jsonb;
begin
  if new.kind <> 'staff' or coalesce(new.note, '') <> 'fuel' or public.is_owner() then return new; end if;
  if tg_op = 'UPDATE' and old.kind = new.kind and old.note is not distinct from new.note and old.vendor is not distinct from new.vendor
     and old.receipt_date is not distinct from new.receipt_date and old.receipt_time is not distinct from new.receipt_time
     and old.photo_path is not distinct from new.photo_path then return new; end if;
  if new.photo_path is null then raise exception 'FUEL_PHOTO_REQUIRED: fuel needs a receipt photo'; end if;
  if new.receipt_date is null or new.receipt_time is null then raise exception 'FUEL_TIME_REQUIRED: enter the receipt date and time'; end if;
  c := public.cb_fuel_check(new.vendor, new.receipt_date, new.receipt_time);
  if not (c->>'ok')::boolean then
    raise exception 'FUEL_OUTSIDE_SHIFT: % % % is outside % schedule (%)', new.vendor, new.receipt_date, to_char(new.receipt_time, 'HH24:MI'), c->>'emp', coalesce(nullif(c->>'shifts', ''), 'none');
  end if;
  return new;
end $$;
drop trigger if exists cb_fuel_guard on public.entries;
create trigger cb_fuel_guard before insert or update on public.entries
  for each row execute function public.cb_fuel_guard();
