-- owner 2026-11-18
-- 1) early clock-out because of sickness: the owner marks it (pr_punches.mode = 'sick', status = 'approved', app button
--    "🤒 병가 조퇴 · 문제없음") → not an attendance problem for the birthday incentive. Pay still runs to the actual clock-out.
-- 2) sick / bereavement absence without proof: on hold for 7 days (proof can still be added, pr_emp_absence already allows
--    7 days); after that it is an unexcused absence automatically (app: absHold). Owner push text says so.

create or replace function public.pr_bday_check(p_emp uuid, p_bday date)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare e public.pr_employees; w0 date := (p_bday - interval '3 months')::date; w1 date := p_bday - 1; started date;
  n_late int; n_early int; bad_pay text; m date; half int; ps date; pe date; missing text := '';
begin
  select * into e from public.pr_employees where id = p_emp;
  started := coalesce(e.hired_on, (select min(period_start) from public.pr_payrolls where employee_id = p_emp));
  if started is null or started > w0 then
    return jsonb_build_object('ok', false, 'status', 'denied', 'w0', w0, 'w1', w1, 'reason', '3개월 근무 전 (시작 ' || coalesce(started::text, '기록 없음') || ')');
  end if;
  select count(*) filter (where kind = 'in' and dev_min > 0),
         count(*) filter (where kind = 'out' and dev_min < 0 and not (mode = 'sick' and status = 'approved')) into n_late, n_early
    from public.pr_punches where employee_id = p_emp and status <> 'void' and dev_min is not null
     and (punched_at at time zone 'Asia/Manila')::date between w0 and w1;
  select string_agg(to_char(p.period_start, 'MM/DD') || ' ' ||
           concat_ws(' ', case when coalesce((p.result->>'lateMinutes')::numeric, 0) > 0 then '지각 ' || (p.result->>'lateMinutes') || '분' end,
                          case when coalesce((p.result->>'absentDays')::numeric, 0) > 0 then '결근 ' || (p.result->>'absentDays') || '일' end), ', ')
    into bad_pay
    from public.pr_payrolls p
   where p.employee_id = p_emp and (p.status = 'paid' or p.shared_at is not null) and p.period_start <= w1 and p.period_end >= w0
     and (coalesce((p.result->>'lateMinutes')::numeric, 0) > 0 or coalesce((p.result->>'absentDays')::numeric, 0) > 0);
  if n_late > 0 or n_early > 0 or bad_pay is not null then
    return jsonb_build_object('ok', false, 'status', 'denied', 'w0', w0, 'w1', w1, 'reason',
      concat_ws(' · ', case when n_late > 0 then '출근 지각 ' || n_late || '회' end, case when n_early > 0 then '조퇴 ' || n_early || '회' end,
                       case when bad_pay is not null then '급여 기록: ' || bad_pay end));
  end if;
  m := date_trunc('month', w0)::date;
  while m <= w1 loop
    for half in 1..2 loop
      ps := case when half = 1 then m else m + 15 end;
      pe := case when half = 1 then m + 14 else least(m + 29, (m + interval '1 month - 1 day')::date) end;
      if pe >= w0 and ps <= w1 and pe < (now() at time zone 'Asia/Manila')::date and ps >= started
         and not exists (select 1 from public.pr_payrolls p where p.employee_id = p_emp and p.period_start = ps and (p.status = 'paid' or p.shared_at is not null)) then
        missing := missing || case when missing = '' then '' else ', ' end || to_char(ps, 'MM/DD') || '~' || to_char(pe, 'MM/DD');
      end if;
    end loop;
    m := (m + interval '1 month')::date;
  end loop;
  if missing <> '' then
    return jsonb_build_object('ok', false, 'status', 'no_record', 'w0', w0, 'w1', w1, 'reason', '급여 기록 없음: ' || missing);
  end if;
  return jsonb_build_object('ok', true, 'status', 'paid', 'w0', w0, 'w1', w1, 'reason', '3개월 근태 문제 없음');
end $function$;

create or replace function public.pr_absence_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (new.status = old.status or new.status not in ('pending', 'noted')) then return null; end if;
  perform public.pr_notify('🤒 결석 · ' || (select name from public.pr_employees where id = new.employee_id) || ' · ' || public.pr_md(new.day)
    || coalesce(' (스케줄 ' || new.plan_shift || ')', '') || E'\n'
    || case new.kind when 'sick' then '병가' when 'family' then '경조사' else '개인 사유' end
    || case when new.status = 'pending' then ' · 증빙 ' || jsonb_array_length(new.proof) || '장 → 확인서 (승인 필요)'
            when new.kind <> 'personal' then ' · 증빙 없음 → 보류 (' || public.pr_md(new.day + 7) || '까지 증빙 없으면 무단결근)'
            else ' · 증빙 없음 → 사유서 (무단결근)' end
    || coalesce(E'\n메모: ' || new.note, '')
    || case when new.status = 'pending' then E'\n👉 급여 앱 → 지급 예정 → 결석 확인' else '' end);
  return null;
end $$;

-- Felipe 11/18 00:44 early clock-out (sick) → no attendance problem (owner 11/18)
update public.pr_punches set mode = 'sick', status = 'approved', decided_at = now()
 where employee_id = (select id from public.pr_employees where name = 'Felipe') and kind = 'out'
   and (punched_at at time zone 'Asia/Manila') between '2026-11-18 00:00' and '2026-11-18 01:00';
