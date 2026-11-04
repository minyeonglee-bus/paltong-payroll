-- Cash-advance limit per cutoff = the employee's pay for that cutoff (owner 2026-11-04).
--   daily:   daily rate × scheduled paid days in the cutoff (worked shifts + SIL; payroll plan wins over the Cash Book)
--   monthly: half the monthly rate
-- minus advances already recorded in the same cutoff. Cutoffs follow the app: 1–15 (with the previous month's 31st), 16–30.
create or replace function public.pr_adv_limit(p_emp uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare e public.pr_employees; td date := (now() at time zone 'Asia/Manila')::date; s date; f date; w0 date; n int; lim numeric; used numeric;
begin
  select * into e from public.pr_employees where id = p_emp;
  if extract(day from td) = 31 then td := td + 1; end if;                -- the 31st belongs to the next 1–15 cutoff
  if extract(day from td) <= 15 then
    s := date_trunc('month', td)::date; f := s + 14;
    w0 := case when extract(day from s - 1) = 31 then s - 1 else s end;   -- advances dated the previous 31st count here
  else
    s := date_trunc('month', td)::date + 15; f := least(s + 14, (date_trunc('month', td) + interval '1 month - 1 day')::date); w0 := s;
  end if;
  select count(*) into n from (
    select q.day, q.shift from public.pr_plan q where q.employee_id = p_emp and q.shift is not null and q.day between s and f
    union all
    select x.day, x.shift from public.shifts x where lower(trim(x.staff_name)) = lower(trim(e.name)) and x.day between s and f
      and not exists (select 1 from public.pr_plan q where q.employee_id = p_emp and q.day = x.day and q.shift is not null)) u
  where u.shift <> 'off';
  lim := case when e.pay_type = 'monthly' then round(coalesce(e.monthly_rate, 0) / 2, 2) else round(coalesce(e.daily_rate, 0) * n, 2) end;
  select coalesce(sum(amount), 0) into used from public.pr_ledger where employee_id = p_emp and kind = 'advance' and biz_date between w0 and f;
  return jsonb_build_object('start', s, 'end', f, 'days', n, 'limit', lim, 'used', used, 'left', greatest(lim - used, 0));
end $$;
revoke all on function public.pr_adv_limit(uuid) from public, anon, authenticated;

create or replace function public.pr_emp_advance(p_no text, p_pin text, p_amount numeric, p_reason text)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare c record; rid uuid; r text := left(trim(coalesce(p_reason, '')), 200); lim jsonb;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  if c.must_change then return jsonb_build_object('ok', false, 'err', 'must_change'); end if;
  if not exists (select 1 from public.pr_signatures where employee_id = c.emp_id) then return jsonb_build_object('ok', false, 'err', 'need_sig'); end if;
  if p_amount is null or p_amount < 1 or p_amount <> round(p_amount, 2) then return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
  perform pg_advisory_xact_lock(hashtext('pr_adv_' || c.emp_id::text));   -- two requests at once can't both pass the limit
  lim := public.pr_adv_limit(c.emp_id);
  if p_amount > (lim->>'left')::numeric then return jsonb_build_object('ok', false, 'err', 'over_limit', 'limit', lim); end if;
  insert into public.pr_ledger (employee_id, kind, biz_date, amount, note, note_en, verified, authorized, self_req_at, created_by)
  values (c.emp_id, 'advance', (now() at time zone 'Asia/Manila')::date, p_amount,
          '📱 가불 신청 (자동 승인)' || case when r <> '' then ' · ' || r else '' end,
          '📱 Advance request (auto-approved)' || case when r <> '' then ' · ' || r else '' end,
          true, true, now(), null)
  returning id into rid;
  return jsonb_build_object('ok', true, 'id', rid);
end $$;

-- staff view: current cutoff limit
do $do$ declare d text := pg_get_functiondef('public.pr_emp_view(text,text)'::regprocedure); n text;
begin
  if position($a$'adv_limit'$a$ in d) > 0 then return; end if;
  n := replace(d, $a$'sil_bal',$a$, $a$'adv_limit', public.pr_adv_limit(e.id),
    'sil_bal',$a$);
  if n = d then raise exception 'adv_limit patch not applied'; end if;
  execute n;
end $do$;
