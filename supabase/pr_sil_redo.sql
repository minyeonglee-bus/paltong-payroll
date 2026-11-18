-- SIL 다시 적기 (owner 2026-11-14): "SIL 본인 남은 거 다시 적으라고 — 마지막이고 이번에 적는 것만 인정"
-- Staff now enter how many SIL days they have LEFT (after the days the app already shows as used / planned).
-- One time only, then locked (owner can still change it in the SIL card). The earlier "used before the app"
-- entry (self_set_at) is kept for history in prev_used_before; this entry replaces it.
-- used_before := allowance − app-used − planned − left  (if that is below 0, allowance is raised so left is exactly what they wrote)
alter table public.pr_sil add column if not exists self_left numeric;
alter table public.pr_sil add column if not exists self_left_at timestamptz;
alter table public.pr_sil add column if not exists prev_used_before numeric;
alter table public.pr_sil add column if not exists prev_allowance numeric;

create or replace function public.pr_emp_set_sil_left(p_no text, p_pin text, p_left numeric)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare c record; y int := extract(year from (now() at time zone 'Asia/Manila'))::int; s jsonb; al numeric; ub numeric; n_used int; n_pl int; done timestamptz;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  if c.must_change then return jsonb_build_object('ok', false, 'err', 'must_change'); end if;
  if p_left is null or p_left < 0 or p_left > 30 or (p_left * 2) <> floor(p_left * 2) then return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
  select self_left_at into done from public.pr_sil where employee_id = c.emp_id and year = y;
  if done is not null then return jsonb_build_object('ok', false, 'err', 'sil_locked'); end if;
  s := public.pr_sil_summary(c.emp_id, y);
  al := (s->>'allowance')::numeric; n_used := jsonb_array_length(s->'used'); n_pl := jsonb_array_length(s->'planned');
  ub := al - n_used - n_pl - p_left;
  if ub < 0 then al := al - ub; ub := 0; end if;
  insert into public.pr_sil (employee_id, year, allowance, used_before, self_left, self_left_at, updated_at)
  values (c.emp_id, y, al, ub, p_left, now(), now())
  on conflict (employee_id, year) do update set prev_used_before = public.pr_sil.used_before, prev_allowance = public.pr_sil.allowance,
    allowance = excluded.allowance, used_before = excluded.used_before, self_left = excluded.self_left, self_left_at = now(), updated_at = now()
  where public.pr_sil.self_left_at is null;
  if not found then return jsonb_build_object('ok', false, 'err', 'sil_locked'); end if;
  return jsonb_build_object('ok', true, 'left', p_left);
end $$;
revoke all on function public.pr_emp_set_sil_left(text, text, numeric) from public;
grant execute on function public.pr_emp_set_sil_left(text, text, numeric) to anon, authenticated;

-- the old "used before the app" entry is closed (this one replaces it)
create or replace function public.pr_emp_set_sil(p_no text, p_pin text, p_used numeric)
returns jsonb language sql security definer set search_path to 'public' as $$ select jsonb_build_object('ok', false, 'err', 'sil_locked') $$;

-- summary: + self_left / self_left_at
create or replace function public.pr_sil_summary(p_emp uuid, p_year integer)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare a record; used jsonb; planned jsonb; mpv_days text[]; mp jsonb := public.pr_mpv(p_emp);
begin
  select coalesce(array_agg(to_char(r.day, 'YYYY-MM-DD')), '{}') into mpv_days from public.pr_sil_req r
   where r.employee_id = p_emp and r.kind = 'mpv' and r.status = 'approved';
  select allowance, used_before, self_set_at, self_left, self_left_at into a from public.pr_sil where employee_id = p_emp and year = p_year;
  select coalesce(jsonb_agg(distinct x->>'date'), '[]'::jsonb) into used from public.pr_payrolls p, jsonb_array_elements(p.days) x
   where p.employee_id = p_emp and x->>'type' = 'sil' and (x->>'date') like p_year || '-%' and not ((x->>'date') = any(mpv_days));
  select coalesce(jsonb_agg(to_char(q.day, 'YYYY-MM-DD') order by q.day), '[]'::jsonb) into planned from public.pr_plan q
   where q.employee_id = p_emp and q.shift = 'sil' and extract(year from q.day) = p_year
     and not (used ? to_char(q.day, 'YYYY-MM-DD')) and not (to_char(q.day, 'YYYY-MM-DD') = any(mpv_days));
  return jsonb_build_object('year', p_year, 'allowance', coalesce(a.allowance, 5), 'used_before', coalesce(a.used_before, 0), 'self_set_at', a.self_set_at,
    'self_left', a.self_left, 'self_left_at', a.self_left_at,
    'earned', 0, 'months', (select coalesce(jsonb_agg(jsonb_build_object('month', x->>'month', 'perfect', (x->>'perfect')::boolean, 'credit', x->>'credit')), '[]'::jsonb)
                              from jsonb_array_elements(mp) x), 'mpv', mp, 'used', used, 'planned', planned);
end $function$;
