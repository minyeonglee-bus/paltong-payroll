-- 직원 푸시 알림 (사장님 2026-11-23: "직원들 다시 페이롤 앱 키면 알림 받냐는 거 뜨게 하고 알림 허용 누를 수 있게 한 후 알림 갈 수 있게")
--  • 직원이 앱을 열면 "알림 받을까요?" → 허용 → 이 기기를 pr_push_subs 에 employee_id 로 등록 (user_id 없음)
--  • 사장님 알림(pr_notify)은 직원 기기로 안 가게 employee_id is null 만
--  • 경고 / IR 등록되면 그 직원 기기로 바로 푸시, 매일 10:07(마닐라) 아직 안 한 건 다시 푸시
--  • pr_notify_emp(employee_id, text) — 다른 직원 알림에도 쓰면 됨

alter table public.pr_push_subs add column if not exists employee_id uuid references public.pr_employees(id) on delete cascade;
create index if not exists pr_push_subs_emp on public.pr_push_subs(employee_id) where employee_id is not null;

-- owner alerts: owner devices only (not staff)
create or replace function public.pr_notify(p_text text) returns void
language plpgsql security definer set search_path to 'public', 'extensions' as $$
begin
  perform public.pr_push_send((select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
    from public.pr_push_subs s where s.employee_id is null and (s.user_id is null or s.user_id in (select user_id from public.staff where role = 'owner'))), p_text);
end $$;
revoke all on function public.pr_notify(text) from public, anon, authenticated;

create or replace function public.pr_push_info() returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not (public.is_owner() or public.pr_is_mina()) then raise exception 'OWNER_ONLY'; end if;
  return jsonb_build_object('public_key', (select public_key from public.pr_push_cfg where id = 1),
    'devices', (select count(*) from public.pr_push_subs s where s.employee_id is null and case when public.is_owner()
                  then s.user_id is null or s.user_id in (select user_id from public.staff where role = 'owner') else s.user_id = auth.uid() end),
    'staff_devices', (select count(distinct employee_id) from public.pr_push_subs where employee_id is not null));
end $$;

create or replace function public.pr_push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_label text) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if not (public.is_owner() or public.pr_is_mina()) then raise exception 'OWNER_ONLY'; end if;
  insert into public.pr_push_subs (endpoint, p256dh, auth, label, user_id) values (p_endpoint, p_p256dh, p_auth, left(p_label, 60), auth.uid())
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, label = excluded.label, user_id = excluded.user_id, employee_id = null;
end $$;

-- send to one employee's devices
create or replace function public.pr_notify_emp(p_emp uuid, p_text text) returns void
language plpgsql security definer set search_path to 'public', 'extensions' as $$
begin
  perform public.pr_push_send((select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
    from public.pr_push_subs s where s.employee_id = p_emp), p_text);
end $$;
revoke all on function public.pr_notify_emp(uuid, text) from public, anon, authenticated;

-- staff: key + is this device on?
create or replace function public.pr_emp_push_status(p_no text, p_pin text, p_endpoint text) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare c record;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  return jsonb_build_object('ok', true, 'public_key', (select public_key from public.pr_push_cfg where id = 1),
    'on', p_endpoint is not null and exists (select 1 from public.pr_push_subs where endpoint = p_endpoint and employee_id = c.emp_id));
end $$;
revoke all on function public.pr_emp_push_status(text, text, text) from public;
grant execute on function public.pr_emp_push_status(text, text, text) to anon, authenticated;

create or replace function public.pr_emp_push_subscribe(p_no text, p_pin text, p_endpoint text, p_p256dh text, p_auth text, p_label text) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare c record; old public.pr_push_subs;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  if coalesce(p_endpoint, '') !~ '^https://' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then return jsonb_build_object('ok', false, 'err', 'noData'); end if;
  select * into old from public.pr_push_subs where endpoint = p_endpoint;
  if old.endpoint is not null and old.user_id is not null then return jsonb_build_object('ok', true, 'owner_device', true); end if;   -- owner / Mina device: leave it
  insert into public.pr_push_subs (endpoint, p256dh, auth, label, user_id, employee_id) values (p_endpoint, p_p256dh, p_auth, left(p_label, 60), null, c.emp_id)
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, label = excluded.label, employee_id = excluded.employee_id, user_id = null;
  perform public.pr_notify_emp(c.emp_id, E'✅ Paltong payroll\nNotifications are on. Warnings, IR requests and other important notices will come here.');
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.pr_emp_push_subscribe(text, text, text, text, text, text) from public;
grant execute on function public.pr_emp_push_subscribe(text, text, text, text, text, text) to anon, authenticated;

-- warning / IR registered → push to that employee
create or replace function public.pr_warn_emp_push() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if new.status = 'active' then
    perform public.pr_notify_emp(new.employee_id, case when new.kind = 'ir'
      then E'📝 Incident Report (IR) request\nOpen the Paltong payroll app and write what happened. Deadline: ' || to_char((new.issued_at + interval '5 days') at time zone 'Asia/Manila', 'Mon DD HH24:MI') || '. It is not a warning.'
      else E'⚠️ Warning notice\nOpen the Paltong payroll app to read and sign it. You may explain within 5 days.' end);
  end if;
  return null;
end $$;
drop trigger if exists pr_warn_emp_push on public.pr_warnings;
create trigger pr_warn_emp_push after insert on public.pr_warnings for each row execute function public.pr_warn_emp_push();

-- daily: still not signed / IR not written → remind
create or replace function public.pr_warn_emp_remind() returns void
language plpgsql security definer set search_path to 'public' as $$
declare r record;
begin
  for r in select employee_id, count(*) filter (where kind = 'ir') n_ir, count(*) filter (where kind <> 'ir') n_w
             from public.pr_warnings
            where status = 'active' and ack_at is null and refused_at is null
              and not (kind = 'ir' and explain is null and now() > issued_at + interval '5 days')
            group by employee_id loop
    perform public.pr_notify_emp(r.employee_id, E'⏰ Reminder · Paltong payroll\n'
      || concat_ws(' · ', case when r.n_ir > 0 then 'IR to write: ' || r.n_ir end, case when r.n_w > 0 then 'Warning to sign: ' || r.n_w end)
      || '. Open the app to finish it.');
  end loop;
end $$;
revoke all on function public.pr_warn_emp_remind() from public, anon, authenticated;
select cron.unschedule('pr-warn-emp-remind') where exists (select 1 from cron.job where jobname = 'pr-warn-emp-remind');
select cron.schedule('pr-warn-emp-remind', '7 2 * * *', 'select public.pr_warn_emp_remind()');   -- 10:07 Manila
