-- =========================================================
-- Paltong Payroll — Supabase schema (run whole file once in SQL Editor)
-- =========================================================
create extension if not exists pgcrypto;

-- ---------- logins ----------
create table if not exists public.app_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  name       text not null,
  role       text not null default 'owner' check (role in ('owner','viewer')),
  created_at timestamptz not null default now()
);
create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_users where user_id = auth.uid() and role = 'owner');
$$;
create or replace function public.is_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_users where user_id = auth.uid());
$$;

-- ---------- employees ----------
create table if not exists public.employees (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  position    text not null default 'waiter' check (position in ('waiter','kitchen','rider','other')),
  daily_rate  numeric(10,2) not null default 718,
  pay_type    text not null default 'daily' check (pay_type in ('daily','monthly')),
  status      text not null default 'regular' check (status in ('regular','probationary','fixed','other')),
  hired_on    date,
  birthday    date,
  active      boolean not null default true,
  note        text,
  created_at  timestamptz not null default now()
);

-- ---------- ledger: salary advances (가불) and verified cash shortages (현금 부족분) ----------
create table if not exists public.ledger (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees(id) on delete cascade,
  kind         text not null check (kind in ('advance','shortage','other')),
  biz_date     date not null,
  amount       numeric(12,2) not null check (amount > 0),
  note         text,
  verified     boolean not null default true,     -- shortage: investigation done & responsibility established
  authorized   boolean not null default false,    -- written authorization on file
  payroll_id   uuid,                               -- set when deducted
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists ledger_emp_date on public.ledger(employee_id, biz_date);

-- ---------- payroll periods ----------
create table if not exists public.payrolls (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees(id) on delete cascade,
  period_start  date not null,
  period_end    date not null,
  daily_rate    numeric(10,2) not null,
  break_hours   numeric(4,2) not null default 1,
  days          jsonb not null default '[]'::jsonb,   -- [{date, shift, type}]
  late_minutes  integer not null default 0,
  incentive     numeric(12,2) not null default 0,
  other_deduction numeric(12,2) not null default 0,
  gov           jsonb not null default '{"sss":false,"philhealth":false,"pagibig":false,"share":0.5}'::jsonb,
  result        jsonb not null default '{}'::jsonb,   -- computePayroll output snapshot
  status        text not null default 'draft' check (status in ('draft','paid')),
  paid_on       date,
  paid_via      text,
  note          text,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (employee_id, period_start, period_end)
);
alter table public.ledger drop constraint if exists ledger_payroll_fk;
alter table public.ledger add constraint ledger_payroll_fk foreign key (payroll_id) references public.payrolls(id) on delete set null;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists payrolls_touch on public.payrolls;
create trigger payrolls_touch before update on public.payrolls for each row execute function public.touch_updated_at();

-- a paid payroll is frozen: only the owner may change it
create or replace function public.guard_paid_payroll() returns trigger language plpgsql as $$
begin
  if old.status = 'paid' and not public.is_owner() then raise exception 'PAID_LOCKED'; end if;
  return coalesce(new, old);
end $$;
drop trigger if exists payrolls_guard on public.payrolls;
create trigger payrolls_guard before update or delete on public.payrolls for each row execute function public.guard_paid_payroll();

-- ---------- settings ----------
create table if not exists public.settings (
  id            int primary key default 1 check (id = 1),
  min_wage      numeric(10,2) not null default 718,
  break_hours   numeric(4,2) not null default 1,
  sss_on        boolean not null default false,
  philhealth_on boolean not null default false,
  pagibig_on    boolean not null default false,
  gov_share     numeric(3,2) not null default 0.5,
  lang          text not null default 'ko'
);
insert into public.settings (id) values (1) on conflict do nothing;

-- ---------- RLS: signed-in app users only; owner can write ----------
alter table public.app_users enable row level security;
alter table public.employees enable row level security;
alter table public.ledger    enable row level security;
alter table public.payrolls  enable row level security;
alter table public.settings  enable row level security;

drop policy if exists app_users_self on public.app_users;
create policy app_users_self on public.app_users for select using (user_id = auth.uid() or public.is_owner());

drop policy if exists employees_read  on public.employees; create policy employees_read  on public.employees for select using (public.is_user());
drop policy if exists employees_write on public.employees; create policy employees_write on public.employees for all using (public.is_owner()) with check (public.is_owner());
drop policy if exists ledger_read  on public.ledger; create policy ledger_read  on public.ledger for select using (public.is_user());
drop policy if exists ledger_write on public.ledger; create policy ledger_write on public.ledger for all using (public.is_owner()) with check (public.is_owner());
drop policy if exists payrolls_read  on public.payrolls; create policy payrolls_read  on public.payrolls for select using (public.is_user());
drop policy if exists payrolls_write on public.payrolls; create policy payrolls_write on public.payrolls for all using (public.is_owner()) with check (public.is_owner());
drop policy if exists settings_read  on public.settings; create policy settings_read  on public.settings for select using (public.is_user());
drop policy if exists settings_write on public.settings; create policy settings_write on public.settings for update using (public.is_owner()) with check (public.is_owner());

-- ---------- create_login(id, password, name, role) — IDs map to <id>@paltong.app, never emailed ----------
create or replace function public.create_login(p_id text, p_pw text, p_name text, p_role text default 'owner', p_reset boolean default false)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_id text := lower(trim(p_id)); v_email text; uid uuid;
begin
  if v_id !~ '^[a-z0-9._-]{1,30}$' then raise exception 'ID must be letters/numbers (1-30): %', p_id; end if;
  if p_role not in ('owner','viewer') then raise exception 'role must be owner or viewer'; end if;
  v_email := v_id || '@paltong.app';
  select id into uid from auth.users where email = v_email;
  if uid is null then
    uid := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', v_email,
      extensions.crypt(p_pw, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), uid, uid::text,
      jsonb_build_object('sub', uid::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now());
    insert into public.app_users (user_id, name, role) values (uid, p_name, p_role)
    on conflict (user_id) do update set name = excluded.name, role = excluded.role;
    return v_id || ' created';
  elsif p_reset then
    update auth.users set encrypted_password = extensions.crypt(p_pw, extensions.gen_salt('bf')) where id = uid;
    insert into public.app_users (user_id, name, role) values (uid, p_name, p_role)
    on conflict (user_id) do update set role = excluded.role;
    return v_id || ' password reset';
  else
    insert into public.app_users (user_id, name, role) values (uid, p_name, p_role) on conflict (user_id) do nothing;
    return v_id || ' already exists';
  end if;
end $$;
revoke all on function public.create_login(text, text, text, text, boolean) from public;
do $$ begin
  begin revoke all on function public.create_login(text, text, text, text, boolean) from anon, authenticated; exception when undefined_object then null; end;
end $$;

-- owner login (change the password after first login: 메뉴 → 비밀번호 변경)
select public.create_login('admin', 'paltong1234', 'Admin', 'owner', false);
