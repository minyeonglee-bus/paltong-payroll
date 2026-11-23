-- Warnings / IR: clock IN is refused on the server while a warning is unsigned or an IR is not submitted (owner 11/24)
-- Same exceptions as the app popup (warnMust): refused-to-sign recorded, void, IR past its 5-day deadline.
-- Clock OUT is not blocked (so nobody gets stuck clocked in).
create or replace function public.pr_warn_pending(p_emp uuid)
returns integer language sql stable security definer set search_path to 'public' as $$
  select count(*)::int from public.pr_warnings w
   where w.employee_id = p_emp and w.status = 'active' and w.ack_at is null and w.refused_at is null
     and not (w.kind = 'ir' and now() > w.issued_at + interval '5 days');
$$;
revoke all on function public.pr_warn_pending(uuid) from public, anon, authenticated;

create or replace function public.pr_punch3(p_no text, p_pin text, p_kind text, p_reason text, p_lat double precision, p_lng double precision)
 returns jsonb language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
declare s public.pr_settings; ip text := public.pr_client_ip(); dist double precision; how text; res jsonb; e uuid; n int;
begin
  -- ⛔ unsigned warning / unsubmitted IR → no clock in (PIN checked first)
  if p_kind = 'in' then
    select c.emp_id into e from public.pr_emp_check(p_no, p_pin) c where c.err is null;
    if e is not null then
      n := public.pr_warn_pending(e);
      if n > 0 then return jsonb_build_object('ok', false, 'err', 'warn_pending', 'n', n); end if;
    end if;
  end if;
  select * into s from public.pr_settings where id = 1;
  if p_lat is not null and p_lng is not null and s.store_lat is not null then
    dist := 2 * 6371000 * asin(sqrt(power(sin(radians(p_lat - s.store_lat) / 2), 2) + cos(radians(s.store_lat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - s.store_lng) / 2), 2)));
  end if;
  how := case when ip is not null and ip = any(s.store_ips) then 'wifi' when dist is not null and dist <= s.store_radius_m then 'gps' else null end;
  if s.punch_guard and how is null then
    -- still check the PIN first so a wrong PIN says so
    perform 1 from public.pr_emp_check(p_no, p_pin) c where c.err is null;
    if not found then return public.pr_punch2(p_no, p_pin, p_kind, p_reason); end if;
    return jsonb_build_object('ok', false, 'err', 'away', 'dist', round(dist));
  end if;
  res := public.pr_punch2(p_no, p_pin, p_kind, p_reason);
  if (res ->> 'ok')::boolean and res ->> 'dup' is null then
    update public.pr_punches set ip = public.pr_client_ip(), lat = p_lat, lng = p_lng, where_ok = coalesce(how, 'off')
     where id = (select x.id from public.pr_punches x join public.pr_emp_check(p_no, p_pin) c on x.employee_id = c.emp_id order by x.punched_at desc limit 1);
  end if;
  return res;
end $function$;
