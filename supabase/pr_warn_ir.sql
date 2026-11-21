-- 📝 IR (Incident Report) 요청 (사장님 2026-11-21) — 경고 기능 위에 얹음
--  kind = 'ir' : 경고가 아님 (횟수 제외 · counted 항상 false). 직원 앱에 "IR 써 주세요" 팝업 → 직원이 경위를 써서 제출(필수) = 사인.
--  기한은 경고와 같이 통지 + 5일. 제출하면 사장님 푸시 "📝 IR 제출".
alter table public.pr_warnings add column if not exists kind text not null default 'warning';
alter table public.pr_warnings drop constraint if exists pr_warnings_kind_chk;
alter table public.pr_warnings add constraint pr_warnings_kind_chk check (kind in ('warning', 'ir'));

drop view if exists public.pr_warnings_v;
create view public.pr_warnings_v with (security_invoker = true) as
select w.*, public.pr_warn_grp(w.cat) as grp, public.pr_warn_win(w.cat, w.day) as win_from,
  case when w.status = 'active' and w.counted and w.kind = 'warning' and public.pr_warn_win(w.cat, w.day) is not null then
    count(*) filter (where w.status = 'active' and w.counted and w.kind = 'warning' and public.pr_warn_win(w.cat, w.day) is not null)
      over (partition by w.employee_id, public.pr_warn_grp(w.cat), public.pr_warn_win(w.cat, w.day) order by w.day, w.created_at rows between unbounded preceding and current row)
  end::int as step,
  (w.issued_at + interval '5 days') as explain_by
from public.pr_warnings w;
revoke all on public.pr_warnings_v from anon;
grant select on public.pr_warnings_v to authenticated;

drop function if exists public.pr_warn_add(uuid, date, text, text, text, text, date, boolean, jsonb);
create or replace function public.pr_warn_add(p_emp uuid, p_day date, p_cat text, p_detail text, p_order text, p_action text,
  p_verbal date, p_counted boolean, p_proof jsonb, p_kind text default 'warning')
returns jsonb language plpgsql security definer set search_path = public as $$
declare nid uuid; st int; k text := coalesce(p_kind, 'warning');
begin
  if not public.is_owner() then raise exception 'not allowed'; end if;
  if k not in ('warning', 'ir') or p_emp is null or p_day is null or p_cat not in ('service', 'cashbook', 'late', 'absent') or nullif(trim(coalesce(p_detail, '')), '') is null
    then return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
  if p_day > (now() at time zone 'Asia/Manila')::date then return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
  if not public.pr_warn_proof_ok(coalesce(p_proof, '[]'::jsonb)) then return jsonb_build_object('ok', false, 'err', 'bad_proof'); end if;
  insert into public.pr_warnings (employee_id, day, cat, detail, order_no, action, verbal_on, counted, proof, kind)
  values (p_emp, p_day, p_cat, left(trim(p_detail), 1000), nullif(left(trim(coalesce(p_order, '')), 60), ''),
          case when k = 'ir' then null else nullif(left(trim(coalesce(p_action, '')), 200), '') end,
          case when k = 'ir' then null else p_verbal end, k = 'warning' and coalesce(p_counted, true), coalesce(p_proof, '[]'::jsonb), k)
  returning id into nid;
  select step into st from public.pr_warnings_v where id = nid;
  return jsonb_build_object('ok', true, 'id', nid, 'step', st, 'kind', k);
end $$;
revoke all on function public.pr_warn_add(uuid, date, text, text, text, text, date, boolean, jsonb, text) from public, anon;
grant execute on function public.pr_warn_add(uuid, date, text, text, text, text, date, boolean, jsonb, text) to authenticated;

create or replace function public.pr_emp_warnings(p_no text, p_pin text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c record;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  return jsonb_build_object('ok', true, 'rows', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'day', day, 'cat', cat, 'detail', detail, 'order_no', order_no,
      'action', action, 'verbal_on', verbal_on, 'counted', counted, 'step', step, 'proof_n', jsonb_array_length(proof), 'issued_at', issued_at, 'explain_by', explain_by,
      'ack_at', ack_at, 'explain', explain, 'explain_at', explain_at, 'refused_at', refused_at) order by day desc, created_at desc)
    from public.pr_warnings_v where employee_id = c.emp_id and status = 'active'), '[]'::jsonb));
end $$;
revoke all on function public.pr_emp_warnings(text, text) from public;
grant execute on function public.pr_emp_warnings(text, text) to anon, authenticated;

-- IR: 내용 없이 사인만은 안 됨 (ir_need)
create or replace function public.pr_emp_warn_ack(p_no text, p_pin text, p_id uuid, p_explain text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c record; w public.pr_warnings; ex text := nullif(left(trim(coalesce(p_explain, '')), 1500), '');
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  if c.must_change then return jsonb_build_object('ok', false, 'err', 'must_change'); end if;
  if not exists (select 1 from public.pr_signatures where employee_id = c.emp_id) then return jsonb_build_object('ok', false, 'err', 'need_sig'); end if;
  select * into w from public.pr_warnings where id = p_id and employee_id = c.emp_id and status = 'active' for update;
  if w.id is null then return jsonb_build_object('ok', false, 'err', 'noData'); end if;
  if w.kind = 'ir' and ex is null and w.explain is null then return jsonb_build_object('ok', false, 'err', 'ir_need'); end if;
  if ex is not null and w.explain is not null then return jsonb_build_object('ok', false, 'err', 'warn_explained'); end if;
  if ex is not null and now() > w.issued_at + interval '5 days' then return jsonb_build_object('ok', false, 'err', 'warn_late'); end if;
  if ex is null and w.ack_at is not null then return jsonb_build_object('ok', true, 'ack_at', w.ack_at); end if;
  update public.pr_warnings set ack_at = coalesce(ack_at, now()),
    explain = coalesce(explain, ex), explain_at = case when explain is null and ex is not null then now() else explain_at end
   where id = w.id returning * into w;
  return jsonb_build_object('ok', true, 'ack_at', w.ack_at, 'explain_at', w.explain_at);
end $$;
revoke all on function public.pr_emp_warn_ack(text, text, uuid, text) from public;
grant execute on function public.pr_emp_warn_ack(text, text, uuid, text) to anon, authenticated;

create or replace function public.pr_warn_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare nm text := (select name from public.pr_employees where id = new.employee_id);
        lbl text := case new.cat when 'service' then '응대' when 'cashbook' then '캐시북' when 'late' then '지각' else '무단결석' end;
begin
  if new.kind = 'ir' then
    if new.explain is not null and old.explain is null then
      perform public.pr_notify('📝 IR 제출 · ' || nm || ' · ' || public.pr_md(new.day) || coalesce(' #' || new.order_no, '') || E'\n' || left(new.explain, 300));
    end if;
  elsif new.ack_at is not null and old.ack_at is null then
    perform public.pr_notify('⚠️ 경고 확인 · ' || nm || ' · ' || public.pr_md(new.day) || ' ' || lbl || E'\n직원이 내용 확인·사인했어요'
      || case when new.explain is not null then E'\n해명: ' || left(new.explain, 300) else '' end);
  elsif new.explain is not null and old.explain is null then
    perform public.pr_notify('⚠️ 경고 해명 · ' || nm || ' · ' || public.pr_md(new.day) || ' ' || lbl || E'\n' || left(new.explain, 300));
  end if;
  return null;
end $$;
