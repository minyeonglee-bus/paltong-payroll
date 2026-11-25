-- 날짜별 시재 (사장님 2026-11-26 "오늘만 마감 시재 25k, 수정 못하게")
-- settings.float_days = {"2026-11-25": 25000} — 그 날 하루 마감(savingbox) 줄의 float_amt는 이 금액만 저장 가능 (사장님 제외)
alter table public.settings add column if not exists float_days jsonb not null default '{}'::jsonb;

create or replace function public.float_day_guard() returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare f numeric;
begin
  if new.kind is distinct from 'savingbox' or auth.uid() is null or public.is_owner() then return new; end if;
  select (float_days ->> new.biz_date::text)::numeric into f from public.settings where id = 1;
  if f is not null and new.float_amt is distinct from f then
    raise exception '이 날 시재는 ₱% 로 정해져 있어요 — 바꿀 수 없어요 / The float for % is fixed at ₱% by the owner.', f, new.biz_date, f;
  end if;
  return new;
end $function$;
drop trigger if exists float_day_guard_trg on public.entries;
create trigger float_day_guard_trg before insert or update on public.entries for each row execute function public.float_day_guard();

update public.settings set float_days = coalesce(float_days, '{}'::jsonb) || '{"2026-11-25": 25000}'::jsonb where id = 1;
