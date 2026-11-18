-- 1/1 store duty hours depend on how many people signed up (owner 2026-11-10 09:13):
--   1 person  → 05:00 1/1 – 08:00 1/2  (saved as '5-32' = 27 hours; 32 = 08:00 next day)
--   2 people  → first to sign up 05:00–17:00 ('5-17'), second 17:00–08:00 ('17-8')
--   max 2 — a third "work" answer is refused ('ev_full'). When someone switches to "off" the rest are re-assigned.
create or replace function public.pr_event_assign(p_event text, p_day date) returns void
language plpgsql security definer set search_path to 'public' as $$
declare r record; n int; i int := 0; sh text;
begin
  if not (p_event = 'ny2027' and p_day = date '2027-01-01') then return; end if;
  select count(*) into n from public.pr_event_resp where event = p_event and day = p_day and choice = 'work';
  for r in select employee_id from public.pr_event_resp where event = p_event and day = p_day and choice = 'work' order by updated_at, employee_id loop
    i := i + 1;
    sh := case when n = 1 then '5-32' when i = 1 then '5-17' else '17-8' end;
    if not exists (select 1 from public.pr_plan q where q.employee_id = r.employee_id and q.day = p_day and q.shift = 'sil') then
      insert into public.pr_plan (day, employee_id, shift) values (p_day, r.employee_id, sh)
        on conflict (day, employee_id) do update set shift = excluded.shift;
    end if;
  end loop;
end $$;
revoke all on function public.pr_event_assign(text, date) from public, anon, authenticated;

create or replace function public.pr_event_shift(p_event text, p_day date) returns text language sql immutable as $$
  select case when p_event = 'ny2027' and p_day = date '2026-12-31' then '17-5'
              when p_event = 'ny2027' and p_day = date '2027-01-01' then '5-32' end
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
      where event = p_event and choice = 'work' group by day) x), '{}'::jsonb));
end $$;

create or replace function public.pr_emp_event_set(p_no text, p_pin text, p_event text, p_day date, p_choice text)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare c record; e public.pr_employees; sh text := public.pr_event_shift(p_event, p_day); prev text; mine text; others text;
  td date := (now() at time zone 'Asia/Manila')::date;
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
  if p_choice = 'work' and p_day = date '2027-01-01'
     and (select count(*) from public.pr_event_resp where event = p_event and day = p_day and choice = 'work' and employee_id <> c.emp_id) >= 2 then
    return jsonb_build_object('ok', false, 'err', 'ev_full');
  end if;
  insert into public.pr_event_resp (event, day, employee_id, choice) values (p_event, p_day, c.emp_id, p_choice)
    on conflict (event, day, employee_id) do update set choice = excluded.choice, updated_at = now();
  if not exists (select 1 from public.pr_plan q where q.employee_id = c.emp_id and q.day = p_day and q.shift = 'sil') then
    insert into public.pr_plan (day, employee_id, shift) values (p_day, c.emp_id, case when p_choice = 'work' then sh else 'off' end)
      on conflict (day, employee_id) do update set shift = excluded.shift;
  end if;
  perform public.pr_event_assign(p_event, p_day);
  select q.shift into mine from public.pr_plan q where q.employee_id = c.emp_id and q.day = p_day;
  select string_agg(pe.name || ' ' || q.shift, ', ' order by q.shift) into others from public.pr_event_resp r
    join public.pr_employees pe on pe.id = r.employee_id join public.pr_plan q on q.employee_id = r.employee_id and q.day = r.day
   where r.event = p_event and r.day = p_day and r.choice = 'work';
  begin
    perform public.pr_notify('🎆 연말 근무 응답 · ' || e.name || E'\n' || to_char(p_day, 'MM/DD') || ' '
      || case when p_choice = 'work' then '근무 원함 (' || coalesce(mine, sh) || ')' else '휴무 원함' end
      || case when prev is not null then ' (변경)' else '' end
      || coalesce(E'\n근무: ' || others, E'\n근무: 없음'));
  exception when others then null; end;
  return jsonb_build_object('ok', true, 'shift', mine);
end $$;

-- Advance limit (owner 2026-11-10: "31일 및 1월1일은 당일 지급 가불x"): the event days are paid on the day,
-- so they never count as cutoff work days in the advance limit.
do $do$ declare d text := pg_get_functiondef('public.pr_adv_limit(uuid)'::regprocedure); n text;
begin
  if position('pr_event_shift' in d) > 0 then return; end if;
  n := replace(d, $a$  where u.shift <> 'off';$a$, $a$  where u.shift <> 'off' and public.pr_event_shift('ny2027', u.day) is null;   -- event days paid on the day$a$);
  if n = d then raise exception 'adv limit patch not applied'; end if;
  execute n;
end $do$;
