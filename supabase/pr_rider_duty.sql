-- Payroll ↔ rider app (owner 2026-11-09: "페이롤에서 인 누르면 자동으로 기사앱 켜지고 아웃하면 꺼지게").
-- When a rider (position = 'rider') clocks in / out in the payroll app, turn their duty on / off in the order/rider
-- project (PALTONG ORDER/RIDER, yzdhcumibflxtqkqvbul) via pg_net → rpc rider_duty_ext (paltong-order: sql/rider_duty_payroll.sql).
-- Matched by phone (info.phone = riders.phone), else by name. The shared secret is in Vault as 'rider_duty_secret'
-- (create it once with: select vault.create_secret('<secret>', 'rider_duty_secret');). Never blocks a punch.
create or replace function public.pr_rider_duty_sync()
returns trigger language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare e public.pr_employees; s text;
  k text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6ZGhjdW1pYmZseHRxa3F2YnVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyNDI3NDgsImV4cCI6MjEwNTgxODc0OH0.qSEMyhZ9HWEpaGXEupQzYkHxIvUC5Y1yhr5T2N-VD7w';
begin
  if new.status = 'void' or new.kind not in ('in', 'out') or new.punched_at < now() - interval '15 minutes' then return new; end if;
  select * into e from public.pr_employees where id = new.employee_id;
  if e.position is distinct from 'rider' then return new; end if;
  begin
    select decrypted_secret into s from vault.decrypted_secrets where name = 'rider_duty_secret';
    if s is null then return new; end if;
    perform net.http_post(
      url := 'https://yzdhcumibflxtqkqvbul.supabase.co/rest/v1/rpc/rider_duty_ext',
      body := jsonb_build_object('p_secret', s, 'p_phone', e.info->>'phone', 'p_name', coalesce(nullif(e.info->>'full_name', ''), e.name), 'p_on', new.kind = 'in'),
      headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', k, 'Authorization', 'Bearer ' || k));
  exception when others then null; end;
  return new;
end $$;
drop trigger if exists pr_rider_duty on public.pr_punches;
create trigger pr_rider_duty after insert on public.pr_punches for each row execute function public.pr_rider_duty_sync();
