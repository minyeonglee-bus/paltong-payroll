-- 사유서 · 확인서: choose, never type — filled in and decided automatically (owner 2026-11-12)
--   사유서 (late clock-in / late clock-out / early clock-out, personal): reason is picked — Traffic or Personal
--     (hall staff late clock-out: also "장부 검사" Cash Book check) → auto "Noted" (rejected):
--     late minutes are deducted, staying late is not overtime.
--   확인서 (work reasons only → extra pay for staying late / late clock-in excused):
--     · 교대자 지각 (next shift late) → coworker picked → approved / rejected automatically when the coworker answers
--     · 배달 후 오버타임 (riders) → the delivery is picked from the order app; picked-up / delivered times are written
--       on the letter → approved when the delivery ended at / after the shift end, else waits for the owner
--     · 업무상 심부름 (errand) → riders pick the errand from the order app (started / done times) → approved;
--       other staff pick who asked → approved / rejected when that person answers
--   Early clock-in for the previous shift (cover) is also decided when the coworker answers.
--   No shift that day: "called in for work" → owner decides · personal → noted.
-- Order app lookup: order/rider project via the http extension + rpc rider_jobs_ext (paltong-order: sql/rider_jobs_payroll.sql),
-- same Vault secret as pr_rider_duty.sql ('rider_duty_secret').
create extension if not exists http with schema extensions;
alter table public.pr_punches add column if not exists job jsonb;

-- rider's deliveries + errands between two times (empty when not a rider / not reachable — never blocks a punch)
create or replace function public.pr_order_jobs(p_emp uuid, p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare e public.pr_employees; s text; r extensions.http_response;
  k text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6ZGhjdW1pYmZseHRxa3F2YnVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyNDI3NDgsImV4cCI6MjEwNTgxODc0OH0.qSEMyhZ9HWEpaGXEupQzYkHxIvUC5Y1yhr5T2N-VD7w';
begin
  select * into e from public.pr_employees where id = p_emp;
  if e.position is distinct from 'rider' then return jsonb_build_object('ok', false, 'err', 'not_rider'); end if;
  select decrypted_secret into s from vault.decrypted_secrets where name = 'rider_duty_secret';
  if s is null then return jsonb_build_object('ok', false, 'err', 'no_secret'); end if;
  begin
    perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '5000');
    r := extensions.http(('POST', 'https://yzdhcumibflxtqkqvbul.supabase.co/rest/v1/rpc/rider_jobs_ext',
      array[extensions.http_header('apikey', k), extensions.http_header('Authorization', 'Bearer ' || k)], 'application/json',
      jsonb_build_object('p_secret', s, 'p_phone', e.info->>'phone', 'p_name', coalesce(nullif(e.info->>'full_name', ''), e.name), 'p_from', p_from, 'p_to', p_to)::text)::extensions.http_request);
    if r.status <> 200 then return jsonb_build_object('ok', false, 'err', 'order_app_' || r.status); end if;
    return r.content::jsonb;
  exception when others then return jsonb_build_object('ok', false, 'err', 'order_app'); end;
end $$;
revoke all on function public.pr_order_jobs(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- staff (rider): recent deliveries / errands to pick from (last 14 hours)
create or replace function public.pr_emp_jobs(p_no text, p_pin text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare c record;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  return public.pr_order_jobs(c.emp_id, now() - interval '14 hours', now() + interval '5 minutes');
end $$;
revoke all on function public.pr_emp_jobs(text, text) from public;
grant execute on function public.pr_emp_jobs(text, text) to anon, authenticated;

create or replace function public.pr_hhmi(t timestamptz) returns text language sql stable as $$ select coalesce(to_char(t at time zone 'Asia/Manila', 'HH24:MI'), '—') $$;

create or replace function public.pr_punch2(p_no text, p_pin text, p_kind text, p_reason text)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $function$
declare c record; last_k text; last_at timestamptz; ts timestamptz := now(); r date;
  loc timestamp := (now() at time zone 'Asia/Manila'); bday date; plan text; sm int; em int; target timestamp; dev int;
  st text := 'ok'; md text; rtxt text; rest text; oth uuid; othname text; ask jsonb; legacy boolean := false;
  job jsonb; jobs jsonb; jid text; tstart timestamptz; tend timestamptz; verified boolean := false;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  if c.must_change then return jsonb_build_object('ok', false, 'err', 'must_change'); end if;
  select resigned_on into r from public.pr_employees where id = c.emp_id;
  if r is not null and loc::date > r then return jsonb_build_object('ok', false, 'err', 'resigned'); end if;
  if p_kind not in ('in','out') then return jsonb_build_object('ok', false, 'err', 'kind'); end if;
  select kind, punched_at into last_k, last_at from public.pr_punches where employee_id = c.emp_id and status <> 'void' order by punched_at desc limit 1;
  if last_k = p_kind and last_at > ts - interval '2 minutes' then return jsonb_build_object('ok', true, 'dup', true); end if;

  -- business day + planned shift
  if p_kind = 'in' then
    bday := loc::date;
    plan := public.pr_plan_for(c.emp_id, bday);
    if (plan is null or plan in ('off','sil')) and extract(hour from loc) < 6 then
      bday := loc::date - 1; plan := public.pr_plan_for(c.emp_id, bday);
    end if;
  else
    if last_k = 'in' and last_at > ts - interval '20 hours' then
      bday := (last_at at time zone 'Asia/Manila')::date;
    else
      select dd into bday from (
        select dd, abs(extract(epoch from (loc - (dd + make_interval(mins => case when public.pr_hm(split_part(pl, '-', 2)) <= public.pr_hm(split_part(pl, '-', 1)) then public.pr_hm(split_part(pl, '-', 2)) + 1440 else public.pr_hm(split_part(pl, '-', 2)) end))))) gap
        from (select g::date dd, public.pr_plan_for(c.emp_id, g::date) pl from generate_series(loc::date - 1, loc::date, interval '1 day') g) z
        where pl ~ '^\d{1,2}(:\d{2})?-\d{1,2}(:\d{2})?$' order by gap limit 1) q;
      bday := coalesce(bday, loc::date);
    end if;
    plan := public.pr_plan_for(c.emp_id, bday);
  end if;
  if plan is null or plan in ('off','sil') or plan !~ '^\d{1,2}(:\d{2})?-\d{1,2}(:\d{2})?$' then dev := null;
  else
    sm := public.pr_hm(split_part(plan, '-', 1)); em := public.pr_hm(split_part(plan, '-', 2));
    if em <= sm then em := em + 1440; end if;
    target := bday + make_interval(mins => case when p_kind = 'in' then sm else em end);
    dev := trunc(extract(epoch from (loc - target)) / 60)::int;
  end if;
  ask := jsonb_build_object('ok', false, 'need_reason', true, 'plan', plan, 'dev', dev, 'day', bday, 'at', ts);

  -- the chosen reason → mode + coworker / job
  md := case when p_reason like '#cover:%' then 'cover' when p_reason like '#relief:%' then 'relief' when p_reason like '#errandby:%' then 'errandby'
             when p_reason like '#errand:%' then 'errand' when p_reason like '#delivery:%' then 'delivery' when p_reason like '#work:%' then 'work'
             when p_reason = '#traffic' then 'traffic' when p_reason = '#boss' then 'boss'
             when p_reason = '#personal' or p_reason like '#personal:%' then 'personal' when p_reason = '#cashbook' then 'cashbook'
             when nullif(trim(p_reason), '') is not null then 'text' end;
  if md in ('cover', 'relief', 'errandby') then
    rest := substr(p_reason, position(':' in p_reason) + 1);
    begin oth := split_part(rest, ':', 1)::uuid; exception when others then oth := null; end;
    select name into othname from public.pr_employees where id = oth and id <> c.emp_id;
    if othname is null then oth := null; end if;
  elsif md in ('delivery', 'errand') then
    jid := substr(p_reason, position(':' in p_reason) + 1);
    jobs := public.pr_order_jobs(c.emp_id, ts - interval '14 hours', ts + interval '5 minutes');
    select x into job from jsonb_array_elements(coalesce(jobs -> case when md = 'delivery' then 'deliveries' else 'errands' end, '[]'::jsonb)) x where x->>'id' = jid limit 1;
    if job is not null then
      tstart := nullif(job->>case when md = 'delivery' then 'picked' else 'started' end, '')::timestamptz;
      tend := nullif(job->>case when md = 'delivery' then 'delivered' else 'done' end, '')::timestamptz;
    end if;
  end if;

  rtxt := case md
    when 'cover' then 'Came early because ' || coalesce(othname, '?') || ' (previous shift) left early · 교대자 일찍 퇴근'
    when 'relief' then 'Stayed late because ' || coalesce(othname, '?') || ' (next shift) was late · 교대자 지각 (교대자 확인)'
    when 'errandby' then 'Work errand requested by ' || coalesce(othname, '?') || ' · 업무상 심부름 (' || coalesce(othname, '?') || ' 확인)'
    when 'delivery' then case when job is null then 'Delivery (not found in the order app) · 배달 후 오버타임 — 주문 앱에서 확인 안 됨'
      else 'Overtime after delivery #' || (job->>'no') || coalesce(' (' || nullif(job->>'zone', '') || ')', '') || ' — picked up ' || public.pr_hhmi(tstart) || ', delivered ' || public.pr_hhmi(tend) || ' · 배달 후 오버타임 (배달 시작 ' || public.pr_hhmi(tstart) || ' · 종료 ' || public.pr_hhmi(tend) || ')' end
    when 'errand' then case when job is null then 'Errand (not found in the order app) · 업무상 심부름 — 주문 앱에서 확인 안 됨'
      else 'Work errand: ' || coalesce(job->>'title', '') || coalesce(' @ ' || nullif(job->>'place', ''), '') || ' — started ' || public.pr_hhmi(tstart) || ', done ' || public.pr_hhmi(tend) || ' · 업무상 심부름 (시작 ' || public.pr_hhmi(tstart) || ' · 끝 ' || public.pr_hhmi(tend) || ')' end
    when 'traffic' then 'Traffic (personal reason) · 교통 체증 (개인 사유)'
    when 'cashbook' then 'Cash Book check — not overtime (the books must be closed before the shift ends) · 장부 검사 (초과근무 아님)'
    when 'boss' then 'Called in for work by the owner / manager · 사장님·매니저 호출 (업무)'
    when 'personal' then coalesce(nullif(trim(substr(p_reason, 11)), ''), case when p_kind = 'in' and dev < 0 then 'Came early to avoid being late (personal) · 지각 방지 (개인 사유)'
      when p_kind = 'in' then 'Personal reason · 개인 사유' when dev < 0 then 'Left early for a personal reason · 개인 사유 조퇴'
      else 'Stayed for a personal reason — not overtime · 개인 사유 (초과근무 아님)' end)
    when 'work' then nullif(trim(substr(p_reason, 7)), '')
    when 'text' then trim(p_reason) end;
  if md in ('work', 'text') then legacy := true; end if;   -- an older app version: typed text

  if dev is null then                                        -- no shift that day
    if md = 'boss' or (legacy and rtxt is not null) then st := 'pending';
    elsif md in ('personal', 'traffic') then st := 'rejected';
    else return ask; end if;
  elsif dev = 0 then st := 'ok'; md := null; oth := null; rtxt := null; job := null;
  elsif p_kind = 'in' and dev < 0 then                       -- early clock-in
    if md = 'cover' and oth is not null then st := 'pending';
    elsif md = 'personal' then st := 'ok';
    else return ask || '{"early": true}'; end if;
  elsif p_kind = 'in' then                                   -- late clock-in
    if md in ('traffic', 'personal') or md = 'text' then st := 'rejected'; if md = 'text' then md := 'personal'; end if;
    elsif md = 'errand' and job is not null and coalesce(tstart, tend) <= ts + interval '5 minutes' and coalesce(tend, tstart) >= target - interval '3 hours' then st := 'approved'; verified := true;
    elsif md = 'errand' then st := 'pending';
    elsif md = 'errandby' and oth is not null then st := 'pending';
    else return ask || '{"late_in": true}'; end if;
  elsif dev < 0 then                                         -- early clock-out
    if md in ('personal', 'traffic') or md = 'text' then st := 'rejected'; if md = 'text' then md := 'personal'; end if;
    else return ask || '{"early_out": true}'; end if;
  else                                                       -- late clock-out
    if md in ('personal', 'traffic', 'cashbook') then st := 'rejected';
    elsif md = 'relief' and oth is not null then st := 'pending';
    elsif md = 'errandby' and oth is not null then st := 'pending';
    elsif md = 'delivery' and job is not null and tend is not null and tend >= target - interval '30 minutes' and tend <= ts + interval '5 minutes' then st := 'approved'; verified := true;
    elsif md = 'errand' and job is not null and coalesce(tend, tstart) >= target - interval '3 hours' and coalesce(tstart, tend) <= ts + interval '5 minutes' then st := 'approved'; verified := true;
    elsif md in ('delivery', 'errand') then st := 'pending';  -- picked but the order app does not back it → owner decides
    elsif legacy and md = 'work' and rtxt is not null then st := 'pending';
    else return ask || '{"late_out": true}'; end if;
  end if;
  if md = 'errandby' then md := 'errand'; end if;

  insert into public.pr_punches (employee_id, kind, punched_at, source, plan_shift, dev_min, reason, status, mode, other_emp, job, decided_at)
  values (c.emp_id, p_kind, ts, 'app', plan, dev, rtxt, st, md, oth,
          case when job is not null then job || jsonb_build_object('type', case when p_reason like '#delivery:%' then 'delivery' else 'errand' end, 'verified', verified) end,
          case when st in ('approved', 'rejected') then ts end);
  return jsonb_build_object('ok', true, 'at', ts, 'status', st, 'plan', plan, 'dev', dev);
end $function$;

-- coworker answers → the letter is decided automatically (covered for you / stayed because you were late / asked for an errand)
create or replace function public.pr_mention_ack(p_no text, p_pin text, p_punch uuid, p_ok boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare c record;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  update public.pr_punches set other_ack_at = now(), other_ok = p_ok,
         status = case when status = 'pending' and mode in ('cover', 'relief', 'errand') then case when p_ok then 'approved' else 'rejected' end else status end,
         decided_at = case when status = 'pending' and mode in ('cover', 'relief', 'errand') then now() else decided_at end
   where id = p_punch and other_emp = c.emp_id;
  if not found then return jsonb_build_object('ok', false, 'err', 'noData'); end if;
  return jsonb_build_object('ok', true);
end $$;
