-- ⚠️ 경고 (사장님 2026-11-21) — 「징계 규정 및 경고 통지서」(11/17) 그대로
--  구분: 응대(service) · 캐시북(cashbook) = 합산, 지각(late) · 무단결석(absent) = 각각 따로
--  누적: 응대·캐시북 2026-09-01부터 1년씩, 지각·무단결석 2026-11-18부터 1년씩 (그 전 날짜는 참고, 횟수 제외)
--  단계: 1 서면 경고 · 2 사유서 제출 · 3 징계 · 4 정직/스케줄 차감(최대 7일) · 5+ 손해배상·해고 절차
--  절차(필리핀 due process): 사장님 등록 → 직원 앱에 뜸 → 직원이 내용 확인·사인(등록된 사인) + 5일 안에 해명(서면) → 인쇄.
--  직원이 사인을 거부하면 사장님이 "서명 거부" 기록 (증인 메모).
create table if not exists public.pr_warnings (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.pr_employees(id) on delete cascade,
  day date not null,                                   -- 사건 날짜
  cat text not null check (cat in ('service', 'cashbook', 'late', 'absent')),
  detail text not null,
  order_no text,
  action text,                                         -- 비우면 단계 기본 문구
  verbal_on date,                                      -- 구두 경고를 한 날 (있으면)
  counted boolean not null default true,               -- false = 참고 (횟수 제외)
  proof jsonb not null default '[]'::jsonb,            -- 캡처 사진 (JPEG data URL, 최대 3장)
  issued_at timestamptz not null default now(),        -- 통지(등록) 시각 → 해명 기한 = +5일
  ack_at timestamptz,                                  -- 직원 확인·사인
  explain text, explain_at timestamptz,                -- 직원 해명
  refused_at timestamptz, refused_note text,           -- 서명 거부 (사장님 기록)
  status text not null default 'active' check (status in ('active', 'void')),
  void_note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists pr_warnings_emp_idx on public.pr_warnings(employee_id, day);
alter table public.pr_warnings enable row level security;
drop policy if exists pr_warn_owner on public.pr_warnings;
create policy pr_warn_owner on public.pr_warnings for all using (public.is_owner()) with check (public.is_owner());
drop policy if exists pr_warn_printer on public.pr_warnings;
create policy pr_warn_printer on public.pr_warnings for select using (public.is_pr_printer());
revoke all on public.pr_warnings from anon;

create or replace function public.pr_warn_grp(c text) returns text language sql immutable as $$
  select case when c in ('service', 'cashbook') then 'svc' else c end $$;
create or replace function public.pr_warn_start(c text) returns date language sql immutable as $$
  select case when c in ('service', 'cashbook') then date '2026-09-01' else date '2026-11-18' end $$;
-- 그 날짜가 속한 1년 누적 기간의 시작일 (시작일 전이면 null = 참고)
create or replace function public.pr_warn_win(c text, d date) returns date language sql immutable as $$
  select case when d < public.pr_warn_start(c) then null
    else (public.pr_warn_start(c) + make_interval(years => extract(year from age(d, public.pr_warn_start(c)))::int))::date end $$;

-- 단계 계산 (무효·참고·시작일 전 제외). security_invoker → 사장님/인쇄만 직접 읽음, 직원은 아래 RPC로.
create or replace view public.pr_warnings_v with (security_invoker = true) as
select w.*, public.pr_warn_grp(w.cat) as grp, public.pr_warn_win(w.cat, w.day) as win_from,
  case when w.status = 'active' and w.counted and public.pr_warn_win(w.cat, w.day) is not null then
    count(*) filter (where w.status = 'active' and w.counted and public.pr_warn_win(w.cat, w.day) is not null)
      over (partition by w.employee_id, public.pr_warn_grp(w.cat), public.pr_warn_win(w.cat, w.day) order by w.day, w.created_at rows between unbounded preceding and current row)
  end::int as step,
  (w.issued_at + interval '5 days') as explain_by
from public.pr_warnings w;
revoke all on public.pr_warnings_v from anon;
grant select on public.pr_warnings_v to authenticated;

create or replace function public.pr_warn_proof_ok(p jsonb) returns boolean language sql immutable as $$
  select p is not null and jsonb_typeof(p) = 'array' and jsonb_array_length(p) <= 3
     and not exists (select 1 from jsonb_array_elements(p) x
                      where jsonb_typeof(x) <> 'string' or x #>> '{}' not like 'data:image/jpeg;base64,%' or length(x #>> '{}') > 900000) $$;

-- 사장님: 등록
create or replace function public.pr_warn_add(p_emp uuid, p_day date, p_cat text, p_detail text, p_order text, p_action text,
  p_verbal date, p_counted boolean, p_proof jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare nid uuid; st int;
begin
  if not public.is_owner() then raise exception 'not allowed'; end if;
  if p_emp is null or p_day is null or p_cat not in ('service', 'cashbook', 'late', 'absent') or nullif(trim(coalesce(p_detail, '')), '') is null
    then return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
  if p_day > (now() at time zone 'Asia/Manila')::date then return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
  if not public.pr_warn_proof_ok(coalesce(p_proof, '[]'::jsonb)) then return jsonb_build_object('ok', false, 'err', 'bad_proof'); end if;
  insert into public.pr_warnings (employee_id, day, cat, detail, order_no, action, verbal_on, counted, proof)
  values (p_emp, p_day, p_cat, left(trim(p_detail), 1000), nullif(left(trim(coalesce(p_order, '')), 60), ''), nullif(left(trim(coalesce(p_action, '')), 200), ''),
          p_verbal, coalesce(p_counted, true), coalesce(p_proof, '[]'::jsonb))
  returning id into nid;
  select step into st from public.pr_warnings_v where id = nid;
  return jsonb_build_object('ok', true, 'id', nid, 'step', st);
end $$;
revoke all on function public.pr_warn_add(uuid, date, text, text, text, text, date, boolean, jsonb) from public, anon;
grant execute on function public.pr_warn_add(uuid, date, text, text, text, text, date, boolean, jsonb) to authenticated;

-- 사장님: 무효 / 되살리기 / 서명 거부 기록 / 거부 취소
create or replace function public.pr_warn_set(p_id uuid, p_op text, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'not allowed'; end if;
  if p_op = 'void' then update public.pr_warnings set status = 'void', void_note = nullif(left(trim(coalesce(p_note, '')), 200), '') where id = p_id;
  elsif p_op = 'unvoid' then update public.pr_warnings set status = 'active', void_note = null where id = p_id;
  elsif p_op = 'refused' then update public.pr_warnings set refused_at = now(), refused_note = nullif(left(trim(coalesce(p_note, '')), 300), '') where id = p_id and ack_at is null;
  elsif p_op = 'unrefused' then update public.pr_warnings set refused_at = null, refused_note = null where id = p_id;
  else return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
  if not found then return jsonb_build_object('ok', false, 'err', 'noData'); end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.pr_warn_set(uuid, text, text) from public, anon;
grant execute on function public.pr_warn_set(uuid, text, text) to authenticated;

-- 직원: 내 경고 (사진은 장수만 — 사진은 pr_emp_warn_proof)
create or replace function public.pr_emp_warnings(p_no text, p_pin text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c record;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  return jsonb_build_object('ok', true, 'rows', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'day', day, 'cat', cat, 'detail', detail, 'order_no', order_no,
      'action', action, 'verbal_on', verbal_on, 'counted', counted, 'step', step, 'proof_n', jsonb_array_length(proof), 'issued_at', issued_at, 'explain_by', explain_by,
      'ack_at', ack_at, 'explain', explain, 'explain_at', explain_at, 'refused_at', refused_at) order by day desc, created_at desc)
    from public.pr_warnings_v where employee_id = c.emp_id and status = 'active'), '[]'::jsonb));
end $$;
revoke all on function public.pr_emp_warnings(text, text) from public;
grant execute on function public.pr_emp_warnings(text, text) to anon, authenticated;

create or replace function public.pr_emp_warn_proof(p_no text, p_pin text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c record; p jsonb;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  select proof into p from public.pr_warnings where id = p_id and employee_id = c.emp_id and status = 'active';
  return jsonb_build_object('ok', p is not null, 'proof', coalesce(p, '[]'::jsonb));
end $$;
revoke all on function public.pr_emp_warn_proof(text, text, uuid) from public;
grant execute on function public.pr_emp_warn_proof(text, text, uuid) to anon, authenticated;

-- 직원: 확인·사인 (+ 해명). 확인은 한 번, 해명은 기한(통지 + 5일) 안에 한 번.
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

-- 사장님 알림: 직원이 확인·해명했을 때
create or replace function public.pr_warn_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare nm text := (select name from public.pr_employees where id = new.employee_id);
        lbl text := case new.cat when 'service' then '응대' when 'cashbook' then '캐시북' when 'late' then '지각' else '무단결석' end;
begin
  if new.ack_at is not null and old.ack_at is null then
    perform public.pr_notify('⚠️ 경고 확인 · ' || nm || ' · ' || public.pr_md(new.day) || ' ' || lbl || E'\n직원이 내용 확인·사인했어요'
      || case when new.explain is not null then E'\n해명: ' || left(new.explain, 300) else '' end);
  elsif new.explain is not null and old.explain is null then
    perform public.pr_notify('⚠️ 경고 해명 · ' || nm || ' · ' || public.pr_md(new.day) || ' ' || lbl || E'\n' || left(new.explain, 300));
  end if;
  return null;
end $$;
drop trigger if exists pr_warn_notify on public.pr_warnings;
create trigger pr_warn_notify after update of ack_at, explain on public.pr_warnings for each row execute function public.pr_warn_notify();
