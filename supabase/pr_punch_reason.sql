-- Clock in/out outside the schedule (even 1 minute) needs a written reason + owner approval.
alter table public.pr_punches add column if not exists plan_shift text;
alter table public.pr_punches add column if not exists dev_min int;
alter table public.pr_punches add column if not exists reason text;
alter table public.pr_punches add column if not exists status text not null default 'ok';
alter table public.pr_punches add column if not exists decided_at timestamptz;
alter table public.pr_punches add column if not exists decided_by uuid;
do $$ begin
  alter table public.pr_punches add constraint pr_punches_status_chk check (status in ('ok','pending','approved','rejected'));
exception when duplicate_object then null; end $$;

-- 'H' / 'H:MM' -> minutes
create or replace function public.pr_hm(s text) returns int language sql immutable as $$
  select split_part(trim(s), ':', 1)::int * 60 + coalesce(nullif(split_part(trim(s), ':', 2), '')::int, 0)
$$;

-- planned shift for an employee on a business day (payroll plan first, then the Cash Book hall schedule)
create or replace function public.pr_plan_for(p_emp uuid, p_day date) returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select q.shift from public.pr_plan q where q.employee_id = p_emp and q.day = p_day and q.shift is not null),
    (select s.shift from public.shifts s join public.pr_employees e on lower(trim(e.name)) = lower(trim(s.staff_name)) where e.id = p_emp and s.day = p_day limit 1))
$$;

drop function if exists public.pr_punch(text, text, text);
create or replace function public.pr_punch(p_no text, p_pin text, p_kind text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare c record; last_k text; last_at timestamptz; ts timestamptz := now(); r date;
  loc timestamp := (now() at time zone 'Asia/Manila'); bday date; plan text; sm int; em int; target timestamp; dev int; st text := 'ok';
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  if c.must_change then return jsonb_build_object('ok', false, 'err', 'must_change'); end if;
  select resigned_on into r from public.pr_employees where id = c.emp_id;
  if r is not null and loc::date > r then return jsonb_build_object('ok', false, 'err', 'resigned'); end if;
  if p_kind not in ('in','out') then return jsonb_build_object('ok', false, 'err', 'kind'); end if;
  select kind, punched_at into last_k, last_at from public.pr_punches where employee_id = c.emp_id order by punched_at desc limit 1;
  if last_k = p_kind and last_at > ts - interval '2 minutes' then return jsonb_build_object('ok', true, 'dup', true); end if;

  -- which business day / shift this punch belongs to
  if p_kind = 'in' then
    bday := loc::date;
    plan := public.pr_plan_for(c.emp_id, bday);
    -- an IN just after midnight can belong to yesterday's night shift that starts late
    if (plan is null or plan in ('off','sil')) and extract(hour from loc) < 6 then
      bday := loc::date - 1; plan := public.pr_plan_for(c.emp_id, bday);
    end if;
  else
    bday := case when last_k = 'in' then (last_at at time zone 'Asia/Manila')::date else loc::date end;
    plan := public.pr_plan_for(c.emp_id, bday);
  end if;

  if plan is null or plan in ('off','sil') or plan !~ '^\d{1,2}(:\d{2})?-\d{1,2}(:\d{2})?$' then
    dev := null; st := 'pending';           -- no shift that day: always needs a reason
  else
    sm := public.pr_hm(split_part(plan, '-', 1)); em := public.pr_hm(split_part(plan, '-', 2));
    if em <= sm then em := em + 1440; end if;
    target := bday + make_interval(mins => case when p_kind = 'in' then sm else em end);
    dev := trunc(extract(epoch from (loc - target)) / 60)::int;   -- + late / − early, whole minutes
    if dev <> 0 then st := 'pending'; end if;
  end if;

  if st = 'pending' and coalesce(trim(p_reason), '') = '' then
    return jsonb_build_object('ok', false, 'need_reason', true, 'plan', plan, 'dev', dev, 'day', bday, 'at', ts);
  end if;
  insert into public.pr_punches (employee_id, kind, punched_at, source, plan_shift, dev_min, reason, status)
  values (c.emp_id, p_kind, ts, 'app', plan, dev, nullif(trim(p_reason), ''), st);
  return jsonb_build_object('ok', true, 'at', ts, 'status', st, 'plan', plan, 'dev', dev);
end $$;
grant execute on function public.pr_punch(text, text, text, text) to anon, authenticated;

-- staff view: punches carry their status / reason (rest of the function unchanged)

-- ===== store guard (applied as migrations pr_punch_store_guard / pr_punch2_internal_only / pr_punch_old_delegates) =====
-- pr_settings: store_ips text[], store_lat, store_lng, store_radius_m (100), punch_guard (off by default)
-- pr_punches: ip, lat, lng, where_ok ('wifi' | 'gps' | 'off')
-- pr_client_ip(): client IP from PostgREST request headers (cf-connecting-ip / x-forwarded-for)
-- pr_store_ip_register(): owner-only, adds the caller's current IP to store_ips
-- pr_punch3(no, pin, kind, reason, lat, lng): when punch_guard is on, allowed only if IP is a store IP OR GPS is within store_radius_m;
--   then runs pr_punch2 (schedule / reason check). pr_punch2 is internal only (execute revoked); pr_punch(no,pin,kind) delegates to pr_punch3.
