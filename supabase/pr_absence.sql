-- 결석 알리기 (사장님 2026-11-17)
--  직원 앱 홈 "🤒 결석 알리기" → 스케줄 있는 날 + 이유(병가 / 경조사 / 개인 사유)
--  • 병가·경조사 + 증빙 사진(진단서·부고 등, 최대 3장) → 확인서, 상태 pending → 사장님이 사진 보고 승인/반려
--      승인 = 유급 1일 (SIL 차감 없음, 급여 종류 'excused'), 무단결근 아님 → 개근휴가(3.2조)·생일 인센티브 유지
--      반려 = 무단결근 (사유서 Noted)
--  • 증빙 없음(개인 사유 포함) → 사유서, 상태 noted = 무단결근 (무급·월급자 공제, 개근휴가 없음)
--      병가·경조사는 결석일 + 7일 안에 증빙을 나중에 올리면 pending 으로 바뀜 (급여 공유 전까지)
--  • 급여: 관리자 급여 화면이 열릴 때 그날(출근 기록 없는 날)을 excused / absent 로 자동 표시
create table if not exists public.pr_absences (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.pr_employees(id) on delete cascade,
  day date not null,
  plan_shift text,
  kind text not null check (kind in ('sick', 'family', 'personal')),
  note text,
  proof jsonb not null default '[]'::jsonb,          -- ["data:image/jpeg;base64,…", …] 최대 3장
  proof_at timestamptz,
  status text not null default 'noted' check (status in ('noted', 'pending', 'approved', 'rejected', 'void')),
  decided_at timestamptz,
  decided_note text,
  created_at timestamptz not null default now(),
  unique (employee_id, day)
);
create index if not exists pr_absences_day_idx on public.pr_absences(day);
alter table public.pr_absences enable row level security;
drop policy if exists pr_abs_read on public.pr_absences; create policy pr_abs_read on public.pr_absences for select using (public.is_owner());

create or replace function public.pr_abs_proof_ok(p jsonb) returns boolean language sql immutable as $$
  select p is not null and jsonb_typeof(p) = 'array' and jsonb_array_length(p) between 1 and 3
     and not exists (select 1 from jsonb_array_elements(p) x
                      where jsonb_typeof(x) <> 'string' or x #>> '{}' not like 'data:image/jpeg;base64,%' or length(x #>> '{}') > 900000) $$;

-- 직원: 결석 알리기 / 증빙 나중에 올리기 (같은 날 다시 부르면 이유·증빙 갱신)
create or replace function public.pr_emp_absence(p_no text, p_pin text, p_day date, p_kind text, p_note text, p_proof jsonb)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare c record; td date := (now() at time zone 'Asia/Manila')::date; sh text; cur public.pr_absences; has_proof boolean; st text; ps date;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  if c.must_change then return jsonb_build_object('ok', false, 'err', 'must_change'); end if;
  if not exists (select 1 from public.pr_signatures where employee_id = c.emp_id) then return jsonb_build_object('ok', false, 'err', 'need_sig'); end if;
  if p_kind not in ('sick', 'family', 'personal') or p_day is null then return jsonb_build_object('ok', false, 'err', 'bad_value'); end if;
  has_proof := p_proof is not null and jsonb_typeof(p_proof) = 'array' and jsonb_array_length(p_proof) > 0;
  if has_proof and (p_kind = 'personal' or not public.pr_abs_proof_ok(p_proof)) then return jsonb_build_object('ok', false, 'err', 'bad_proof'); end if;
  select * into cur from public.pr_absences where employee_id = c.emp_id and day = p_day;
  if cur.id is not null and cur.status in ('approved', 'rejected', 'pending') then return jsonb_build_object('ok', false, 'err', 'abs_decided'); end if;
  if cur.id is null and (p_day < td - 3 or p_day > td + 7) then return jsonb_build_object('ok', false, 'err', 'abs_range'); end if;
  if cur.id is not null and cur.status = 'noted' and p_day < td - 7 then return jsonb_build_object('ok', false, 'err', 'abs_range'); end if;
  ps := case when extract(day from p_day) <= 15 then date_trunc('month', p_day)::date else date_trunc('month', p_day)::date + 15 end;
  if extract(day from p_day) = 31 then ps := (date_trunc('month', p_day) + interval '1 month')::date; end if;   -- 31st → next 1–15 cutoff
  if exists (select 1 from public.pr_payrolls where employee_id = c.emp_id and period_start = ps and (status = 'paid' or shared_at is not null)) then
    return jsonb_build_object('ok', false, 'err', 'abs_locked'); end if;
  select shift into sh from public.pr_plan where employee_id = c.emp_id and day = p_day;
  if cur.id is null and (sh is null or sh in ('off', 'sil')) then return jsonb_build_object('ok', false, 'err', 'abs_noshift'); end if;
  if cur.id is null and exists (select 1 from public.pr_punches where employee_id = c.emp_id and kind = 'in' and status <> 'void'
                                  and (punched_at at time zone 'Asia/Manila')::date = p_day) then
    return jsonb_build_object('ok', false, 'err', 'abs_worked'); end if;
  st := case when has_proof then 'pending' else 'noted' end;
  insert into public.pr_absences as a (employee_id, day, plan_shift, kind, note, proof, proof_at, status)
  values (c.emp_id, p_day, sh, p_kind, nullif(left(trim(coalesce(p_note, '')), 200), ''), coalesce(case when has_proof then p_proof end, '[]'::jsonb), case when has_proof then now() end, st)
  on conflict (employee_id, day) do update set kind = excluded.kind, note = coalesce(excluded.note, a.note), proof = excluded.proof,
    proof_at = excluded.proof_at, status = excluded.status, plan_shift = coalesce(a.plan_shift, excluded.plan_shift);
  return jsonb_build_object('ok', true, 'status', st);
end $$;
revoke all on function public.pr_emp_absence(text, text, date, text, text, jsonb) from public;
grant execute on function public.pr_emp_absence(text, text, date, text, text, jsonb) to anon, authenticated;

-- 직원: 취소 (오늘·앞으로의 날, 사장님 결정 전만)
create or replace function public.pr_emp_absence_cancel(p_no text, p_pin text, p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare c record; td date := (now() at time zone 'Asia/Manila')::date;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  delete from public.pr_absences where id = p_id and employee_id = c.emp_id and day >= td and status in ('noted', 'pending');
  if not found then return jsonb_build_object('ok', false, 'err', 'abs_decided'); end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.pr_emp_absence_cancel(text, text, uuid) from public;
grant execute on function public.pr_emp_absence_cancel(text, text, uuid) to anon, authenticated;

-- 직원: 내 결석 (최근 60일 + 앞으로) · 사진은 장수만
create or replace function public.pr_emp_absences(p_no text, p_pin text)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'extensions' as $$
declare c record;
begin
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  return jsonb_build_object('ok', true, 'rows', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'day', day, 'plan_shift', plan_shift, 'kind', kind, 'note', note,
      'proof_n', jsonb_array_length(proof), 'proof_at', proof_at, 'status', status, 'decided_at', decided_at, 'decided_note', decided_note, 'created_at', created_at) order by day desc)
    from public.pr_absences where employee_id = c.emp_id and day >= (now() at time zone 'Asia/Manila')::date - 60 and status <> 'void'), '[]'::jsonb));
end $$;
revoke all on function public.pr_emp_absences(text, text) from public;
grant execute on function public.pr_emp_absences(text, text) to anon, authenticated;

-- 사장님: 확인서 승인 / 반려 (반려 = 무단결근). 이미 결정된 것도 다시 바꿀 수 있음 (급여 공유 전)
create or replace function public.pr_absence_decide(p_id uuid, p_ok boolean, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'not allowed'; end if;
  update public.pr_absences set status = case when p_ok then 'approved' else 'rejected' end, decided_at = now(), decided_note = nullif(left(trim(coalesce(p_note, '')), 200), '')
   where id = p_id and status in ('pending', 'approved', 'rejected', 'noted') and (p_ok = false or jsonb_array_length(proof) > 0);
  if not found then return jsonb_build_object('ok', false, 'err', 'noData'); end if;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.pr_absence_decide(uuid, boolean, text) to authenticated;

-- 사장님 알림
create or replace function public.pr_absence_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (new.status = old.status or new.status not in ('pending', 'noted')) then return null; end if;
  perform public.pr_notify('🤒 결석 · ' || (select name from public.pr_employees where id = new.employee_id) || ' · ' || public.pr_md(new.day)
    || coalesce(' (스케줄 ' || new.plan_shift || ')', '') || E'\n'
    || case new.kind when 'sick' then '병가' when 'family' then '경조사' else '개인 사유' end
    || case when new.status = 'pending' then ' · 증빙 ' || jsonb_array_length(new.proof) || '장 → 확인서 (승인 필요)' else ' · 증빙 없음 → 사유서 (무단결근)' end
    || coalesce(E'\n메모: ' || new.note, '')
    || case when new.status = 'pending' then E'\n👉 급여 앱 → 지급 예정 → 결석 확인' else '' end);
  return null;
end $$;
drop trigger if exists pr_absence_notify on public.pr_absences;
create trigger pr_absence_notify after insert or update of status on public.pr_absences for each row execute function public.pr_absence_notify();

-- 승인 대기 개수에 결석 추가
create or replace function public.pr_pending_raw()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'leave', (select count(distinct coalesce(grp::text, id::text)) from public.pr_sil_req where status = 'pending'),
    'punch', (select count(*) from public.pr_punches where status = 'pending'),
    'cash',  (select count(*) from public.pr_cash_issues where status in ('open', 'wait_owner')),
    'recv',  (select count(*) from public.pr_payrolls where recv_at is not null and recv_ok_at is null)
           + (select count(*) from public.pr_13_ack a where a.recv_at is not null and a.recv_ok_at is null),
    'absence', (select count(*) from public.pr_absences where status = 'pending')) $$;
revoke all on function public.pr_pending_raw() from public, anon, authenticated;

create or replace function public.pr_pending_daily()
returns void language plpgsql security definer set search_path = public as $$
declare p jsonb := public.pr_pending_raw(); a int := (p->>'leave')::int; b int := (p->>'punch')::int; c int := (p->>'cash')::int; r int := coalesce((p->>'recv')::int, 0);
        s int := coalesce((p->>'absence')::int, 0);
begin
  if a + b + c + r + s = 0 then return; end if;
  perform public.pr_notify('📋 승인 대기 ' || (a + b + c + r + s) || '건' || E'\n'
    || concat_ws(' · ', case when a > 0 then '휴가 ' || a end, case when b > 0 then '출퇴근 사유 ' || b end, case when c > 0 then '현금 부족 ' || c end,
                 case when r > 0 then '받음 확인 ' || r end, case when s > 0 then '결석 ' || s end)
    || E'\n👉 급여 앱에서 확인해 주세요');
end $$;
