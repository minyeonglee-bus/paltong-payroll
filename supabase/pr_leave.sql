-- 휴가 신청 3종 + 기간 신청 (사장님 2026-11-04)
--  kind: off  = 1 day off (휴무 신청, 무급 — 승인되면 스케줄 OFF)
--        sil  = SIL (법정 유급휴가, 연 5일 기본)
--        mpv  = Monthly paid vacation (계약서 3.2조 개근 휴가)
--  • 시작일~끝일을 한 번에 신청 → 같은 grp 로 묶여 승인/반려도 한 번에.
--  • 계약서 3.2조: 그 달 무단결근 0 + 1분 이상 지각 0 → 다음 달 안에 쓰는 유급휴가 1일, 현금 전환 없음.
--    판정: 그 달 두 급여(1–15·16–말일)가 확정(지급/공유)되고 지각·결근이 없으며, 앱 출근 지각 기록(무효 제외)이 없을 것.
--    → 자동 적립(계산), 다음 달 말일 지나면 소멸. 첫 판정 = 2026년 11월 → 12월 사용분.
--  • 그동안 SIL 잔여에 더하던 개근 +1일은 SIL에서 빼고 월 개근휴가로 분리 (아직 적립된 날 없음).
--  • 승인 시 스케줄: off → 'off', sil·mpv → 'sil' (급여는 유급휴가 1일, 캐시북엔 휴무). SIL 사용 집계에서 mpv 날짜는 제외.
--  • 휴무 신청 승인 화면에 스케줄 규칙 경고 (주 2회 초과, 연속 휴무, 휴무 사이 근무 2일 미만, 6일 넘게 연속 근무, Jonel·Archie 같은 날).
alter table public.pr_sil_req add column if not exists kind text not null default 'sil';
alter table public.pr_sil_req drop constraint if exists pr_sil_req_kind_chk;
alter table public.pr_sil_req add constraint pr_sil_req_kind_chk check (kind in ('off', 'sil', 'mpv'));
alter table public.pr_sil_req add column if not exists grp uuid;
create index if not exists pr_sil_req_grp_idx on public.pr_sil_req(grp);

-- 3.2조 개근 판정: true / false / null(아직 급여 확정 전)
create or replace function public.pr_perfect_month(p_emp uuid, m date)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare n_fin int; n_bad int;
begin
  select count(*), count(*) filter (where coalesce((p.result->>'lateMinutes')::numeric, 0) > 0 or coalesce((p.result->>'absentDays')::numeric, 0) > 0
                                         or coalesce((p.result->>'late')::numeric, 0) > 0)
    into n_fin, n_bad from public.pr_payrolls p
   where p.employee_id = p_emp and p.period_start in (m, m + 15) and (p.status = 'paid' or p.shared_at is not null);
  if n_bad > 0 or exists (select 1 from public.pr_punches x where x.employee_id = p_emp and x.kind = 'in' and x.status <> 'void' and coalesce(x.dev_min, 0) > 0
                            and (x.punched_at at time zone 'Asia/Manila')::date >= m and (x.punched_at at time zone 'Asia/Manila')::date < (m + interval '1 month')::date) then
    return false;
  end if;
  return case when n_fin >= 2 then true else null end;
end $$;

-- 월 개근휴가 목록 (2026-11부터 이번 달까지): 개근한 달 → 다음 달에 1일
create or replace function public.pr_mpv(p_emp uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare td date := (now() at time zone 'Asia/Manila')::date; cur date := date_trunc('month', td)::date; m date := date '2026-11-01';
  c date; pf boolean; used jsonb; pend int; lft int; out jsonb := '[]'::jsonb; st text;
begin
  while m <= cur loop
    c := (m + interval '1 month')::date;
    pf := case when m < cur then public.pr_perfect_month(p_emp, m) else null end;
    select coalesce(jsonb_agg(to_char(r.day, 'YYYY-MM-DD') order by r.day), '[]'::jsonb) into used from public.pr_sil_req r
     where r.employee_id = p_emp and r.kind = 'mpv' and r.status = 'approved' and r.day >= c and r.day < (c + interval '1 month')::date;
    select count(*) into pend from public.pr_sil_req r
     where r.employee_id = p_emp and r.kind = 'mpv' and r.status = 'pending' and r.day >= c and r.day < (c + interval '1 month')::date;
    lft := case when pf then greatest(1 - jsonb_array_length(used) - pend, 0) else 0 end;
    st := case when pf is null then case when m = cur then 'counting' else 'waiting' end
               when not pf then 'none'
               when jsonb_array_length(used) >= 1 then 'used'
               when c < cur then 'expired'
               when pend > 0 then 'pending' else 'available' end;
    if st = 'expired' then lft := 0; end if;
    out := out || jsonb_build_object('month', to_char(m, 'YYYY-MM'), 'perfect', pf, 'credit', to_char(c, 'YYYY-MM'),
      'expires', to_char((c + interval '1 month - 1 day')::date, 'YYYY-MM-DD'), 'used', used, 'pending', pend, 'left', lft, 'status', st);
    m := c;
  end loop;
  return out;
end $$;

create or replace function public.pr_mpv_left(p_emp uuid, p_month date)
returns int language sql stable security definer set search_path = public as $$
  select coalesce((select (x->>'left')::int from jsonb_array_elements(public.pr_mpv(p_emp)) x
                   where x->>'credit' = to_char(p_month, 'YYYY-MM')), 0) $$;

-- SIL 요약: 개근 +1 분리 (earned 0), 월 개근휴가 날짜는 SIL 사용에서 제외, mpv 목록 포함
create or replace function public.pr_sil_summary(p_emp uuid, p_year int)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a record; used jsonb; planned jsonb; mpv_days text[]; mp jsonb := public.pr_mpv(p_emp);
begin
  select coalesce(array_agg(to_char(r.day, 'YYYY-MM-DD')), '{}') into mpv_days from public.pr_sil_req r
   where r.employee_id = p_emp and r.kind = 'mpv' and r.status = 'approved';
  select allowance, used_before, self_set_at into a from public.pr_sil where employee_id = p_emp and year = p_year;
  select coalesce(jsonb_agg(distinct x->>'date'), '[]'::jsonb) into used from public.pr_payrolls p, jsonb_array_elements(p.days) x
   where p.employee_id = p_emp and x->>'type' = 'sil' and (x->>'date') like p_year || '-%' and not ((x->>'date') = any(mpv_days));
  select coalesce(jsonb_agg(to_char(q.day, 'YYYY-MM-DD') order by q.day), '[]'::jsonb) into planned from public.pr_plan q
   where q.employee_id = p_emp and q.shift = 'sil' and extract(year from q.day) = p_year
     and not (used ? to_char(q.day, 'YYYY-MM-DD')) and not (to_char(q.day, 'YYYY-MM-DD') = any(mpv_days));
  return jsonb_build_object('year', p_year, 'allowance', coalesce(a.allowance, 5), 'used_before', coalesce(a.used_before, 0), 'self_set_at', a.self_set_at,
    'earned', 0, 'months', (select coalesce(jsonb_agg(jsonb_build_object('month', x->>'month', 'perfect', (x->>'perfect')::boolean, 'credit', x->>'credit')), '[]'::jsonb)
                              from jsonb_array_elements(mp) x), 'mpv', mp, 'used', used, 'planned', planned);
end $$;

create or replace function public.pr_sil_left(p_emp uuid, p_year int)
returns numeric language sql stable security definer set search_path = public as $$
  select (x->>'allowance')::numeric - jsonb_array_length(x->'used') - (x->>'used_before')::numeric - jsonb_array_length(x->'planned')
         - (select count(*) from public.pr_sil_req r where r.employee_id = p_emp and r.status = 'pending' and r.kind = 'sil' and extract(year from r.day) = p_year)
  from (select public.pr_sil_summary(p_emp, p_year) x) s $$;

-- 근무표 (급여 계획 우선, 없으면 캐시북) — 경고 계산용
create or replace function public.pr_plan_day(p_emp uuid, p_day date)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select q.shift from public.pr_plan q where q.employee_id = p_emp and q.day = p_day and q.shift is not null),
                  (select x.shift from public.shifts x join public.pr_employees e on lower(trim(e.name)) = lower(trim(x.staff_name))
                    where e.id = p_emp and x.day = p_day and x.shift is not null limit 1)) $$;

-- 휴무 신청 경고 (days 를 휴무로 바꾼다고 가정)
create or replace function public.pr_off_warnings(p_emp uuid, p_days date[])
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d0 date := (select min(x) from unnest(p_days) x); d1 date := (select max(x) from unnest(p_days) x);
  d date; s text; st text[] := '{}'; ds date[] := '{}'; i int; j int; w date; n int; run int; out jsonb := '[]'::jsonb;
  nm text := (select name from public.pr_employees where id = p_emp); other uuid; gap int; lastoff int := null;
begin
  if d0 is null then return out; end if;
  d := d0 - 10;
  while d <= d1 + 10 loop
    s := case when d = any(p_days) then 'off' else coalesce(public.pr_plan_day(p_emp, d), '') end;
    ds := ds || d; st := st || s; d := d + 1;
  end loop;
  -- 주(일~토)별 휴무 수
  for w in select distinct (x - extract(dow from x)::int) from unnest(p_days) x loop
    select count(*) into n from generate_series(1, array_length(ds, 1)) k where ds[k] between w and w + 6 and st[k] = 'off';
    if n > 2 then out := out || to_jsonb(format('%s~%s 주 휴무 %s번 (최대 2) / %s offs that week (max 2)', to_char(w, 'MM/DD'), to_char(w + 6, 'MM/DD'), n, n)); end if;
  end loop;
  for i in 1 .. array_length(ds, 1) loop
    if st[i] = 'off' then
      if lastoff is not null then
        gap := i - lastoff - 1;
        if (ds[i] = any(p_days) or ds[lastoff] = any(p_days)) then
          if gap = 0 then out := out || to_jsonb(format('%s·%s 연속 휴무 / back-to-back off', to_char(ds[lastoff], 'MM/DD'), to_char(ds[i], 'MM/DD')));
          elsif gap < 2 then out := out || to_jsonb(format('%s~%s 휴무 사이 근무 %s일 (2일 이상) / only %s work day between offs', to_char(ds[lastoff], 'MM/DD'), to_char(ds[i], 'MM/DD'), gap, gap)); end if;
        end if;
      end if;
      lastoff := i;
    end if;
  end loop;
  -- 6일 넘게 연속 근무 (휴무로 바뀐 날 주변은 줄어드니 기존 문제만 남음 — 참고용)
  run := 0;
  for i in 1 .. array_length(ds, 1) loop
    if st[i] not in ('', 'off', 'sil') then run := run + 1; else run := 0; end if;
    if run = 7 then out := out || to_jsonb(format('%s까지 7일 연속 근무 / 7 work days in a row', to_char(ds[i], 'MM/DD'))); end if;
  end loop;
  -- Jonel · Archie 같은 날 휴무 금지
  if nm in ('Jonel', 'Archie') then
    select id into other from public.pr_employees where name = case when nm = 'Jonel' then 'Archie' else 'Jonel' end;
    foreach d in array p_days loop
      if public.pr_plan_day(other, d) in ('off', 'sil') or exists (select 1 from public.pr_sil_req r where r.employee_id = other and r.day = d and r.status = 'pending') then
        out := out || to_jsonb(format('%s Jonel·Archie 같은 날 휴무 / both off', to_char(d, 'MM/DD')));
      end if;
    end loop;
  end if;
  return out;
end $$;

-- 직원 휴가 신청 (기간)
create or replace function public.pr_emp_leave_request(p_no text, p_pin text, p_kind text, p_from date, p_to date, p_reason text)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare c record; td date := (now() at time zone 'Asia/Manila')::date; d date; y int; n int; lft numeric; g uuid := gen_random_uuid(); mo date; days date[];
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
  insert into public.pr_sil_req (employee_id, day, reason, kind, grp)
  select c.emp_id, x, nullif(left(trim(coalesce(p_reason, '')), 200), ''), p_kind, g from unnest(days) x;
  return jsonb_build_object('ok', true, 'n', cardinality(days), 'grp', g);
end $$;
grant execute on function public.pr_emp_leave_request(text, text, text, date, date, text) to anon, authenticated;

-- 직원: 묶음 취소 (대기 중인 것만)
create or replace function public.pr_emp_leave_cancel(p_no text, p_pin text, p_grp uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c record; n int;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  update public.pr_sil_req set status = 'cancelled', decided_at = now() where grp = p_grp and employee_id = c.emp_id and status = 'pending';
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok', false, 'err', 'not_pending'); end if;
  return jsonb_build_object('ok', true, 'n', n);
end $$;
grant execute on function public.pr_emp_leave_cancel(text, text, uuid) to anon, authenticated;

-- 사장님: 한 건 승인/반려 (종류별 스케줄)
create or replace function public.pr_sil_decide(p_id uuid, p_ok boolean, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.pr_sil_req;
begin
  if not public.is_owner() then raise exception 'OWNER_ONLY'; end if;
  select * into r from public.pr_sil_req where id = p_id for update;
  if not found or r.status <> 'pending' then return jsonb_build_object('ok', false, 'err', 'not_pending'); end if;
  if p_ok then
    insert into public.pr_plan (day, employee_id, shift) values (r.day, r.employee_id, case when r.kind = 'off' then 'off' else 'sil' end)
    on conflict (day, employee_id) do update set shift = excluded.shift;
  end if;
  update public.pr_sil_req set status = case when p_ok then 'approved' else 'rejected' end, decided_at = now(), note = nullif(trim(coalesce(p_note, '')), '') where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- 사장님: 묶음 승인/반려
create or replace function public.pr_leave_decide(p_grp uuid, p_ok boolean, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  if not public.is_owner() then raise exception 'OWNER_ONLY'; end if;
  for r in select id from public.pr_sil_req where grp = p_grp and status = 'pending' order by day loop
    perform public.pr_sil_decide(r.id, p_ok, p_note); n := n + 1;
  end loop;
  if n = 0 then return jsonb_build_object('ok', false, 'err', 'not_pending'); end if;
  return jsonb_build_object('ok', true, 'n', n);
end $$;
grant execute on function public.pr_leave_decide(uuid, boolean, text) to authenticated;

-- 사장님 목록: 종류·묶음·휴무 경고·월 개근휴가 잔여
create or replace function public.pr_sil_req_list(p_days int default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'OWNER_ONLY'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'employee_id', r.employee_id, 'name', e.name, 'day', r.day, 'reason', r.reason, 'status', r.status,
      'created_at', r.created_at, 'decided_at', r.decided_at, 'note', r.note, 'kind', r.kind, 'grp', r.grp,
      'plan', (select q.shift from public.pr_plan q where q.employee_id = r.employee_id and q.day = r.day),
      'left', case when r.kind = 'sil' then public.pr_sil_left(r.employee_id, extract(year from r.day)::int)
                   when r.kind = 'mpv' then public.pr_mpv_left(r.employee_id, date_trunc('month', r.day)::date) end,
      'warn', case when r.kind = 'off' and r.status = 'pending' then public.pr_off_warnings(r.employee_id,
                (select array_agg(z.day) from public.pr_sil_req z where z.grp is not distinct from r.grp and z.employee_id = r.employee_id and z.status = 'pending'
                   and (r.grp is not null or z.id = r.id))) end) order by r.status <> 'pending', r.day)
    from public.pr_sil_req r join public.pr_employees e on e.id = r.employee_id
    where r.status = 'pending' or r.decided_at > now() - make_interval(days => p_days)), '[]'::jsonb);
end $$;

-- 직원 화면 신청 목록에 종류·묶음
do $do$ declare d text := pg_get_functiondef('public.pr_emp_view(text,text)'::regprocedure); n text;
begin
  if position($a$'grp', r.grp$a$ in d) > 0 then return; end if;
  n := replace(d, $a$'id', r.id, 'day', r.day, 'reason', r.reason, 'status', r.status, 'note', r.note)$a$,
                  $a$'id', r.id, 'day', r.day, 'reason', r.reason, 'status', r.status, 'note', r.note, 'kind', r.kind, 'grp', r.grp)$a$);
  if n = d then raise exception 'sil_reqs kind patch not applied'; end if;
  execute n;
end $do$;
