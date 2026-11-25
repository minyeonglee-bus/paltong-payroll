-- 📝 Automatic IR from the break / customer-time check (owner 2026-11-26 04:21 "IR 자동으로 시간대조해서").
-- On top of pr_breaks.sql:
--   • a break that overlaps customers / orders 5 min or more → IR request created automatically (when the break ends,
--     or at clock-out for a forgotten break). Under 5 min (came back quickly) → only shown, no IR.
--   • a shift where the meal break was not taken although there were no-customer windows (10 min+) → IR request
--     (dishonesty / explanation letter) created automatically by pr_break_run.
-- IR = pr_warnings kind 'ir' (not counted as a warning). Staff get the push + popup and must submit before clocking in
-- (existing pr_warn_pending rule); 5-day deadline → "waived" as usual.
alter table public.pr_breaks add column if not exists ir_id uuid references public.pr_warnings(id) on delete set null;
alter table public.pr_break_days add column if not exists ir_id uuid references public.pr_warnings(id) on delete set null;

create or replace function public.pr_break_ir(p_emp uuid, p_day date, p_detail text)
returns uuid language plpgsql security definer set search_path = public as $$
declare nid uuid;
begin
  insert into public.pr_warnings (employee_id, day, cat, detail, counted, proof, kind)
  values (p_emp, least(p_day, (now() at time zone 'Asia/Manila')::date), 'service', left(p_detail, 1000), false, '[]'::jsonb, 'ir')
  returning id into nid;
  return nid;
end $$;
revoke all on function public.pr_break_ir(uuid, date, text) from public, anon, authenticated;

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
    if mins >= 5 then
      irid := public.pr_break_ir(b.employee_id, d,
        'Break taken while there were customers / orders (automatic check) — ' || to_char(d, 'Mon DD') || ' ' || public.pr_hhmi(b.start_at) || '–' || public.pr_hhmi(b.end_at)
        || case when p_auto then ' (you did not press Break end; the break counted until you clocked out)' else '' end
        || '. Customers / orders during your break: ' || mins || ' min (' || coalesce(lst, '') || ').' || chr(10)
        || 'Rule (notice "Break Time Rules", from Nov 26): no breaks while there are customers — if customers come while you rest, come back to work right away.' || chr(10) || chr(10)
        || 'Please write: why you were on a break at that time, what work was waiting, and what you will do so it does not happen again.');
    end if;
    update public.pr_breaks set cust_min = mins, cust = hit, ir_id = irid where id = b.id;
    if mins >= 1 then
      select name into nm from public.pr_employees where id = b.employee_id;
      perform public.pr_notify('☕ 손님 있는 중 휴식 · ' || nm || ' ' || public.pr_hhmi(b.start_at) || '–' || public.pr_hhmi(b.end_at)
        || ' · 손님/주문 ' || mins || '분 (' || (select string_agg(h->>'no', ', ') from jsonb_array_elements(hit) h) || ')'
        || case when irid is not null then ' → 📝 IR 자동 요청' else ' (5분 미만 · IR 없음)' end);
    end if;
  end if;
  return jsonb_build_object('id', b.id, 'start', b.start_at, 'end', b.end_at, 'cust_min', mins, 'cust', hit, 'ir', irid is not null);
end $$;
revoke all on function public.pr_break_close(uuid, timestamptz, boolean) from public, anon, authenticated;

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
        || deceit || ' min are NOT paid.' || chr(10) || chr(10)
        || 'Please write: why you did not take your break when there were no customers, and what you will do from now on.');
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
revoke all on function public.pr_break_run() from public, anon, authenticated;

create or replace function public.pr_break_admin(p_days int default 14)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'not allowed'; end if;
  return jsonb_build_object(
    'breaks', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'employee_id', b.employee_id, 'name', e.name, 'start', b.start_at, 'end', b.end_at, 'auto', b.auto_end, 'cust_min', b.cust_min, 'cust', b.cust, 'ir_id', b.ir_id) order by b.start_at desc)
       from public.pr_breaks b join public.pr_employees e on e.id = b.employee_id where b.status = 'ok' and b.start_at > now() - make_interval(days => p_days)), '[]'::jsonb),
    'days', coalesce((select jsonb_agg((to_jsonb(d) - 'spans') || jsonb_build_object('name', e.name) order by d.in_at desc)
       from public.pr_break_days d join public.pr_employees e on e.id = d.employee_id where d.in_at > now() - make_interval(days => p_days)), '[]'::jsonb));
end $$;
revoke all on function public.pr_break_admin(int) from public, anon;
grant execute on function public.pr_break_admin(int) to authenticated;
