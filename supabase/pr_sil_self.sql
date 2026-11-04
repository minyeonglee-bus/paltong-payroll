-- Staff enter their own SIL count once (days already used this year before the app).
-- Once saved it is locked for the employee; only the owner can change it afterwards (SIL card in admin).
alter table public.pr_sil add column if not exists self_set_at timestamptz;

create or replace function public.pr_emp_set_sil(p_no text, p_pin text, p_used numeric)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare c record; y int := extract(year from (now() at time zone 'Asia/Manila'))::int; done timestamptz;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  if c.must_change then return jsonb_build_object('ok', false, 'err', 'must_change'); end if;
  if p_used is null or p_used < 0 or p_used > 30 or (p_used * 2) <> floor(p_used * 2) then return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
  select self_set_at into done from public.pr_sil where employee_id = c.emp_id and year = y;
  if done is not null then return jsonb_build_object('ok', false, 'err', 'sil_locked'); end if;
  insert into public.pr_sil (employee_id, year, used_before, self_set_at, updated_at) values (c.emp_id, y, p_used, now(), now())
  on conflict (employee_id, year) do update set used_before = excluded.used_before, self_set_at = now(), updated_at = now()
  where public.pr_sil.self_set_at is null;
  if not found then return jsonb_build_object('ok', false, 'err', 'sil_locked'); end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.pr_emp_set_sil(text, text, numeric) from public;
grant execute on function public.pr_emp_set_sil(text, text, numeric) to anon, authenticated;

-- pr_sil_summary: also return self_set_at (lock shown to staff + owner)
create or replace function public.pr_sil_summary(p_emp uuid, p_year integer)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare m date; first_m date := date '2026-11-01'; last_m date := (date_trunc('month', (now() at time zone 'Asia/Manila'))::date - interval '1 month')::date;
  perfect boolean; n_ok int; months jsonb := '[]'::jsonb; earned int := 0; a record; used jsonb; planned jsonb;
begin
  m := first_m;
  while m <= last_m loop
    select count(*) into n_ok from public.pr_payrolls p
     where p.employee_id = p_emp and p.period_start in (m, m + 15) and (p.status = 'paid' or p.shared_at is not null)
       and coalesce((p.result->>'lateMinutes')::numeric, 0) = 0 and coalesce((p.result->>'absentDays')::numeric, 0) = 0 and coalesce((p.result->>'late')::numeric, 0) = 0;
    perfect := n_ok = 2 and not exists (select 1 from public.pr_punches x where x.employee_id = p_emp and x.kind = 'in' and x.status <> 'void' and coalesce(x.dev_min, 0) > 0
                                          and (x.punched_at at time zone 'Asia/Manila')::date >= m and (x.punched_at at time zone 'Asia/Manila')::date < (m + interval '1 month')::date);
    months := months || jsonb_build_object('month', to_char(m, 'YYYY-MM'), 'perfect', perfect, 'credit', to_char(m + interval '1 month', 'YYYY-MM'));
    if perfect and extract(year from m + interval '1 month') = p_year then earned := earned + 1; end if;
    m := (m + interval '1 month')::date;
  end loop;
  select allowance, used_before, self_set_at into a from public.pr_sil where employee_id = p_emp and year = p_year;
  select coalesce(jsonb_agg(distinct x->>'date'), '[]'::jsonb) into used from public.pr_payrolls p, jsonb_array_elements(p.days) x
   where p.employee_id = p_emp and x->>'type' = 'sil' and (x->>'date') like p_year || '-%';
  select coalesce(jsonb_agg(to_char(q.day, 'YYYY-MM-DD') order by q.day), '[]'::jsonb) into planned from public.pr_plan q
   where q.employee_id = p_emp and q.shift = 'sil' and extract(year from q.day) = p_year and not (used ? to_char(q.day, 'YYYY-MM-DD'));
  return jsonb_build_object('year', p_year, 'allowance', coalesce(a.allowance, 5), 'used_before', coalesce(a.used_before, 0), 'self_set_at', a.self_set_at,
    'earned', earned, 'months', months, 'used', used, 'planned', planned);
end $function$;
