-- 금·토 휴가 예외 + 홀 빈자리 → Mina 출근 요청 (사장님 2026-11-20 10:04)
--   "금토 휴가는 열흘 전이면 무조건 허용. 그 미만 남은 거면 이유 후 나한테 승인 알람. 홀은 미나한테 출근요청해줘 주말 휴무 뜨면"
-- Replaces the 11/20 rule in pr_leave_gap.sql for Fri/Sat only:
--   * weekday gap (pr_leave_gap on the non-Fri/Sat days)          → auto-reject, as before
--   * Fri/Sat gap, every Fri/Sat day >= today + 10                → allowed (normal auto/manual rule: 7+ days ahead and < 5 days = auto)
--   * Fri/Sat gap, a Fri/Sat day < today + 10                    → reason required, always the owner's approval (push)
--   * hall Fri/Sat leave approved (auto or by the owner) and the hall is short that day → pr_hall_calls row + push to Mina.
--     Mina answers in the payroll app (가능 / 불가); "가능" → the daily re-plan puts her on a hall shift that day.
-- Error replies keep err 'locked' (the old app shows "관리자에게 문의하세요"); the new app reads `code`.

-- ---------- push: owner pushes only to owner devices, Mina gets her own ----------
create or replace function public.pr_mina_uid() returns uuid language sql stable security definer set search_path to 'public' as $$
  select user_id from public.staff where name = 'Mina' limit 1 $$;
create or replace function public.pr_is_mina() returns boolean language sql stable security definer set search_path to 'public' as $$
  select auth.uid() is not null and auth.uid() = public.pr_mina_uid() $$;

create or replace function public.pr_push_send(p_subs jsonb, p_text text) returns void
language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare k public.pr_push_cfg; t text := coalesce(p_text, ''); title text; body text;
begin
  select * into k from public.pr_push_cfg where id = 1;
  if k is null or t = '' or p_subs is null or jsonb_array_length(p_subs) = 0 then return; end if;
  title := split_part(t, E'\n', 1);
  body := nullif(substr(t, length(title) + 2), '');
  begin
    perform net.http_post(url := k.relay_url,
      body := jsonb_build_object('secret', k.relay_secret,
        'vapid', jsonb_build_object('public', k.public_key, 'private', k.private_key, 'subject', 'mailto:admin@paltong.app'),
        'subs', p_subs,
        'payload', jsonb_build_object('title', title, 'body', coalesce(body, ''), 'tag', 'pr-' || md5(t || clock_timestamp()::text), 'kind', 'pr', 'url', '/')),
      headers := '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds := 15000);
  exception when others then raise warning 'pr_push_send 실패: %', sqlerrm;
  end;
end $$;
revoke execute on function public.pr_push_send(jsonb, text) from public, anon, authenticated;

create or replace function public.pr_notify(p_text text) returns void
language plpgsql security definer set search_path to 'public', 'extensions' as $$
begin
  perform public.pr_push_send((select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
    from public.pr_push_subs s where s.user_id is null or s.user_id in (select user_id from public.staff where role = 'owner')), p_text);
end $$;

create or replace function public.pr_notify_mina(p_text text) returns void
language plpgsql security definer set search_path to 'public', 'extensions' as $$
begin
  perform public.pr_push_send((select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
    from public.pr_push_subs s where s.user_id = public.pr_mina_uid()), p_text);
end $$;
revoke execute on function public.pr_notify_mina(text) from public, anon, authenticated;

create or replace function public.pr_push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_label text) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if not (public.is_owner() or public.pr_is_mina()) then raise exception 'OWNER_ONLY'; end if;
  insert into public.pr_push_subs (endpoint, p256dh, auth, label, user_id) values (p_endpoint, p_p256dh, p_auth, left(p_label, 60), auth.uid())
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, label = excluded.label, user_id = excluded.user_id;
end $$;

create or replace function public.pr_push_unsubscribe(p_endpoint text) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if not (public.is_owner() or public.pr_is_mina()) then raise exception 'OWNER_ONLY'; end if;
  delete from public.pr_push_subs where endpoint = p_endpoint and (public.is_owner() or user_id = auth.uid());
end $$;

create or replace function public.pr_push_info() returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not (public.is_owner() or public.pr_is_mina()) then raise exception 'OWNER_ONLY'; end if;
  return jsonb_build_object('public_key', (select public_key from public.pr_push_cfg where id = 1),
    'devices', (select count(*) from public.pr_push_subs s where case when public.is_owner()
                  then s.user_id is null or s.user_id in (select user_id from public.staff where role = 'owner') else s.user_id = auth.uid() end));
end $$;

create or replace function public.pr_push_test() returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if public.is_owner() then perform public.pr_notify(E'✅ 빨통 급여 앱 알림\n이 기기로 신청·승인 알림이 와요.');
  elsif public.pr_is_mina() then perform public.pr_notify_mina(E'✅ 빨통 급여 앱 알림\n이 기기로 홀 출근 요청 알림이 와요.');
  else raise exception 'OWNER_ONLY'; end if;
end $$;

-- ---------- Mina call requests ----------
create table if not exists public.pr_hall_calls (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  leave_grp uuid,
  leave_emp uuid references public.pr_employees(id) on delete set null,
  status text not null default 'asked' check (status in ('asked', 'yes', 'no', 'cancelled')),
  asked_at timestamptz not null default now(),
  answered_at timestamptz,
  note text
);
create index if not exists pr_hall_calls_day on public.pr_hall_calls (day);
alter table public.pr_hall_calls enable row level security;   -- RPC only

-- hall people free that day (no approved/pending leave, no SIL, employed) + Mina if she said yes
create or replace function public.pr_hall_have(p_day date) returns int
language sql stable security definer set search_path to 'public' as $$
  select (select count(*)::int from public.pr_employees e
          where public.pr_team_of(e.name) = 'hall'
            and (e.hired_on is null or e.hired_on <= p_day) and (e.resigned_on is null or e.resigned_on > p_day)
            and not exists (select 1 from public.pr_sil_req r where r.employee_id = e.id and r.day = p_day and r.status in ('pending', 'approved'))
            and not exists (select 1 from public.pr_plan q where q.employee_id = e.id and q.day = p_day and q.shift = 'sil'))
       + (select count(*)::int from public.pr_hall_calls c where c.day = p_day and c.status = 'yes') $$;

create or replace function public.pr_hall_call_make(p_grp uuid) returns int
language plpgsql security definer set search_path to 'public' as $$
declare r record; n int := 0; td date := (now() at time zone 'Asia/Manila')::date;
begin
  for r in select q.day, q.employee_id, e.name from public.pr_sil_req q join public.pr_employees e on e.id = q.employee_id
           where q.grp = p_grp and q.status = 'approved' and q.day > td and extract(isodow from q.day) in (5, 6)
             and public.pr_team_of(e.name) = 'hall' order by q.day loop
    if public.pr_hall_have(r.day) < public.pr_team_need('hall', r.day)
       and not exists (select 1 from public.pr_hall_calls c where c.day = r.day and c.status in ('asked', 'yes')) then
      insert into public.pr_hall_calls (day, leave_grp, leave_emp) values (r.day, p_grp, r.employee_id);
      perform public.pr_notify_mina('🙋 홀 출근 요청 · ' || public.pr_md(r.day) || E'\n'
        || r.name || ' 휴가로 홀이 모자라요. 급여 앱에서 가능 / 불가를 눌러 주세요.');
      perform public.pr_notify('🙋 Mina에게 홀 출근 요청 · ' || public.pr_md(r.day) || E'\n' || r.name || ' 휴가 (홀 빈자리)');
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.pr_hall_call_make(uuid) from public, anon, authenticated;

create or replace function public.pr_hall_call_list() returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare td date := (now() at time zone 'Asia/Manila')::date;
begin
  if not (public.is_owner() or public.pr_is_mina()) then raise exception 'OWNER_ONLY'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'day', c.day, 'status', c.status, 'name', e.name,
            'asked_at', c.asked_at, 'answered_at', c.answered_at, 'open', c.day > td) order by c.day)
    from public.pr_hall_calls c left join public.pr_employees e on e.id = c.leave_emp
    where c.day >= td - 7 and c.status <> 'cancelled'), '[]'::jsonb);
end $$;

create or replace function public.pr_hall_call_answer(p_id uuid, p_ok boolean) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare c public.pr_hall_calls; td date := (now() at time zone 'Asia/Manila')::date;
begin
  if not (public.is_owner() or public.pr_is_mina()) then raise exception 'OWNER_ONLY'; end if;
  select * into c from public.pr_hall_calls where id = p_id for update;
  if not found or c.status = 'cancelled' then return jsonb_build_object('ok', false, 'err', 'not_found'); end if;
  if c.day <= td then return jsonb_build_object('ok', false, 'err', 'past'); end if;
  update public.pr_hall_calls set status = case when p_ok then 'yes' else 'no' end, answered_at = now() where id = p_id;
  -- the daily re-plan (09:40) picks the leave up again and puts Mina on a hall shift that day (or takes her off)
  update public.pr_sil_req set replanned_at = null where grp = c.leave_grp and day = c.day and status = 'approved';
  perform public.pr_notify(case when p_ok
    then '✅ Mina 홀 출근 가능 · ' || public.pr_md(c.day) || E'\n내일 09:40 스케줄 자동 수정 때 홀 근무로 들어가요.'
    else '❌ Mina 홀 출근 불가 · ' || public.pr_md(c.day) || E'\n홀 빈자리 직접 확인해 주세요.' end);
  return jsonb_build_object('ok', true);
end $$;

-- ---------- gap check: Mina's "yes" days count as hall capacity ----------
create or replace function public.pr_leave_gap(p_emp uuid, p_kind text, p_days date[]) returns jsonb
language plpgsql volatile security definer set search_path to 'public' as $$
declare tm text; me text; d date; sun date; nd int; hv int; hv0 int;
begin
  select name into me from public.pr_employees where id = p_emp;
  tm := public.pr_team_of(me);
  if tm is null or p_days is null or cardinality(p_days) = 0 then return null; end if;
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
  where public.pr_team_of(e.name) = tm and (e.resigned_on is null or e.resigned_on > public.pr_min_day(p_days));
  if tm = 'hall' then   -- Mina on the days she said yes (no weekly day off to give)
    insert into _gap_free
    select null, 'Mina', x::date, exists (select 1 from public.pr_hall_calls c where c.day = x::date and c.status = 'yes'), true, false
    from (select distinct generate_series(w - ((extract(isodow from w)::int) % 7), w - ((extract(isodow from w)::int) % 7) + 6, interval '1 day') x
          from unnest(p_days) w) dd;
  end if;
  foreach d in array p_days loop
    nd := public.pr_team_need(tm, d);
    select count(*) into hv from _gap_free where day = d and free;
    if hv < nd then return jsonb_build_object('day', d, 'team', tm, 'need', nd, 'have', hv, 'why', 'day'); end if;
    if tm = 'kitchen' and me in ('Jonel', 'Archie') and nd > 0
       and not exists (select 1 from _gap_free where day = d and free and name = case me when 'Jonel' then 'Archie' else 'Jonel' end) then
      return jsonb_build_object('day', d, 'team', tm, 'why', 'jonel_archie'); end if;
  end loop;
  for sun in select distinct w - ((extract(isodow from w)::int) % 7) from unnest(p_days) w order by 1 loop
    select coalesce(sum(public.pr_team_need(tm, (sun + k))), 0) into nd from generate_series(0, 6) k;
    select coalesce(sum(greatest(f - case when o then 0 else 1 end, 0)), 0),
           coalesce(sum(greatest(f0 - case when o0 then 0 else 1 end, 0)), 0) into hv, hv0
    from (select coalesce(emp::text, name) emp, count(*) filter (where free) f, bool_or(off_leave) o,
                 count(*) filter (where free or req) f0, bool_or(off_leave and not req) o0
          from _gap_free where day between sun and sun + 6 group by 1) s;
    if hv < nd and hv < hv0 then
      return jsonb_build_object('day', (select min(x) from unnest(p_days) x where x between sun and sun + 6),
                                'week', sun, 'team', tm, 'need', nd, 'have', hv, 'why', 'week'); end if;
  end loop;
  return null;
end $$;
revoke execute on function public.pr_leave_gap(uuid, text, date[]) from public, anon, authenticated;

-- ---------- leave request ----------
create or replace function public.pr_emp_leave_request(p_no text, p_pin text, p_kind text, p_from date, p_to date, p_reason text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
declare c record; td date := (now() at time zone 'Asia/Manila')::date; d date; y int; n int; lft numeric; g uuid := gen_random_uuid(); mo date; days date[];
  auto boolean; why text; warn jsonb; nm text; gap jsonb; wgap jsonb; wk date[]; wd date[]; short date; rsn text;
  kl text; rng text;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  if c.must_change then return jsonb_build_object('ok', false, 'err', 'must_change'); end if;
  if p_kind not in ('off', 'sil', 'mpv') or p_from is null or p_to is null or p_to < p_from or p_to - p_from > 13 then
    return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
  select array_agg(x::date order by x) into days from generate_series(p_from, p_to, interval '1 day') x;
  perform pg_advisory_xact_lock(hashtext('pr_sil_' || c.emp_id::text));
  perform pg_advisory_xact_lock(hashtext('pr_leave_gap'));
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
  rsn := nullif(left(trim(coalesce(p_reason, '')), 200), '');
  kl := case p_kind when 'off' then 'Day off (무급)' when 'mpv' then '월 개근 휴가' else 'SIL' end;
  rng := public.pr_md(p_from) || case when p_to > p_from then ' ~ ' || public.pr_md(p_to) else '' end || ' (' || cardinality(days) || '일)';
  select coalesce(array_agg(x order by x) filter (where extract(isodow from x) in (5, 6)), '{}'),
         coalesce(array_agg(x order by x) filter (where extract(isodow from x) not in (5, 6)), '{}') into wk, wd from unnest(days) x;

  -- 1. weekday gap → auto-reject (owner 11/20)
  gap := public.pr_leave_gap(c.emp_id, p_kind, wd);
  if gap is not null then
    insert into public.pr_sil_req (employee_id, day, reason, kind, grp, status, decided_at, note)
    select c.emp_id, x, rsn, p_kind, g, 'rejected', now(), '자동 반려 · 빈자리 ' || public.pr_gap_text(gap) from unnest(days) x;
    perform public.pr_notify('⛔ 휴가 자동 반려 (빈자리) · ' || nm || E'\n' || kl || ' · ' || rng || E'\n' || public.pr_gap_text(gap));
    return jsonb_build_object('ok', false, 'err', 'locked', 'code', 'gap', 'gap', true, 'day', gap->>'day', 'why', gap->>'why', 'grp', g);
  end if;
  -- 2. Fri/Sat gap: 10+ days ahead → allowed; closer → reason + owner approval (owner 11/20 10:04)
  if cardinality(wk) > 0 then wgap := public.pr_leave_gap(c.emp_id, p_kind, days); end if;
  if wgap is not null then
    select min(x) into short from unnest(wk) x where x < td + 10;
    if short is not null and rsn is null then
      return jsonb_build_object('ok', false, 'err', 'locked', 'code', 'need_reason', 'day', short);
    end if;
  end if;

  auto := p_from >= td + 7 and cardinality(days) < 5 and not (wgap is not null and short is not null);
  why := case when wgap is not null and short is not null then 'weekend' when cardinality(days) >= 5 then 'long' when p_from < td + 7 then 'short_notice' end;
  if p_kind = 'off' then warn := public.pr_off_warnings(c.emp_id, days); end if;
  insert into public.pr_sil_req (employee_id, day, reason, kind, grp)
  select c.emp_id, x, rsn, p_kind, g from unnest(days) x;
  if auto then
    perform public.pr_leave_apply(r.id, true, '자동 승인') from public.pr_sil_req r where r.grp = g;
    perform public.pr_notify('✅ 휴가 자동 승인 · ' || nm || E'\n' || kl || ' · ' || rng || ' · 스케줄 반영됨'
      || coalesce(E'\n⚠️ 금·토 빈자리 (10일 전 신청이라 허용) · ' || public.pr_gap_text(wgap), '')
      || coalesce(E'\n⚠️ ' || nullif((select string_agg(split_part(w, ' / ', 1), ', ') from jsonb_array_elements_text(warn) w), ''), ''));
    perform public.pr_hall_call_make(g);
  else
    perform public.pr_notify('🌴 휴가 승인 필요 · ' || nm || E'\n' || kl || ' · ' || rng
      || case why when 'weekend' then ' · 금·토 10일 전 아님 · 빈자리 ' || public.pr_gap_text(wgap)
                  when 'long' then ' · 5일 이상' else ' · 7일 전 아님' end
      || case when why <> 'weekend' and wgap is not null then E'\n⚠️ 금·토 빈자리 · ' || public.pr_gap_text(wgap) else '' end
      || coalesce(E'\n사유: ' || rsn, '')
      || coalesce(E'\n⚠️ ' || nullif((select string_agg(split_part(w, ' / ', 1), ', ') from jsonb_array_elements_text(warn) w), ''), ''));
  end if;
  return jsonb_build_object('ok', true, 'n', cardinality(days), 'grp', g, 'auto', auto, 'why', why);
end $function$;

-- owner approval → hall call for Mina if the hall is short on that Fri/Sat
create or replace function public.pr_leave_decide(p_grp uuid, p_ok boolean, p_note text default null)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare r record; n int := 0;
begin
  if not public.is_owner() then raise exception 'OWNER_ONLY'; end if;
  for r in select id from public.pr_sil_req where grp = p_grp and status = 'pending' order by day loop
    perform public.pr_sil_decide(r.id, p_ok, p_note); n := n + 1;
  end loop;
  if n = 0 then return jsonb_build_object('ok', false, 'err', 'not_pending'); end if;
  if p_ok then perform public.pr_hall_call_make(p_grp); end if;
  return jsonb_build_object('ok', true, 'n', n);
end $function$;

-- old SIL request RPC: Fri/Sat gap → owner approval needs the new app, so keep refusing any gap
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
  if gap is not null then return jsonb_build_object('ok', false, 'err', 'locked', 'code', 'gap', 'gap', true, 'day', gap->>'day', 'why', gap->>'why'); end if;
  insert into public.pr_sil_req (employee_id, day, reason)
  select c.emp_id, x, nullif(left(trim(coalesce(p_reason, '')), 200), '') from (select distinct unnest(p_days) x) u;
  return jsonb_build_object('ok', true, 'n', cardinality(p_days));
end $function$;
