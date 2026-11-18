-- 13th month: every request picks the exact date to receive it (owner 2026-11-13)
--   A request (requested_at) now always opens the date picker on the staff Home (date_ask_at = requested_at),
--   not only when the owner asked. Same rules: up to 12/23 one person per day, 12/24 everyone together.
create or replace function public.pr_13_req_date_trg() returns trigger language plpgsql as $$
begin
  if new.requested_at is not null and new.date_ask_at is null then new.date_ask_at := new.requested_at; end if;
  return new;
end $$;
drop trigger if exists pr_13_req_date on public.pr_13_ack;
create trigger pr_13_req_date before insert or update on public.pr_13_ack for each row execute function public.pr_13_req_date_trg();

-- requests already in without a date (Arlyn, June) → asked now
update public.pr_13_ack a set date_ask_at = coalesce(a.requested_at, now())
 where a.requested_at is not null and a.date_ask_at is null and a.pay_date is null
   and not exists (select 1 from public.pr_thirteenth x where x.employee_id = a.employee_id and x.year = a.year);
