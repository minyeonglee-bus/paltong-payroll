-- ☕ Break time In / Out + check against customer time (owner 2026-11-26 04:10–04:13, from 11/26 morning).
-- Rules (notice 2026-11-26-break):
--   • Rest only when your work is done or there are no customers. Break while customers are in → IR.
--   • Staff press ☕ Break start / Break end in the app (only while clocked in).
--   • "Customers / work" = dine-in tables open + delivery/pickup orders being made (order app, busy_spans_ext).
--   • Meal break (pr_settings.break_hours, riders 0) not fully taken in a shift:
--       – the part that could NOT be taken because customers were there the whole time → PAID (pr_ledger bonus).
--       – the part where there WAS a no-customer window (10 min+) but the employee did not rest → NOT paid,
--         treated as not resting on purpose for the pay = dishonesty → explanation letter (owner notified, one-tap IR).
--   • Checked after clock-out by cron every 15 min (sessions clocked in from 2026-11-26 06:00 Manila).

create table if not exists public.pr_breaks (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.pr_employees(id) on delete cascade,
  start_at timestamptz not null default now(),
  end_at timestamptz,
  auto_end boolean not null default false,     -- closed by clock-out (forgot to press Break end)
  cust_min int,                                 -- minutes of this break with customers / orders
  cust jsonb,                                   -- which tables / orders
  status text not null default 'ok' check (status in ('ok', 'void')),
  ip text,
  created_at timestamptz not null default now());
create index if not exists pr_breaks_emp_start on public.pr_breaks (employee_id, start_at desc);
create unique index if not exists pr_breaks_one_open on public.pr_breaks (employee_id) where end_at is null and status = 'ok';
alter table public.pr_breaks enable row level security;
drop policy if exists pr_breaks_owner on public.pr_breaks;
create policy pr_breaks_owner on public.pr_breaks for select using (public.is_owner());

create table if not exists public.pr_break_days (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.pr_employees(id) on delete cascade,
  in_id uuid not null unique references public.pr_punches(id) on delete cascade,
  out_id uuid references public.pr_punches(id) on delete set null,
  in_at timestamptz not null, out_at timestamptz not null,
  need_min int not null,       -- meal break owed
  taken_min int not null,      -- breaks pressed
  missed_min int not null,     -- need − taken
  free_min int not null,       -- no-customer windows (10 min+) not used for a break
  paid_min int not null,       -- missed because customers were there → paid
  deceit_min int not null,     -- missed although there was no customer → not paid, explanation letter
  amount numeric not null default 0,
  ledger_id uuid references public.pr_ledger(id) on delete set null,
  spans jsonb,
  created_at timestamptz not null default now());
alter table public.pr_break_days enable row level security;
drop policy if exists pr_break_days_owner on public.pr_break_days;
create policy pr_break_days_owner on public.pr_break_days for select using (public.is_owner());

-- customer / order spans from the order app (null end = still open → now)
create or replace function public.pr_busy_spans(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare s text; r extensions.http_response; j jsonb;
  k text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6ZGhjdW1pYmZseHRxa3F2YnVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyNDI3NDgsImV4cCI6MjEwNTgxODc0OH0.qSEMyhZ9HWEpaGXEupQzYkHxIvUC5Y1yhr5T2N-VD7w';
begin
  select decrypted_secret into s from vault.decrypted_secrets where name = 'rider_duty_secret';
  if s is null then return null; end if;
  begin
    perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '5000');
    r := extensions.http(('POST', 'https://yzdhcumibflxtqkqvbul.supabase.co/rest/v1/rpc/busy_spans_ext',
      array[extensions.http_header('apikey', k), extensions.http_header('Authorization', 'Bearer ' || k)], 'application/json',
      jsonb_build_object('p_secret', s, 'p_from', p_from, 'p_to', p_to)::text)::extensions.http_request);
    if r.status <> 200 then return null; end if;
    j := r.content::jsonb;
    return coalesce((select jsonb_agg(x || jsonb_build_object('end', coalesce(nullif(x->>'end', ''), now()::text)))
                       from jsonb_array_elements(j->'spans') x), '[]'::jsonb);
  exception when others then return null; end;
end $$;
revoke all on function public.pr_busy_spans(timestamptz, timestamptz) from public, anon, authenticated;

create or replace function public.pr_busy_mr(p_spans jsonb) returns tstzmultirange language sql immutable as $$
  select coalesce(range_agg(tstzrange((x->>'start')::timestamptz, (x->>'end')::timestamptz)), '{}'::tstzmultirange)
    from jsonb_array_elements(coalesce(p_spans, '[]'::jsonb)) x
   where (x->>'end')::timestamptz > (x->>'start')::timestamptz
$$;
create or replace function public.pr_mr_min(p tstzmultirange, p_min_len int default 0) returns int language sql immutable as $$
  select coalesce(sum(m)::int, 0) from (select floor(extract(epoch from upper(r) - lower(r)) / 60) m from unnest(p) r) q where m >= p_min_len
$$;
-- spans overlapping [s, e) → [{kind, no, min}]
create or replace function public.pr_busy_hit(p_spans jsonb, p_s timestamptz, p_e timestamptz) returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(jsonb_build_object('kind', x->>'kind', 'no', x->>'no', 'min',
           ceil(extract(epoch from least(p_e, (x->>'end')::timestamptz) - greatest(p_s, (x->>'start')::timestamptz)) / 60))), '[]'::jsonb)
    from jsonb_array_elements(coalesce(p_spans, '[]'::jsonb)) x
   where (x->>'start')::timestamptz < p_e and (x->>'end')::timestamptz > p_s
$$;
revoke all on function public.pr_busy_mr(jsonb) from public, anon;
revoke all on function public.pr_mr_min(tstzmultirange, int) from public, anon;
revoke all on function public.pr_busy_hit(jsonb, timestamptz, timestamptz) from public, anon;

-- last non-void punch of the employee
create or replace function public.pr_last_punch(p_emp uuid) returns public.pr_punches language sql stable as $$
  select * from public.pr_punches where employee_id = p_emp and status <> 'void' order by punched_at desc limit 1
$$;
revoke all on function public.pr_last_punch(uuid) from public, anon, authenticated;

-- close a break and record the customer minutes (spans may be null when the order app does not answer)
create or replace function public.pr_break_close(p_id uuid, p_at timestamptz, p_auto boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b public.pr_breaks; sp jsonb; mins int; hit jsonb; nm text;
begin
  update public.pr_breaks set end_at = greatest(p_at, start_at), auto_end = p_auto where id = p_id and end_at is null returning * into b;
  if b.id is null then return null; end if;
  sp := public.pr_busy_spans(b.start_at - interval '1 minute', b.end_at);
  if sp is not null then
    mins := public.pr_mr_min(public.pr_busy_mr(sp) * tstzmultirange(tstzrange(b.start_at, b.end_at)));
    hit := public.pr_busy_hit(sp, b.start_at, b.end_at);
    update public.pr_breaks set cust_min = mins, cust = hit where id = b.id;
    if mins >= 1 then
      select name into nm from public.pr_employees where id = b.employee_id;
      perform public.pr_notify('☕ 손님 있는 중 휴식 · ' || nm || ' ' || public.pr_hhmi(b.start_at) || '–' || public.pr_hhmi(b.end_at)
        || ' · 손님/주문 ' || mins || '분 (' || (select string_agg(h->>'no', ', ') from jsonb_array_elements(hit) h) || ') → IR 대상');
    end if;
  end if;
  return jsonb_build_object('id', b.id, 'start', b.start_at, 'end', b.end_at, 'cust_min', mins, 'cust', hit);
end $$;
revoke all on function public.pr_break_close(uuid, timestamptz, boolean) from public, anon, authenticated;

-- staff: ☕ break start / end. p_force = start even though customers are in (warned first).
create or replace function public.pr_emp_break(p_no text, p_pin text, p_act text, p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare c record; lp public.pr_punches; ob public.pr_breaks; sp jsonb; hit jsonb; nid uuid;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  lp := public.pr_last_punch(c.emp_id);
  select * into ob from public.pr_breaks where employee_id = c.emp_id and end_at is null and status = 'ok';
  if p_act = 'start' then
    if lp.kind is distinct from 'in' or lp.punched_at < now() - interval '20 hours' then return jsonb_build_object('ok', false, 'err', 'not_in'); end if;
    if ob.id is not null then return jsonb_build_object('ok', false, 'err', 'open', 'start', ob.start_at); end if;
    if not coalesce(p_force, false) then
      sp := public.pr_busy_spans(now() - interval '1 minute', now());
      hit := public.pr_busy_hit(sp, now() - interval '1 minute', now());
      if jsonb_array_length(coalesce(hit, '[]'::jsonb)) > 0 then return jsonb_build_object('ok', false, 'err', 'busy', 'cust', hit); end if;
    end if;
    insert into public.pr_breaks (employee_id, ip) values (c.emp_id, public.pr_client_ip()) returning id into nid;
    return jsonb_build_object('ok', true, 'id', nid, 'at', now());
  elsif p_act = 'end' then
    if ob.id is null then return jsonb_build_object('ok', false, 'err', 'no_open'); end if;
    return jsonb_build_object('ok', true) || public.pr_break_close(ob.id, now(), false);
  end if;
  return jsonb_build_object('ok', false, 'err', 'bad_value');
end $$;
revoke all on function public.pr_emp_break(text, text, text, boolean) from public;
grant execute on function public.pr_emp_break(text, text, text, boolean) to anon, authenticated;

-- staff: open break + recent breaks + recent shift checks (read only)
create or replace function public.pr_emp_breaks(p_no text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  return jsonb_build_object('ok', true,
    'open', (select jsonb_build_object('id', id, 'start', start_at) from public.pr_breaks where employee_id = c.emp_id and end_at is null and status = 'ok'),
    'breaks', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'start', start_at, 'end', end_at, 'auto', auto_end, 'cust_min', cust_min, 'cust', cust) order by start_at desc)
       from (select * from public.pr_breaks where employee_id = c.emp_id and status = 'ok' and start_at > now() - interval '7 days' order by start_at desc limit 30) b), '[]'::jsonb),
    'days', coalesce((select jsonb_agg(to_jsonb(d) - 'spans' - 'employee_id' order by d.in_at desc)
       from (select * from public.pr_break_days where employee_id = c.emp_id and in_at > now() - interval '16 days' order by in_at desc limit 20) d), '[]'::jsonb));
end $$;
revoke all on function public.pr_emp_breaks(text, text) from public;
grant execute on function public.pr_emp_breaks(text, text) to anon, authenticated;

-- after clock-out: close a forgotten break, then check the meal break of the shift
create or replace function public.pr_break_run()
returns int language plpgsql security definer set search_path = public, extensions as $$
declare o record; e public.pr_employees; st public.pr_settings; sp jsonb; ses tstzmultirange; brk tstzmultirange; busy tstzmultirange;
  need int; taken int; missed int; freem int; paid int; deceit int; base int; over int; rate numeric; amt numeric; lid uuid; n int := 0; d date;
begin
  select * into st from public.pr_settings where id = 1;
  for o in
    select po.id out_id, po.punched_at out_at, po.employee_id,
           (select pi.id from public.pr_punches pi where pi.employee_id = po.employee_id and pi.kind = 'in' and pi.status <> 'void'
             and pi.punched_at < po.punched_at and pi.punched_at > po.punched_at - interval '20 hours' order by pi.punched_at desc limit 1) in_id
      from public.pr_punches po
     where po.kind = 'out' and po.status <> 'void' and po.punched_at > now() - interval '3 days' and po.punched_at < now() - interval '5 minutes'
  loop
    continue when o.in_id is null or exists (select 1 from public.pr_break_days where in_id = o.in_id);
    continue when (select punched_at from public.pr_punches where id = o.in_id) < timestamptz '2026-11-26 06:00+08';
    -- forgotten break → closed at clock-out
    perform public.pr_break_close(b.id, o.out_at, true) from public.pr_breaks b
      where b.employee_id = o.employee_id and b.end_at is null and b.status = 'ok' and b.start_at < o.out_at;
    select * into e from public.pr_employees where id = o.employee_id;
    ses := tstzmultirange(tstzrange((select punched_at from public.pr_punches where id = o.in_id), o.out_at));
    sp := public.pr_busy_spans(lower(ses), o.out_at);
    continue when sp is null;   -- order app did not answer → try again next run
    select coalesce(range_agg(tstzrange(greatest(b.start_at, lower(ses)), least(coalesce(b.end_at, o.out_at), o.out_at))), '{}'::tstzmultirange) into brk
      from public.pr_breaks b where b.employee_id = o.employee_id and b.status = 'ok' and b.start_at < o.out_at and coalesce(b.end_at, o.out_at) > lower(ses);
    busy := public.pr_busy_mr(sp);
    base := public.pr_mr_min(ses);
    need := case when e.position = 'rider' or base < 360 then 0 else round(coalesce(st.break_hours, 1) * 60)::int end;
    taken := public.pr_mr_min(brk * ses);
    missed := greatest(0, need - taken);
    freem := public.pr_mr_min(ses - busy - brk, 10);
    deceit := least(missed, freem);
    paid := missed - deceit;
    -- pay for the meal break that could not be taken: hourly = daily ÷ 8; the part over 8 worked hours at 125 %
    rate := coalesce(nullif(e.daily_rate, 0), 718) / 8.0;
    over := least(paid, greatest(0, (base - need + paid) - 480));
    amt := round((rate * (paid - over) + rate * 1.25 * over) / 60.0, 2);
    d := (lower(ses) at time zone 'Asia/Manila')::date;
    lid := null;
    if paid >= 1 and amt > 0 then
      insert into public.pr_ledger (employee_id, kind, biz_date, amount, note, note_en, verified, authorized)
      values (e.id, 'bonus', d, amt,
        '☕ 식사 휴게 못 씀 (손님 계속 있음) ' || to_char(d, 'MM/DD') || ' · ' || paid || '분 지급 (휴게 ' || taken || '/' || need || '분)',
        '☕ Meal break not possible (customers the whole time) ' || to_char(d, 'MM/DD') || ' · ' || paid || ' min paid (break ' || taken || '/' || need || ' min)', true, true)
      returning id into lid;
    end if;
    insert into public.pr_break_days (employee_id, in_id, out_id, in_at, out_at, need_min, taken_min, missed_min, free_min, paid_min, deceit_min, amount, ledger_id, spans)
    values (e.id, o.in_id, o.out_id, lower(ses), o.out_at, need, taken, missed, freem, paid, deceit, case when paid >= 1 then coalesce(amt, 0) else 0 end, lid, sp);
    if deceit >= 10 then
      perform public.pr_notify('📝 사유서 대상 · ' || e.name || ' ' || to_char(d, 'MM/DD') || ' — 손님 없는 시간 ' || freem || '분 있었는데 휴게 ' || taken || '/' || need
        || '분만 씀 (' || deceit || '분 안 쉼 · 급여 때문에 안 쉰 것으로 봄 · 미지급)');
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.pr_break_run() from public, anon, authenticated;

-- owner: breaks + shift checks
create or replace function public.pr_break_admin(p_days int default 14)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'not allowed'; end if;
  return jsonb_build_object(
    'breaks', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'employee_id', b.employee_id, 'name', e.name, 'start', b.start_at, 'end', b.end_at, 'auto', b.auto_end, 'cust_min', b.cust_min, 'cust', b.cust) order by b.start_at desc)
       from public.pr_breaks b join public.pr_employees e on e.id = b.employee_id where b.status = 'ok' and b.start_at > now() - make_interval(days => p_days)), '[]'::jsonb),
    'days', coalesce((select jsonb_agg((to_jsonb(d) - 'spans') || jsonb_build_object('name', e.name) order by d.in_at desc)
       from public.pr_break_days d join public.pr_employees e on e.id = d.employee_id where d.in_at > now() - make_interval(days => p_days)), '[]'::jsonb));
end $$;
revoke all on function public.pr_break_admin(int) from public, anon;
grant execute on function public.pr_break_admin(int) to authenticated;

select cron.unschedule('pr-break-run') where exists (select 1 from cron.job where jobname = 'pr-break-run');
select cron.schedule('pr-break-run', '*/15 * * * *', 'select public.pr_break_run()');
