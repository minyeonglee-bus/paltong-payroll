-- 퇴사 처리 (2026-10-29, migration pr_resign_access)
-- 퇴사일(resigned_on)을 넣고 "재직 중"을 끄면 급여·스케줄 목록에서는 빠지지만,
-- 직원 본인 로그인은 그 해 13th month 지급일 + 7일까지 열려 있어요 (명세서·13th 확인용).
-- 그 뒤에는 로그인이 막혀요 (err = 'closed'). 퇴사일 이후 출퇴근 버튼은 막혀요 (err = 'resigned').
alter table public.pr_employees add column if not exists resigned_on date;

-- 직원 로그인 마감일: 퇴사한 해 13th month 지급일 + 7일 (아직 미지급이면 null = 계속 열림)
create or replace function public.pr_emp_access_until(p_id uuid)
 returns date language sql stable security definer set search_path to 'public'
as $function$
  select x.paid_on + 7
    from public.pr_employees e
    join public.pr_thirteenth x on x.employee_id = e.id and x.year = extract(year from e.resigned_on)::int
   where e.id = p_id and e.resigned_on is not null and x.paid_on is not null
$function$;
grant execute on function public.pr_emp_access_until(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.pr_emp_check(p_no text, p_pin text, OUT emp_id uuid, OUT err text, OUT must_change boolean)
 RETURNS record
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare e public.pr_employees; n int; until date;
begin
  select * into e from public.pr_employees where emp_no = trim(p_no) and (active or resigned_on is not null);
  if not found then err := 'wrong'; return; end if;
  if e.pin_locked_until is not null and e.pin_locked_until > now() then err := 'locked'; return; end if;
  if (e.pin_hash is null and p_pin = '0000') or (e.pin_hash is not null and e.pin_hash = crypt(coalesce(p_pin, ''), e.pin_hash)) then
    if e.resigned_on is not null then
      until := public.pr_emp_access_until(e.id);
      if until is not null and (now() at time zone 'Asia/Manila')::date > until then err := 'closed'; return; end if;
    end if;
    update public.pr_employees set pin_fails = 0, pin_locked_until = null where id = e.id;
    emp_id := e.id; must_change := e.pin_hash is null; return;
  end if;
  n := e.pin_fails + 1;
  update public.pr_employees set pin_fails = case when n >= 5 then 0 else n end,
         pin_locked_until = case when n >= 5 then now() + interval '10 minutes' else null end
   where id = e.id;
  err := 'wrong';
end $function$;

-- 출퇴근: 퇴사일 이후는 막기
create or replace function public.pr_punch(p_no text, p_pin text, p_kind text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
declare c record; last_k text; last_at timestamptz; ts timestamptz := now(); r date;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  if c.must_change then return jsonb_build_object('ok', false, 'err', 'must_change'); end if;
  select resigned_on into r from public.pr_employees where id = c.emp_id;
  if r is not null and (ts at time zone 'Asia/Manila')::date > r then return jsonb_build_object('ok', false, 'err', 'resigned'); end if;
  if p_kind not in ('in','out') then return jsonb_build_object('ok', false, 'err', 'kind'); end if;
  select kind, punched_at into last_k, last_at from public.pr_punches where employee_id = c.emp_id order by punched_at desc limit 1;
  if last_k = p_kind and last_at > ts - interval '2 minutes' then return jsonb_build_object('ok', true, 'dup', true); end if;
  insert into public.pr_punches (employee_id, kind, punched_at, source) values (c.emp_id, p_kind, ts, 'app');
  return jsonb_build_object('ok', true, 'at', ts);
end $function$;
grant execute on function public.pr_punch(text, text, text) to anon, authenticated;
