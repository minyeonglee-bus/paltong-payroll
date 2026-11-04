-- 급여 앱 푸시 알림 (사장님 2026-11-04: 카톡 말고 앱 푸시)
--  • 사장님 폰/PC 급여 앱에서 "푸시 켜기" → pr_push_subs 에 기기 등록 (사장님 계정만)
--  • pr_notify(text) 는 이제 카톡 대신 웹 푸시로 보냄: 첫 줄 = 제목, 나머지 = 내용, 누르면 급여 앱 열림
--    (휴가 신청 · 출퇴근 사유 · 가불 · 캐시북 현금 부족 · 매일 10:03 승인 대기 요약 — pr_notify.sql 의 트리거 그대로)
--  • 전송은 주문 사이트 Vercel 함수 /api/push (VAPID 서명·암호화, 외부 패키지 없음)에 급여 앱 전용 VAPID 키로 요청
--  • 15분마다 만료된 기기(404/410) 정리
--  키(VAPID 비밀키·전송 비밀값)는 저장소에 넣지 않고 DB pr_push_cfg 에만.
create table if not exists public.pr_push_cfg (
  id int primary key default 1 check (id = 1),
  public_key text not null, private_key text not null, relay_url text not null, relay_secret text not null
);
alter table public.pr_push_cfg enable row level security;

create table if not exists public.pr_push_subs (
  endpoint text primary key, p256dh text not null, auth text not null, label text,
  user_id uuid default auth.uid(), created_at timestamptz default now(), last_ok timestamptz
);
alter table public.pr_push_subs enable row level security;

create or replace function public.pr_push_info()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'OWNER_ONLY'; end if;
  return jsonb_build_object('public_key', (select public_key from public.pr_push_cfg where id = 1), 'devices', (select count(*) from public.pr_push_subs));
end $$;
grant execute on function public.pr_push_info() to authenticated;

create or replace function public.pr_push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_label text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'OWNER_ONLY'; end if;
  insert into public.pr_push_subs (endpoint, p256dh, auth, label, user_id) values (p_endpoint, p_p256dh, p_auth, left(p_label, 60), auth.uid())
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, label = excluded.label, user_id = excluded.user_id;
end $$;
grant execute on function public.pr_push_subscribe(text, text, text, text) to authenticated;

create or replace function public.pr_push_unsubscribe(p_endpoint text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'OWNER_ONLY'; end if;
  delete from public.pr_push_subs where endpoint = p_endpoint;
end $$;
grant execute on function public.pr_push_unsubscribe(text) to authenticated;

-- 알림 보내기 (카톡 → 앱 푸시)
create or replace function public.pr_notify(p_text text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare k public.pr_push_cfg; subs jsonb; t text := coalesce(p_text, ''); title text; body text;
begin
  select * into k from public.pr_push_cfg where id = 1;
  if k is null or t = '' then return; end if;
  select jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth)) into subs from public.pr_push_subs;
  if subs is null then return; end if;
  title := split_part(t, E'\n', 1);
  body := nullif(substr(t, length(title) + 2), '');
  begin
    perform net.http_post(url := k.relay_url,
      body := jsonb_build_object('secret', k.relay_secret,
        'vapid', jsonb_build_object('public', k.public_key, 'private', k.private_key, 'subject', 'mailto:admin@paltong.app'),
        'subs', subs,
        'payload', jsonb_build_object('title', title, 'body', coalesce(body, ''), 'tag', 'pr-' || md5(t || clock_timestamp()::text), 'kind', 'pr', 'url', '/')),
      headers := '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds := 15000);
  exception when others then raise warning 'pr_notify 실패: %', sqlerrm;
  end;
end $$;
revoke all on function public.pr_notify(text) from public, anon, authenticated;

create or replace function public.pr_push_test()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'OWNER_ONLY'; end if;
  perform public.pr_notify(E'✅ 빨통 급여 앱 알림\n이 기기로 신청·승인 알림이 와요.');
end $$;
grant execute on function public.pr_push_test() to authenticated;

-- 전송 결과 보고 만료 기기 정리 · 성공 시각 기록
create or replace function public.pr_push_cleanup()
returns void language plpgsql security definer set search_path = public, extensions as $$
declare r record;
begin
  for r in select x->>'endpoint' ep, (x->>'status')::int st
           from net._http_response h, jsonb_array_elements(case when h.content like '{"results"%' then h.content::jsonb->'results' else '[]'::jsonb end) x
           where h.created > now() - interval '1 hour' loop
    if r.st in (404, 410) then delete from public.pr_push_subs where endpoint = r.ep;
    elsif r.st between 200 and 299 then update public.pr_push_subs set last_ok = now() where endpoint = r.ep; end if;
  end loop;
end $$;
select cron.unschedule('pr-push-cleanup') where exists (select 1 from cron.job where jobname = 'pr-push-cleanup');
select cron.schedule('pr-push-cleanup', '*/15 * * * *', 'select public.pr_push_cleanup()');
