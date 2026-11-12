-- Print-only admin logins (owner 2026-11-12): Mina is a manager whose pay is not the restaurant payroll.
-- Her admin login (mina) sees only the 🖨 인쇄 tab — read access for printing signed documents, nothing to approve or edit.
-- She is also left out of the restaurant payroll lists (pr_employees.info.no_payroll = true).
create table if not exists public.pr_print_users (user_id uuid primary key, note text, created_at timestamptz default now());
alter table public.pr_print_users enable row level security;
drop policy if exists pr_print_users_self on public.pr_print_users;
create policy pr_print_users_self on public.pr_print_users for select using (user_id = auth.uid() or public.is_owner());

create or replace function public.is_pr_printer() returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.pr_print_users where user_id = auth.uid()) $$;

do $$ declare t text; begin
  foreach t in array array['pr_employees', 'pr_payrolls', 'pr_ledger', 'pr_punches', 'pr_signatures', 'pr_settings'] loop
    execute format('drop policy if exists %I on public.%I', t || '_printer_read', t);
    execute format('create policy %I on public.%I for select using (public.is_pr_printer())', t || '_printer_read', t);
  end loop;
end $$;

insert into public.pr_print_users (user_id, note)
select s.user_id, 'Mina — manager, print only' from public.staff s where s.name = 'Mina' on conflict do nothing;
update public.pr_employees set info = coalesce(info, '{}'::jsonb) || '{"no_payroll": true}' where name = 'Mina';
