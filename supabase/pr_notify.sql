-- 사장님 알림 (2026-11-04): 신청·승인할 일이 생기면 사장님 카톡 "나와의 채팅"으로
--  보내는 길: 급여 DB(pg_net) → 주문 사이트 Supabase 엣지함수 kakao-alert (action memo, notify_key) → 사장님 카카오 계정
--  (카톡 연결은 paltong-order.com/kakao-setup 에서 사장님 로그인한 계정. 로그인 전이면 조용히 건너뜀)
--  알림: 휴가 신청(묶음 1건) · 출퇴근 사유(확인 대기) · 가불 신청(자동 승인, 참고) · 캐시북 현금 부족
--  매일 10:03(마닐라) 승인 대기 요약 (있을 때만). 앱 상단 "승인 대기" 표시용 pr_pending_counts().
-- 함께: Day off 는 7일 전까지만 신청 · 월 개근휴가(3.2조)는 구 계약서(Erika) 제외 (info.old_contract)
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create table if not exists public.pr_notify_cfg (
  id int primary key default 1 check (id = 1),
  url text not null, key text not null, enabled boolean not null default true
);
alter table public.pr_notify_cfg enable row level security;
-- 값은 마이그레이션에서 넣음 (주문 사이트 kakao_alert_cfg.notify_key)

create or replace function public.pr_notify(p_text text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare c public.pr_notify_cfg;
begin
  select * into c from public.pr_notify_cfg where id = 1;
  if c is null or not c.enabled or coalesce(p_text, '') = '' then return; end if;
  begin
    perform net.http_post(url := c.url, body := jsonb_build_object('action', 'memo', 'key', c.key, 'text', left(p_text, 200)),
      headers := '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds := 10000);
  exception when others then raise warning 'pr_notify 실패: %', sqlerrm;
  end;
end $$;
revoke all on function public.pr_notify(text) from public, anon, authenticated;

create or replace function public.pr_md(d date) returns text language sql immutable as $$
  select to_char(d, 'FMMM/FMDD') || ' ' || (array['일','월','화','수','목','금','토'])[extract(dow from d)::int + 1] $$;

-- 휴가 신청 (한 번에 신청한 기간 = 알림 1건)
create or replace function public.pr_sil_req_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare g record;
begin
  for g in select n.employee_id, coalesce(n.grp::text, n.id::text) k, min(n.kind) kind, min(n.day) d0, max(n.day) d1, count(*) cnt, min(n.reason) reason
           from nr n where n.status = 'pending' group by 1, 2 loop
    perform public.pr_notify('🌴 휴가 신청 · ' || (select name from public.pr_employees where id = g.employee_id) || E'\n'
      || case g.kind when 'off' then 'Day off (무급)' when 'mpv' then '월 개근 휴가' else 'SIL' end || ' · '
      || public.pr_md(g.d0) || case when g.d1 > g.d0 then ' ~ ' || public.pr_md(g.d1) else '' end || ' (' || g.cnt || '일)'
      || coalesce(E'\n사유: ' || g.reason, '') || E'\n👉 급여 앱 → 지급 예정 → 휴가 신청 확인');
  end loop;
  return null;
end $$;
drop trigger if exists pr_sil_req_notify on public.pr_sil_req;
create trigger pr_sil_req_notify after insert on public.pr_sil_req referencing new table as nr
  for each statement execute function public.pr_sil_req_notify();

-- 출퇴근 사유 (확인 대기가 되면)
create or replace function public.pr_punch_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare nm text; why text; t text;
begin
  if new.status <> 'pending' or (tg_op = 'UPDATE' and old.status = 'pending') then return null; end if;
  select name into nm from public.pr_employees where id = new.employee_id;
  why := nullif(trim(regexp_replace(coalesce(new.reason, ''), '^#[a-z]+:?([0-9a-f-]{36})?', '')), '');
  t := to_char(new.punched_at at time zone 'Asia/Manila', 'FMMM/FMDD HH24:MI');
  perform public.pr_notify('⏰ 출퇴근 사유 확인 · ' || nm || E'\n'
    || case when new.kind = 'in' then '출근 ' else '퇴근 ' end || t
    || coalesce(' (스케줄 ' || new.plan_shift || ')', '')
    || case when coalesce(new.dev_min, 0) > 0 then ' · ' || new.dev_min || '분 늦음' when coalesce(new.dev_min, 0) < 0 then ' · ' || abs(new.dev_min) || '분 일찍' else '' end
    || case new.mode when 'cover' then E'\n교대자 조기 퇴근 때문' when 'relief' then E'\n교대자 지각 때문' when 'work' then E'\n업무상 이유' else '' end
    || coalesce(E'\n사유: ' || why, '') || E'\n👉 급여 앱 → 지급 예정 → 출퇴근 사유 확인');
  return null;
end $$;
drop trigger if exists pr_punch_notify on public.pr_punches;
create trigger pr_punch_notify after insert or update of status on public.pr_punches
  for each row execute function public.pr_punch_notify();

-- 가불 신청 (자동 승인 — 참고 알림)
create or replace function public.pr_adv_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind <> 'advance' or new.self_req_at is null then return null; end if;
  perform public.pr_notify('💸 가불 신청 (자동 승인) · ' || (select name from public.pr_employees where id = new.employee_id) || E'\n₱'
    || to_char(new.amount, 'FM999,999') || ' · ' || case when new.pay_via = 'GCASH' then 'GCash' else '현금' end
    || coalesce(E'\n사유: ' || nullif(regexp_replace(coalesce(new.note, ''), '^📱 가불 신청 \(자동 승인\)( · )?', ''), ''), '')
    || case when new.biz_date >= date '2026-11-05' then E'\n캐시북에 자동 기록됨' else '' end);
  return null;
end $$;
drop trigger if exists pr_adv_notify on public.pr_ledger;
create trigger pr_adv_notify after insert on public.pr_ledger for each row execute function public.pr_adv_notify();

-- 캐시북 현금 부족 (확인 필요)
create or replace function public.pr_cash_issue_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'open' then return null; end if;
  perform public.pr_notify('🧾 캐시북 현금 부족 · ' || public.pr_md(new.biz_date) || ' ' || case new.stage when 'mid' then '중간마감' else '마감' end || E'\n₱'
    || to_char(abs(new.amount), 'FM999,999.00') || coalesce(' · 센 사람 ' || new.counted_by, '') || coalesce(E'\n사유: ' || nullif(new.reason, ''), '')
    || E'\n👉 급여 앱 → 가불·부족분·보너스');
  return null;
end $$;
drop trigger if exists pr_cash_issue_notify on public.pr_cash_issues;
create trigger pr_cash_issue_notify after insert on public.pr_cash_issues for each row execute function public.pr_cash_issue_notify();

-- 승인 대기 개수 (앱 상단 표시 · 매일 요약)
create or replace function public.pr_pending_raw()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'leave', (select count(distinct coalesce(grp::text, id::text)) from public.pr_sil_req where status = 'pending'),
    'punch', (select count(*) from public.pr_punches where status = 'pending'),
    'cash',  (select count(*) from public.pr_cash_issues where status = 'open')) $$;
revoke all on function public.pr_pending_raw() from public, anon, authenticated;

create or replace function public.pr_pending_counts()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_owner() then return null; end if;
  return public.pr_pending_raw();
end $$;
grant execute on function public.pr_pending_counts() to authenticated;

create or replace function public.pr_pending_daily()
returns void language plpgsql security definer set search_path = public as $$
declare p jsonb := public.pr_pending_raw(); a int := (p->>'leave')::int; b int := (p->>'punch')::int; c int := (p->>'cash')::int;
begin
  if a + b + c = 0 then return; end if;
  perform public.pr_notify('📋 승인 대기 ' || (a + b + c) || '건' || E'\n'
    || concat_ws(' · ', case when a > 0 then '휴가 ' || a end, case when b > 0 then '출퇴근 사유 ' || b end, case when c > 0 then '현금 부족 ' || c end)
    || E'\n👉 급여 앱에서 확인해 주세요');
end $$;
select cron.unschedule('pr-pending-daily') where exists (select 1 from cron.job where jobname = 'pr-pending-daily');
select cron.schedule('pr-pending-daily', '3 2 * * *', 'select public.pr_pending_daily()');   -- 10:03 마닐라

-- Day off 는 7일 전까지만
do $do$ declare d text := pg_get_functiondef('public.pr_emp_leave_request(text,text,text,date,date,text)'::regprocedure); n text;
begin
  if position('off_7days' in d) > 0 then return; end if;
  n := replace(d, $a$  select array_agg(x::date order by x) into days$a$,
    $a$  if p_kind = 'off' and p_from < td + 7 then return jsonb_build_object('ok', false, 'err', 'off_7days', 'min', td + 7); end if;
  select array_agg(x::date order by x) into days$a$);
  if n = d then raise exception 'off_7days patch not applied'; end if;
  execute n;
end $do$;

-- 월 개근휴가: 구 계약서 직원 제외 (Erika)
update public.pr_employees set info = coalesce(info, '{}'::jsonb) || '{"old_contract": true}' where name = 'Erika';
do $do$ declare d text := pg_get_functiondef('public.pr_mpv(uuid)'::regprocedure); n text;
begin
  if position('old_contract' in d) > 0 then return; end if;
  n := replace(d, $a$begin
  while m <= cur loop$a$, $a$begin
  if coalesce((select (info->>'old_contract')::boolean from public.pr_employees where id = p_emp), false) then return out; end if;
  while m <= cur loop$a$);
  if n = d then raise exception 'old_contract patch not applied'; end if;
  execute n;
end $do$;
