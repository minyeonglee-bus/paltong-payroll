-- 휴가 신청 → 스케줄에 빈자리가 생기면 자동 반려 (사장님 2026-11-20: "앞으로 모든 휴무 신청은 스케줄에 빈공간 생기면 반려 자동")
-- All three kinds (off / sil / mpv), auto or manual. Checked at request time, before auto-approval.
-- Rejected requests are saved as status 'rejected' (note '자동 반려 · 빈자리 …') and the owner gets a push.
--
-- "빈자리" = the same demand as tools/schedule/solve.py:
--   kitchen: weekday 3 (8-18 / 18-4 / 22-8), Fri·Sat·holiday eve 5 (+10-20, 20-6)
--   riders:  weekday 3, Fri·Sat 4
--   hall:    weekday 2 (8-20 / 20-8), Fri·Sat·holiday eve 3 (8-20 / 20-4 / 22-8)
--   closed days (overrides.json "closed": 2026-12-31, 2027-01-01) need 0
-- A request is rejected when, counting everyone's approved + pending leave / SIL and the new request:
--   1. day check:  people of the team still free that day < shifts of that day, or
--   2. week check: work days the team can still give that Sun–Sat week (each person: free days − 1 regular day off,
--                  the day off is already given if they have an approved/pending "off" leave that week) < shifts that week
--                  AND fewer than without this request (one regular day off a week never hurts), or
--   3. kitchen: Jonel and Archie would both be off that day (solver hard rule).
-- Planned regular offs (pr_plan 'off' without a leave) are NOT counted as taken: the daily re-plan moves them.

create or replace function public.pr_team_of(p_name text) returns text
language sql immutable as $$
  select case
    when p_name in ('Jonel', 'Archie', 'Albert', 'Jonathan', 'Lorence') then 'kitchen'
    when p_name in ('Genifer', 'Lilian', 'Arlyn') then 'hall'
    when p_name in ('Felipe', 'Jhon Vik', 'June', 'Wilbert') then 'riders'
  end $$;   -- keep in step with TEAMS in tools/schedule/solve.py

create or replace function public.pr_team_need(p_team text, p_day date) returns int
language sql stable security definer set search_path to 'public' as $$
  select case
    when p_day in (date '2026-12-31', date '2027-01-01') then 0          -- store closed (overrides.json "closed")
    when p_team = 'kitchen' then case when extract(isodow from p_day) in (5, 6)
         or exists (select 1 from public.pr_holidays h where h.day = p_day + 1) then 5 else 3 end
    when p_team = 'riders' then case when extract(isodow from p_day) in (5, 6) then 4 else 3 end
    when p_team = 'hall' then case when extract(isodow from p_day) in (5, 6)
         or exists (select 1 from public.pr_holidays h where h.day = p_day + 1) then 3 else 2 end
    else 0 end $$;

create or replace function public.pr_min_day(p date[]) returns date language sql immutable as $$ select min(x) from unnest(p) x $$;

-- null = no gap; otherwise {day, team, need, have, why: 'day' | 'week' | 'jonel_archie'}
create or replace function public.pr_leave_gap(p_emp uuid, p_kind text, p_days date[]) returns jsonb
language plpgsql volatile security definer set search_path to 'public' as $$
declare tm text; me text; d date; sun date; nd int; hv int; hv0 int;
begin
  select name into me from public.pr_employees where id = p_emp;
  tm := public.pr_team_of(me);
  if tm is null or p_days is null then return null; end if;

  -- free(member, day): not on leave (approved/pending, or the new request), not SIL in the plan, employed that day
  create temp table if not exists _gap_free (emp uuid, name text, day date, free boolean, off_leave boolean, req boolean) on commit drop;
  truncate _gap_free;
  insert into _gap_free
  select e.id, e.name, x::date,
         not ((e.id = p_emp and x::date = any(p_days))
              or exists (select 1 from public.pr_sil_req r where r.employee_id = e.id and r.day = x::date and r.status in ('pending', 'approved'))
              or exists (select 1 from public.pr_plan q where q.employee_id = e.id and q.day = x::date and q.shift = 'sil')
              or (e.hired_on is not null and e.hired_on > x::date)
              or (e.resigned_on is not null and e.resigned_on <= x::date)),
         (e.id = p_emp and p_kind = 'off' and x::date = any(p_days))
           or exists (select 1 from public.pr_sil_req r where r.employee_id = e.id and r.day = x::date and r.kind = 'off' and r.status in ('pending', 'approved')),
         e.id = p_emp and x::date = any(p_days)
  from public.pr_employees e
  cross join (select distinct generate_series(w - ((extract(isodow from w)::int) % 7), w - ((extract(isodow from w)::int) % 7) + 6, interval '1 day') x
              from unnest(p_days) w) dd
  where public.pr_team_of(e.name) = tm and (e.resigned_on is null or e.resigned_on > pr_min_day(p_days));

  -- 1. day check
  foreach d in array p_days loop
    nd := public.pr_team_need(tm, d);
    select count(*) into hv from _gap_free where day = d and free;
    if hv < nd then return jsonb_build_object('day', d, 'team', tm, 'need', nd, 'have', hv, 'why', 'day'); end if;
    if tm = 'kitchen' and me in ('Jonel', 'Archie') and nd > 0
       and not exists (select 1 from _gap_free where day = d and free and name = case me when 'Jonel' then 'Archie' else 'Jonel' end) then
      return jsonb_build_object('day', d, 'team', tm, 'why', 'jonel_archie'); end if;
  end loop;

  -- 2. week check (Sun–Sat)
  for sun in select distinct w - ((extract(isodow from w)::int) % 7) from unnest(p_days) w order by 1 loop
    select coalesce(sum(public.pr_team_need(tm, (sun + k))), 0) into nd from generate_series(0, 6) k;
    select coalesce(sum(greatest(f - case when o then 0 else 1 end, 0)), 0),
           coalesce(sum(greatest(f0 - case when o0 then 0 else 1 end, 0)), 0) into hv, hv0
    from (select emp, count(*) filter (where free) f, bool_or(off_leave) o,
                 count(*) filter (where free or req) f0, bool_or(off_leave and not req) o0
          from _gap_free where day between sun and sun + 6 group by emp) s;
    if hv < nd and hv < hv0 then   -- short AND made shorter by this request (a week already short is not blamed on it)
      return jsonb_build_object('day', (select min(x) from unnest(p_days) x where x between sun and sun + 6),
                                'week', sun, 'team', tm, 'need', nd, 'have', hv, 'why', 'week'); end if;
  end loop;
  return null;
end $$;

create or replace function public.pr_gap_text(g jsonb) returns text language sql stable as $$
  select case g->>'team' when 'kitchen' then '주방' when 'hall' then '홀' when 'riders' then '라이더' else g->>'team' end || ' '
    || case g->>'why'
         when 'day' then public.pr_md((g->>'day')::date) || ' ' || (g->>'have') || '/' || (g->>'need') || '명'
         when 'week' then public.pr_md((g->>'week')::date) || '주 근무일 ' || (g->>'have') || '/' || (g->>'need')
         else public.pr_md((g->>'day')::date) || ' Jonel·Archie 둘 다 휴무' end $$;

-- main leave request: same as before + gap check before auto-approval
create or replace function public.pr_emp_leave_request(p_no text, p_pin text, p_kind text, p_from date, p_to date, p_reason text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
declare c record; td date := (now() at time zone 'Asia/Manila')::date; d date; y int; n int; lft numeric; g uuid := gen_random_uuid(); mo date; days date[];
  auto boolean; why text; warn jsonb; nm text; gap jsonb;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  if c.must_change then return jsonb_build_object('ok', false, 'err', 'must_change'); end if;
  if p_kind not in ('off', 'sil', 'mpv') or p_from is null or p_to is null or p_to < p_from or p_to - p_from > 13 then
    return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
  select array_agg(x::date order by x) into days from generate_series(p_from, p_to, interval '1 day') x;
  perform pg_advisory_xact_lock(hashtext('pr_sil_' || c.emp_id::text));
  perform pg_advisory_xact_lock(hashtext('pr_leave_gap'));   -- two requests at once cannot both take the last free slot
  foreach d in array days loop
    if d <= coalesce((select s.sched_locked_through from public.pr_settings s where s.id = 1), '-infinity'::date) and d > td then
      return jsonb_build_object('ok', false, 'err', 'locked', 'day', d); end if;
    if d <= td or d > td + 180 then return jsonb_build_object('ok', false, 'err', 'past', 'day', d); end if;
    if exists (select 1 from public.pr_plan q where q.employee_id = c.emp_id and q.day = d and q.shift = 'sil')
       or exists (select 1 from public.pr_sil_req r where r.employee_id = c.emp_id and r.day = d and r.status in ('pending', 'approved')) then
      return jsonb_build_object('ok', false, 'err', 'dup', 'day', d); end if;
    if p_kind = 'off' and public.pr_plan_day(c.emp_id, d) = 'off' then return jsonb_build_object('ok', false, 'err', 'already_off', 'day', d); end if;
  end loop;
  if p_kind = 'sil' then
    for y in select distinct extract(year from x)::int from unnest(days) x loop
      select count(*) into n from unnest(days) x where extract(year from x) = y;
      lft := public.pr_sil_left(c.emp_id, y);
      if lft < n then return jsonb_build_object('ok', false, 'err', 'no_balance', 'left', greatest(lft, 0), 'year', y); end if;
    end loop;
  elsif p_kind = 'mpv' then
    for mo in select distinct date_trunc('month', x)::date from unnest(days) x loop
      select count(*) into n from unnest(days) x where date_trunc('month', x)::date = mo;
      lft := public.pr_mpv_left(c.emp_id, mo);
      if lft < n then return jsonb_build_object('ok', false, 'err', 'no_mpv', 'left', lft, 'month', to_char(mo, 'YYYY-MM')); end if;
    end loop;
  end if;
  nm := (select name from public.pr_employees where id = c.emp_id);

  -- 빈자리 → 자동 반려 (owner 2026-11-20)
  gap := public.pr_leave_gap(c.emp_id, p_kind, days);
  if gap is not null then
    insert into public.pr_sil_req (employee_id, day, reason, kind, grp, status, decided_at, note)
    select c.emp_id, x, nullif(left(trim(coalesce(p_reason, '')), 200), ''), p_kind, g, 'rejected', now(),
           '자동 반려 · 빈자리 ' || public.pr_gap_text(gap) from unnest(days) x;
    perform public.pr_notify('⛔ 휴가 자동 반려 (빈자리) · ' || nm || E'\n'
      || case p_kind when 'off' then 'Day off (무급)' when 'mpv' then '월 개근 휴가' else 'SIL' end || ' · '
      || public.pr_md(p_from) || case when p_to > p_from then ' ~ ' || public.pr_md(p_to) else '' end || ' (' || cardinality(days) || '일)'
      || E'\n' || public.pr_gap_text(gap));
    -- err 'locked' so the app deployed before this change shows "관리자에게 문의하세요"; the new app reads gap = true
    return jsonb_build_object('ok', false, 'err', 'locked', 'gap', true, 'day', gap->>'day', 'why', gap->>'why', 'grp', g);
  end if;

  auto := p_from >= td + 7 and cardinality(days) < 5;
  why := case when cardinality(days) >= 5 then 'long' when p_from < td + 7 then 'short_notice' end;
  if p_kind = 'off' then warn := public.pr_off_warnings(c.emp_id, days); end if;
  insert into public.pr_sil_req (employee_id, day, reason, kind, grp)
  select c.emp_id, x, nullif(left(trim(coalesce(p_reason, '')), 200), ''), p_kind, g from unnest(days) x;
  if auto then
    perform public.pr_leave_apply(r.id, true, '자동 승인') from public.pr_sil_req r where r.grp = g;
    perform public.pr_notify('✅ 휴가 자동 승인 · ' || nm || E'\n'
      || case p_kind when 'off' then 'Day off (무급)' when 'mpv' then '월 개근 휴가' else 'SIL' end || ' · '
      || public.pr_md(p_from) || case when p_to > p_from then ' ~ ' || public.pr_md(p_to) else '' end || ' (' || cardinality(days) || '일) · 스케줄 반영됨'
      || coalesce(E'\n⚠️ ' || nullif((select string_agg(split_part(w, ' / ', 1), ', ') from jsonb_array_elements_text(warn) w), ''), ''));
  else
    perform public.pr_notify('🌴 휴가 승인 필요 · ' || nm || E'\n'
      || case p_kind when 'off' then 'Day off (무급)' when 'mpv' then '월 개근 휴가' else 'SIL' end || ' · '
      || public.pr_md(p_from) || case when p_to > p_from then ' ~ ' || public.pr_md(p_to) else '' end || ' (' || cardinality(days) || '일)'
      || case why when 'long' then ' · 5일 이상' else ' · 7일 전 아님' end
      || coalesce(E'\n사유: ' || nullif(trim(p_reason), ''), '')
      || coalesce(E'\n⚠️ ' || nullif((select string_agg(split_part(w, ' / ', 1), ', ') from jsonb_array_elements_text(warn) w), ''), ''));
  end if;
  return jsonb_build_object('ok', true, 'n', cardinality(days), 'grp', g, 'auto', auto, 'why', why);
end $function$;

-- old one-day-list SIL request (not used by the app any more): same gap rule, refused without saving
create or replace function public.pr_emp_sil_request(p_no text, p_pin text, p_days date[], p_reason text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
declare c record; td date := (now() at time zone 'Asia/Manila')::date; d date; y int; n int; lft numeric; bad text := ''; gap jsonb;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  if c.must_change then return jsonb_build_object('ok', false, 'err', 'must_change'); end if;
  if p_days is null or cardinality(p_days) = 0 or cardinality(p_days) > 10 then return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
  perform pg_advisory_xact_lock(hashtext('pr_sil_' || c.emp_id::text));
  perform pg_advisory_xact_lock(hashtext('pr_leave_gap'));
  foreach d in array p_days loop
    if d <= coalesce((select s.sched_locked_through from public.pr_settings s where s.id = 1), '-infinity'::date) and d > td then
      return jsonb_build_object('ok', false, 'err', 'locked', 'day', d); end if;
    if d <= td or d > td + 180 then bad := 'past'; exit; end if;
    if exists (select 1 from public.pr_plan q where q.employee_id = c.emp_id and q.day = d and q.shift = 'sil')
       or exists (select 1 from public.pr_sil_req r where r.employee_id = c.emp_id and r.day = d and r.status in ('pending', 'approved')) then bad := 'dup'; exit; end if;
  end loop;
  if bad <> '' then return jsonb_build_object('ok', false, 'err', bad, 'day', d); end if;
  for y in select distinct extract(year from x)::int from unnest(p_days) x loop
    select count(*) into n from unnest(p_days) x where extract(year from x) = y;
    lft := public.pr_sil_left(c.emp_id, y);
    if lft < n then return jsonb_build_object('ok', false, 'err', 'no_balance', 'left', greatest(lft, 0), 'year', y); end if;
  end loop;
  gap := public.pr_leave_gap(c.emp_id, 'sil', p_days);
  if gap is not null then return jsonb_build_object('ok', false, 'err', 'locked', 'gap', true, 'day', gap->>'day', 'why', gap->>'why'); end if;
  insert into public.pr_sil_req (employee_id, day, reason)
  select c.emp_id, x, nullif(left(trim(coalesce(p_reason, '')), 200), '') from (select distinct unnest(p_days) x) u;
  return jsonb_build_object('ok', true, 'n', cardinality(p_days));
end $function$;

revoke execute on function public.pr_leave_gap(uuid, text, date[]) from public, anon, authenticated;
