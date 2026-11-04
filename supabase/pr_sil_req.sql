-- SIL (paid leave) requests from the staff app (owner 2026-11-04).
-- Staff pick dates (from tomorrow) → request waits for the owner → approved = pr_plan shift 'sil' for that day
-- (schedule_sync shows it as off in the Cash Book; payroll pays it as paid leave). Balance is checked on request and on approval:
-- left = allowance + perfect-attendance days − used − already planned − other pending requests.
create table if not exists public.pr_sil_req (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.pr_employees(id) on delete cascade,
  day date not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  note text
);
create index if not exists pr_sil_req_emp on public.pr_sil_req(employee_id, day);
create unique index if not exists pr_sil_req_one_open on public.pr_sil_req(employee_id, day) where status in ('pending', 'approved');
alter table public.pr_sil_req enable row level security;
drop policy if exists pr_sil_req_read on public.pr_sil_req; create policy pr_sil_req_read on public.pr_sil_req for select using (public.is_owner());

-- days still free to request in a year (summary minus pending requests)
create or replace function public.pr_sil_left(p_emp uuid, p_year int)
returns numeric language sql stable security definer set search_path to 'public' as $$
  select (x->>'allowance')::numeric + (x->>'earned')::numeric - jsonb_array_length(x->'used') - (x->>'used_before')::numeric - jsonb_array_length(x->'planned')
         - (select count(*) from public.pr_sil_req r where r.employee_id = p_emp and r.status = 'pending' and extract(year from r.day) = p_year)
  from (select public.pr_sil_summary(p_emp, p_year) x) s
$$;
revoke all on function public.pr_sil_left(uuid, int) from public, anon, authenticated;

create or replace function public.pr_emp_sil_request(p_no text, p_pin text, p_days date[], p_reason text)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare c record; td date := (now() at time zone 'Asia/Manila')::date; d date; y int; n int; lft numeric; bad text := '';
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  if c.must_change then return jsonb_build_object('ok', false, 'err', 'must_change'); end if;
  if p_days is null or cardinality(p_days) = 0 or cardinality(p_days) > 10 then return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
  perform pg_advisory_xact_lock(hashtext('pr_sil_' || c.emp_id::text));
  foreach d in array p_days loop
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
  insert into public.pr_sil_req (employee_id, day, reason)
  select c.emp_id, x, nullif(left(trim(coalesce(p_reason, '')), 200), '') from (select distinct unnest(p_days) x) u;
  return jsonb_build_object('ok', true, 'n', cardinality(p_days));
end $$;
revoke all on function public.pr_emp_sil_request(text, text, date[], text) from public;
grant execute on function public.pr_emp_sil_request(text, text, date[], text) to anon, authenticated;

create or replace function public.pr_emp_sil_cancel(p_no text, p_pin text, p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare c record;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  update public.pr_sil_req set status = 'cancelled', decided_at = now() where id = p_id and employee_id = c.emp_id and status = 'pending';
  if not found then return jsonb_build_object('ok', false, 'err', 'not_pending'); end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.pr_emp_sil_cancel(text, text, uuid) from public;
grant execute on function public.pr_emp_sil_cancel(text, text, uuid) to anon, authenticated;

-- owner: approve (→ schedule shows SIL) or reject
create or replace function public.pr_sil_decide(p_id uuid, p_ok boolean, p_note text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r public.pr_sil_req;
begin
  if not public.is_owner() then raise exception 'OWNER_ONLY'; end if;
  select * into r from public.pr_sil_req where id = p_id for update;
  if not found or r.status <> 'pending' then return jsonb_build_object('ok', false, 'err', 'not_pending'); end if;
  if p_ok then
    insert into public.pr_plan (day, employee_id, shift) values (r.day, r.employee_id, 'sil')
    on conflict (day, employee_id) do update set shift = 'sil';
  end if;
  update public.pr_sil_req set status = case when p_ok then 'approved' else 'rejected' end, decided_at = now(), note = nullif(trim(coalesce(p_note, '')), '') where id = p_id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.pr_sil_decide(uuid, boolean, text) from public;
grant execute on function public.pr_sil_decide(uuid, boolean, text) to authenticated;

create or replace function public.pr_sil_req_list(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.is_owner() then raise exception 'OWNER_ONLY'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'employee_id', r.employee_id, 'name', e.name, 'day', r.day, 'reason', r.reason, 'status', r.status,
      'created_at', r.created_at, 'decided_at', r.decided_at, 'note', r.note,
      'plan', (select q.shift from public.pr_plan q where q.employee_id = r.employee_id and q.day = r.day),
      'left', public.pr_sil_left(r.employee_id, extract(year from r.day)::int)) order by r.status <> 'pending', r.day)
    from public.pr_sil_req r join public.pr_employees e on e.id = r.employee_id
    where r.status = 'pending' or r.decided_at > now() - make_interval(days => p_days)), '[]'::jsonb);
end $$;
revoke all on function public.pr_sil_req_list(int) from public;
grant execute on function public.pr_sil_req_list(int) to authenticated;

-- staff view: own requests
do $do$ declare d text := pg_get_functiondef('public.pr_emp_view(text,text)'::regprocedure); n text;
begin
  if position($a$'sil_reqs'$a$ in d) > 0 then return; end if;
  n := replace(d, $a$'sil_bal',$a$, $a$'sil_reqs', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'day', r.day, 'reason', r.reason, 'status', r.status, 'note', r.note) order by r.day desc)
      from public.pr_sil_req r where r.employee_id = e.id and (r.status = 'pending' or r.day >= (now() at time zone 'Asia/Manila')::date - 60)), '[]'::jsonb),
    'sil_bal',$a$);
  if n = d then raise exception 'sil_reqs patch not applied'; end if;
  execute n;
end $do$;
