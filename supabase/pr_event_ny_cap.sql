-- New Year sign-up caps (owner 2026-11-10 17:39: "12/31 근무 마감 · 1/1 1명 남음 · 31일 인원 빠지면 자리 남았다고 알림")
--   12/31 → closed at the 8 people already signed up (max 8). 1/1 → max 2 (1 signed up → 1 spot left).
--   A "work" answer on a full day is refused ('ev_full'). When someone switches work → off and a spot opens,
--   the owner gets a push "🎆 12/31 자리 1개 남음" and the staff card shows the open spot (the work button unlocks).
create or replace function public.pr_event_max(p_event text, p_day date) returns int language sql immutable as $$
  select case when p_event = 'ny2027' and p_day = date '2026-12-31' then 8
              when p_event = 'ny2027' and p_day = date '2027-01-01' then 2 end
$$;

create or replace function public.pr_emp_event_get(p_no text, p_pin text, p_event text)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare c record;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  return jsonb_build_object('ok', true,
    'resp', coalesce((select jsonb_agg(jsonb_build_object('day', to_char(r.day, 'YYYY-MM-DD'), 'choice', r.choice, 'at', r.updated_at,
        'shift', (select q.shift from public.pr_plan q where q.employee_id = r.employee_id and q.day = r.day)))
      from public.pr_event_resp r where r.event = p_event and r.employee_id = c.emp_id), '[]'::jsonb),
    'work', coalesce((select jsonb_object_agg(x.d, x.n) from (select to_char(day, 'YYYY-MM-DD') d, count(*) n from public.pr_event_resp
      where event = p_event and choice = 'work' group by day) x), '{}'::jsonb),
    'max', jsonb_build_object('2026-12-31', public.pr_event_max(p_event, date '2026-12-31'), '2027-01-01', public.pr_event_max(p_event, date '2027-01-01')));
end $$;

create or replace function public.pr_emp_event_set(p_no text, p_pin text, p_event text, p_day date, p_choice text)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare c record; e public.pr_employees; sh text := public.pr_event_shift(p_event, p_day); prev text; mine text; others text;
  mx int := public.pr_event_max(p_event, p_day); n int; td date := (now() at time zone 'Asia/Manila')::date;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  if c.must_change then return jsonb_build_object('ok', false, 'err', 'must_change'); end if;
  if sh is null or p_choice not in ('work', 'off') then return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
  if p_day <= td then return jsonb_build_object('ok', false, 'err', 'ev_closed'); end if;
  select * into e from public.pr_employees where id = c.emp_id;
  if e.resigned_on is not null then return jsonb_build_object('ok', false, 'err', 'resigned'); end if;
  select r.choice into prev from public.pr_event_resp r where r.event = p_event and r.day = p_day and r.employee_id = c.emp_id;
  if prev is not distinct from p_choice then return jsonb_build_object('ok', true); end if;
  perform pg_advisory_xact_lock(hashtext('pr_event:' || p_event || p_day::text));
  if p_choice = 'work' and mx is not null
     and (select count(*) from public.pr_event_resp where event = p_event and day = p_day and choice = 'work' and employee_id <> c.emp_id) >= mx then
    return jsonb_build_object('ok', false, 'err', 'ev_full', 'max', mx);
  end if;
  insert into public.pr_event_resp (event, day, employee_id, choice) values (p_event, p_day, c.emp_id, p_choice)
    on conflict (event, day, employee_id) do update set choice = excluded.choice, updated_at = now();
  if not exists (select 1 from public.pr_plan q where q.employee_id = c.emp_id and q.day = p_day and q.shift = 'sil') then
    insert into public.pr_plan (day, employee_id, shift) values (p_day, c.emp_id, case when p_choice = 'work' then sh else 'off' end)
      on conflict (day, employee_id) do update set shift = excluded.shift;
  end if;
  perform public.pr_event_assign(p_event, p_day);
  select q.shift into mine from public.pr_plan q where q.employee_id = c.emp_id and q.day = p_day;
  select count(*) into n from public.pr_event_resp where event = p_event and day = p_day and choice = 'work';
  select string_agg(pe.name || ' ' || q.shift, ', ' order by q.shift) into others from public.pr_event_resp r
    join public.pr_employees pe on pe.id = r.employee_id join public.pr_plan q on q.employee_id = r.employee_id and q.day = r.day
   where r.event = p_event and r.day = p_day and r.choice = 'work';
  begin
    perform public.pr_notify(
      case when prev = 'work' and p_choice = 'off' and mx is not null and n < mx
           then '🎆 ' || to_char(p_day, 'MM/DD') || ' 자리 ' || (mx - n) || '개 남음 · ' || e.name || ' 빠짐'
           else '🎆 연말 근무 응답 · ' || e.name end
      || E'\n' || to_char(p_day, 'MM/DD') || ' '
      || case when p_choice = 'work' then '근무 원함 (' || coalesce(mine, sh) || ')' else '휴무 원함' end
      || case when prev is not null then ' (변경)' else '' end
      || case when mx is not null then ' · ' || n || '/' || mx || case when n >= mx then ' 마감' else '' end else '' end
      || coalesce(E'\n근무: ' || others, E'\n근무: 없음'));
  exception when others then null; end;
  return jsonb_build_object('ok', true, 'shift', mine);
end $$;
