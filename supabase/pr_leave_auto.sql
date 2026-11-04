-- 휴가 자동 승인 (사장님 2026-11-04 22:28)
--  • 7일 이상 전에 신청 + 4일 이하 → 바로 자동 승인, 스케줄 자동 반영 (off → OFF, sil·mpv → SIL)
--  • 7일 전이 안 된 신청 → 사장님 수동 승인
--  • 5일 이상 (기간 길이) → 무조건 사장님 수동 승인
--  (종류 3가지 모두 같은 규칙. 예전 "Day off 7일 전까지만 신청" 차단은 없애고 수동 승인으로)
--  푸시: 수동이면 "승인 필요", 자동이면 "자동 승인됨" (휴무 규칙 경고가 있으면 같이)

-- 승인 처리 (사장님 확인 없이 내부용)
create or replace function public.pr_leave_apply(p_id uuid, p_ok boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.pr_sil_req;
begin
  select * into r from public.pr_sil_req where id = p_id for update;
  if not found or r.status <> 'pending' then return; end if;
  if p_ok then
    insert into public.pr_plan (day, employee_id, shift) values (r.day, r.employee_id, case when r.kind = 'off' then 'off' else 'sil' end)
    on conflict (day, employee_id) do update set shift = excluded.shift;
  end if;
  update public.pr_sil_req set status = case when p_ok then 'approved' else 'rejected' end, decided_at = now(), note = nullif(trim(coalesce(p_note, '')), '') where id = p_id;
end $$;
revoke all on function public.pr_leave_apply(uuid, boolean, text) from public, anon, authenticated;

create or replace function public.pr_sil_decide(p_id uuid, p_ok boolean, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'OWNER_ONLY'; end if;
  if not exists (select 1 from public.pr_sil_req where id = p_id and status = 'pending') then return jsonb_build_object('ok', false, 'err', 'not_pending'); end if;
  perform public.pr_leave_apply(p_id, p_ok, p_note);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.pr_emp_leave_request(p_no text, p_pin text, p_kind text, p_from date, p_to date, p_reason text)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare c record; td date := (now() at time zone 'Asia/Manila')::date; d date; y int; n int; lft numeric; g uuid := gen_random_uuid(); mo date; days date[];
  auto boolean; why text; warn jsonb; nm text;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  if c.must_change then return jsonb_build_object('ok', false, 'err', 'must_change'); end if;
  if p_kind not in ('off', 'sil', 'mpv') or p_from is null or p_to is null or p_to < p_from or p_to - p_from > 13 then
    return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
  select array_agg(x::date order by x) into days from generate_series(p_from, p_to, interval '1 day') x;
  perform pg_advisory_xact_lock(hashtext('pr_sil_' || c.emp_id::text));
  foreach d in array days loop
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
end $$;
grant execute on function public.pr_emp_leave_request(text, text, text, date, date, text) to anon, authenticated;

-- 신청 알림은 위 함수에서 보냄 (자동/수동 구분) → 예전 묶음 트리거는 끔 (옛 화면의 하루씩 SIL 신청만 계속 알림)
create or replace function public.pr_sil_req_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare g record;
begin
  for g in select n.employee_id, n.id, n.day, n.reason from nr n where n.status = 'pending' and n.grp is null loop
    perform public.pr_notify('🌴 휴가 승인 필요 · ' || (select name from public.pr_employees where id = g.employee_id) || E'\nSIL · ' || public.pr_md(g.day)
      || coalesce(E'\n사유: ' || g.reason, ''));
  end loop;
  return null;
end $$;
