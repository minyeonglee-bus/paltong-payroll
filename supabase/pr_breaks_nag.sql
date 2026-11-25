-- ⏰ Break nag + carelessness IR + split breaks (owner 2026-11-26 04:24):
--   • "I forgot to press it" is no excuse → carelessness → explanation letter:
--       – Break end not pressed (closed at clock-out) → IR automatically (combined with the customer IR if any).
--       – rested without pressing Break start → shows as "no break although no customers" → IR (text says forgetting is no excuse).
--   • Breaks can be split (several short breaks); the meal break is the TOTAL of the shift (pr_settings.break_hours = 1 h).
--   • When the shift's total break passes 1 hour while a break is still open → push to the employee every minute
--     "Break time is over — press Break end" until they press it (cron every 20 s). Owner is told once.
alter table public.pr_breaks add column if not exists nag_at timestamptz;
alter table public.pr_breaks add column if not exists nag_n int not null default 0;

-- break seconds used in the shift of an open break (closed breaks since the clock-in + the open one so far)
create or replace function public.pr_break_used_s(p_emp uuid, p_at timestamptz) returns int language sql stable security definer set search_path = public as $$
  with si as (select coalesce((select max(punched_at) from public.pr_punches where employee_id = p_emp and kind = 'in' and status <> 'void' and punched_at <= p_at and punched_at > p_at - interval '20 hours'), p_at - interval '20 hours') t)
  select coalesce(sum(extract(epoch from least(coalesce(b.end_at, now()), now()) - greatest(b.start_at, si.t)))::int, 0)
    from public.pr_breaks b, si where b.employee_id = p_emp and b.status = 'ok' and coalesce(b.end_at, now()) > si.t and b.start_at <= now()
$$;
revoke all on function public.pr_break_used_s(uuid, timestamptz) from public, anon, authenticated;

create or replace function public.pr_break_nag() returns int language plpgsql security definer set search_path = public as $$
declare b record; need int; used int; n int := 0; nm text;
begin
  select round(coalesce(break_hours, 1) * 3600)::int into need from public.pr_settings where id = 1;
  for b in select * from public.pr_breaks where end_at is null and status = 'ok' and start_at > now() - interval '20 hours' loop
    used := public.pr_break_used_s(b.employee_id, b.start_at);
    continue when used <= need;
    continue when b.nag_at is not null and b.nag_at > now() - interval '55 seconds';
    perform public.pr_notify_emp(b.employee_id, '⏰ Break time is over (' || round(used / 60.0) || ' min used, 1 hour max). Press "Break end" in the app now and go back to work. / 쉬는 시간 1시간이 지났어요 — 앱에서 "쉬는 시간 끝"을 누르세요.');
    if b.nag_n = 0 then
      select name into nm from public.pr_employees where id = b.employee_id;
      perform public.pr_notify('⏰ 쉬는 시간 1시간 넘음 · ' || nm || ' (' || public.pr_hhmi(b.start_at) || '~) — 직원에게 1분마다 "끝 누르세요" 알림 중');
    end if;
    update public.pr_breaks set nag_at = now(), nag_n = nag_n + 1 where id = b.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.pr_break_nag() from public, anon, authenticated;

create or replace function public.pr_break_close(p_id uuid, p_at timestamptz, p_auto boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b public.pr_breaks; sp jsonb; mins int; hit jsonb; nm text; lst text; irid uuid; d date;
begin
  update public.pr_breaks set end_at = greatest(p_at, start_at), auto_end = p_auto where id = p_id and end_at is null returning * into b;
  if b.id is null then return null; end if;
  sp := public.pr_busy_spans(b.start_at - interval '1 minute', b.end_at);
  if sp is not null then
    mins := public.pr_mr_min(public.pr_busy_mr(sp) * tstzmultirange(tstzrange(b.start_at, b.end_at)));
    hit := public.pr_busy_hit(sp, b.start_at, b.end_at);
    lst := (select string_agg((h->>'no') || ' ' || (h->>'min') || ' min', ', ') from jsonb_array_elements(hit) h);
    d := (b.start_at at time zone 'Asia/Manila')::date;
    if mins >= 5 or p_auto then
      irid := public.pr_break_ir(b.employee_id, d,
        case when p_auto then 'Break end not pressed (automatic check) — you started a break on ' || to_char(d, 'Mon DD') || ' at ' || public.pr_hhmi(b.start_at)
          || ' and never pressed Break end, so the break counted until you clocked out (' || public.pr_hhmi(b.end_at) || ').' || chr(10)
          || 'Saying "I forgot to press it" is not an excuse — not paying attention is carelessness and is subject to an explanation letter.' || chr(10) else '' end
        || case when mins >= 5 then 'Break taken while there were customers / orders — ' || to_char(d, 'Mon DD') || ' ' || public.pr_hhmi(b.start_at) || '–' || public.pr_hhmi(b.end_at)
          || '. Customers / orders during your break: ' || mins || ' min (' || coalesce(lst, '') || ').' || chr(10)
          || 'Rule (notice "Break Time Rules", from Nov 26): no breaks while there are customers — if customers come while you rest, come back to work right away.' || chr(10) else '' end
        || chr(10) || 'Please write: ' || case when p_auto then 'why you did not press Break end and why you did not pay attention, ' else '' end
        || case when mins >= 5 then 'why you were on a break at that time, what work was waiting, ' else '' end
        || 'and what you will do so it does not happen again.');
    end if;
    update public.pr_breaks set cust_min = mins, cust = hit, ir_id = irid where id = b.id;
    if mins >= 1 then
      select name into nm from public.pr_employees where id = b.employee_id;
      perform public.pr_notify('☕ 손님 있는 중 휴식 · ' || nm || ' ' || public.pr_hhmi(b.start_at) || '–' || public.pr_hhmi(b.end_at)
        || ' · 손님/주문 ' || mins || '분 (' || (select string_agg(h->>'no', ', ') from jsonb_array_elements(hit) h) || ')'
        || case when irid is not null then ' → 📝 IR 자동 요청' else ' (5분 미만 · IR 없음)' end);
    elsif p_auto then
      select name into nm from public.pr_employees where id = b.employee_id;
      perform public.pr_notify('☕ 쉬는 시간 끝 안 누름 · ' || nm || ' ' || public.pr_hhmi(b.start_at) || '~퇴근 ' || public.pr_hhmi(b.end_at) || ' → 📝 부주의 IR 자동 요청');
    end if;
  end if;
  return jsonb_build_object('id', b.id, 'start', b.start_at, 'end', b.end_at, 'cust_min', mins, 'cust', hit, 'ir', irid is not null);
end $$;

create or replace function public.pr_break_run()
returns int language plpgsql security definer set search_path = public, extensions as $$
declare o record; e public.pr_employees; st public.pr_settings; sp jsonb; ses tstzmultirange; brk tstzmultirange; busy tstzmultirange;
  need int; taken int; missed int; freem int; paid int; deceit int; base int; over int; rate numeric; amt numeric; lid uuid; irid uuid; n int := 0; d date;
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
    perform public.pr_break_close(b.id, o.out_at, true) from public.pr_breaks b
      where b.employee_id = o.employee_id and b.end_at is null and b.status = 'ok' and b.start_at < o.out_at;
    select * into e from public.pr_employees where id = o.employee_id;
    ses := tstzmultirange(tstzrange((select punched_at from public.pr_punches where id = o.in_id), o.out_at));
    sp := public.pr_busy_spans(lower(ses), o.out_at);
    continue when sp is null;
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
    rate := coalesce(nullif(e.daily_rate, 0), 718) / 8.0;
    over := least(paid, greatest(0, (base - need + paid) - 480));
    amt := round((rate * (paid - over) + rate * 1.25 * over) / 60.0, 2);
    d := (lower(ses) at time zone 'Asia/Manila')::date;
    lid := null; irid := null;
    if paid >= 1 and amt > 0 then
      insert into public.pr_ledger (employee_id, kind, biz_date, amount, note, note_en, verified, authorized)
      values (e.id, 'bonus', d, amt,
        '☕ 식사 휴게 못 씀 (손님 계속 있음) ' || to_char(d, 'MM/DD') || ' · ' || paid || '분 지급 (휴게 ' || taken || '/' || need || '분)',
        '☕ Meal break not possible (customers the whole time) ' || to_char(d, 'MM/DD') || ' · ' || paid || ' min paid (break ' || taken || '/' || need || ' min)', true, true)
      returning id into lid;
    end if;
    if deceit >= 10 then
      irid := public.pr_break_ir(e.id, d,
        'Meal break not taken although there were no customers (automatic check) — shift ' || to_char(d, 'Mon DD') || ' ' || public.pr_hhmi(lower(ses)) || '–' || public.pr_hhmi(o.out_at)
        || ': you rested ' || taken || ' of ' || need || ' min, while there were ' || freem || ' min with no customers / orders (dine-in tables, deliveries, pickups).' || chr(10)
        || 'Rule (notice "Break Time Rules", from Nov 26): rest when there are no customers. Not resting on purpose to be paid for the break is treated as dishonesty / deception — these '
        || deceit || ' min are NOT paid.' || chr(10)
        || 'Saying "I rested but forgot to press Break start" is not an excuse — not paying attention is carelessness and is also subject to an explanation letter.' || chr(10) || chr(10)
        || 'Please write: why you did not take your break (or did not press Break start) when there were no customers, and what you will do from now on.');
    end if;
    insert into public.pr_break_days (employee_id, in_id, out_id, in_at, out_at, need_min, taken_min, missed_min, free_min, paid_min, deceit_min, amount, ledger_id, spans, ir_id)
    values (e.id, o.in_id, o.out_id, lower(ses), o.out_at, need, taken, missed, freem, paid, deceit, case when paid >= 1 then coalesce(amt, 0) else 0 end, lid, sp, irid);
    if deceit >= 10 then
      perform public.pr_notify('📝 사유서(IR) 자동 요청 · ' || e.name || ' ' || to_char(d, 'MM/DD') || ' — 손님 없는 시간 ' || freem || '분 있었는데 휴게 ' || taken || '/' || need
        || '분만 씀 (' || deceit || '분 안 쉼 · 미지급)');
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.pr_break_close(uuid, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.pr_break_run() from public, anon, authenticated;

-- staff list: + used_s (this shift) and need_s so the app can count down and alarm at 1:00:01
create or replace function public.pr_emp_breaks(p_no text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  return jsonb_build_object('ok', true, 'now', now(),
    'need_s', (select round(coalesce(break_hours, 1) * 3600)::int from public.pr_settings where id = 1),
    'used_s', public.pr_break_used_s(c.emp_id, now()),
    'open', (select jsonb_build_object('id', id, 'start', start_at) from public.pr_breaks where employee_id = c.emp_id and end_at is null and status = 'ok'),
    'breaks', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'start', start_at, 'end', end_at, 'auto', auto_end, 'cust_min', cust_min, 'cust', cust, 'ir', ir_id is not null) order by start_at desc)
       from (select * from public.pr_breaks where employee_id = c.emp_id and status = 'ok' and start_at > now() - interval '7 days' order by start_at desc limit 30) b), '[]'::jsonb),
    'days', coalesce((select jsonb_agg(to_jsonb(d) - 'spans' - 'employee_id' order by d.in_at desc)
       from (select * from public.pr_break_days where employee_id = c.emp_id and in_at > now() - interval '16 days' order by in_at desc limit 20) d), '[]'::jsonb));
end $$;
revoke all on function public.pr_emp_breaks(text, text) from public;
grant execute on function public.pr_emp_breaks(text, text) to anon, authenticated;

select cron.schedule('pr-break-nag', '20 seconds', 'select public.pr_break_nag()');
