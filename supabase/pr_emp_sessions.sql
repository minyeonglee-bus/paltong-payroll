-- Staff stay signed in on their phone until they press Sign out (owner 2026-11-04).
-- After a PIN sign-in the phone gets a random device token (only its SHA-256 is stored).
-- Every staff RPC already goes through pr_emp_check(p_no, p_pin): passing 'tok:<token>' as the PIN signs in with the token.
-- Sign out deletes the token; a PIN change or an admin PIN reset deletes all tokens of that employee.
create table if not exists public.pr_emp_sessions (
  token_hash text primary key,
  employee_id uuid not null references public.pr_employees(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);
create index if not exists pr_emp_sessions_emp on public.pr_emp_sessions(employee_id);
alter table public.pr_emp_sessions enable row level security;   -- no policies: only security-definer functions touch it

create or replace function public.pr_emp_check(p_no text, p_pin text, OUT emp_id uuid, OUT err text, OUT must_change boolean)
 returns record language plpgsql security definer set search_path to 'public', 'extensions' as $function$
declare e public.pr_employees; n int; until date; s public.pr_emp_sessions;
begin
  select * into e from public.pr_employees where emp_no = trim(p_no) and (active or resigned_on is not null);
  if not found then err := 'wrong'; return; end if;
  -- device token (auto sign-in)
  if p_pin like 'tok:%' then
    select * into s from public.pr_emp_sessions where token_hash = encode(digest(substr(p_pin, 5), 'sha256'), 'hex') and employee_id = e.id;
    if not found or e.pin_hash is null then err := 'token'; return; end if;
    if e.resigned_on is not null then
      until := public.pr_emp_access_until(e.id);
      if until is not null and (now() at time zone 'Asia/Manila')::date > until then err := 'closed'; return; end if;
    end if;
    update public.pr_emp_sessions set last_used_at = now() where token_hash = s.token_hash and last_used_at < now() - interval '1 hour';
    emp_id := e.id; must_change := false; return;
  end if;
  if e.pin_locked_until is not null and e.pin_locked_until > now() then err := 'locked'; return; end if;
  if (e.pin_hash is null and p_pin = '0000') or (e.pin_hash is not null and e.pin_hash = crypt(coalesce(p_pin, ''), e.pin_hash)) then
    if e.resigned_on is not null then
      until := public.pr_emp_access_until(e.id);
      if until is not null and (now() at time zone 'Asia/Manila')::date > until then err := 'closed'; return; end if;
    end if;
    update public.pr_employees set pin_fails = 0, pin_locked_until = null where id = e.id;
    emp_id := e.id; must_change := e.pin_hash is null; return;
  end if;
  n := e.pin_fails + 1;
  update public.pr_employees set pin_fails = case when n >= 5 then 0 else n end,
         pin_locked_until = case when n >= 5 then now() + interval '10 minutes' else null end
   where id = e.id;
  err := 'wrong';
end $function$;

-- PIN sign-in → new device token (the PIN itself is never stored on the phone)
create or replace function public.pr_emp_token(p_no text, p_pin text)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare c record; tok text;
begin
  if p_pin like 'tok:%' then return jsonb_build_object('ok', false, 'err', 'wrong'); end if;
  select * into c from public.pr_emp_check(p_no, p_pin);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  if c.must_change then return jsonb_build_object('ok', false, 'err', 'must_change'); end if;
  tok := encode(gen_random_bytes(32), 'hex');
  insert into public.pr_emp_sessions (token_hash, employee_id) values (encode(digest(tok, 'sha256'), 'hex'), c.emp_id);
  delete from public.pr_emp_sessions where employee_id = c.emp_id and token_hash not in
    (select token_hash from public.pr_emp_sessions where employee_id = c.emp_id order by last_used_at desc limit 5);   -- at most 5 devices
  return jsonb_build_object('ok', true, 'token', tok);
end $$;
revoke all on function public.pr_emp_token(text, text) from public;
grant execute on function public.pr_emp_token(text, text) to anon, authenticated;

create or replace function public.pr_emp_logout(p_no text, p_token text)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
begin
  delete from public.pr_emp_sessions s using public.pr_employees e
   where s.employee_id = e.id and e.emp_no = trim(p_no) and s.token_hash = encode(digest(regexp_replace(coalesce(p_token, ''), '^tok:', ''), 'sha256'), 'hex');
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.pr_emp_logout(text, text) from public;
grant execute on function public.pr_emp_logout(text, text) to anon, authenticated;

-- new PIN / admin PIN reset → every phone has to sign in again
create or replace function public.pr_emp_sessions_on_pin() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.pin_hash is distinct from old.pin_hash then delete from public.pr_emp_sessions where employee_id = new.id; end if;
  return new;
end $$;
drop trigger if exists pr_emp_sessions_on_pin on public.pr_employees;
create trigger pr_emp_sessions_on_pin after update of pin_hash on public.pr_employees for each row execute function public.pr_emp_sessions_on_pin();

-- changing the PIN needs the real old PIN, never a device token
create or replace function public.pr_emp_set_pin(p_no text, p_old text, p_new text)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $function$
declare c record;
begin
  if coalesce(p_old, '') like 'tok:%' then return jsonb_build_object('ok', false, 'err', 'wrong'); end if;
  if p_new !~ '^[0-9]{4,6}$' then return jsonb_build_object('ok', false, 'err', 'bad_pin'); end if;
  if p_new = '0000' or p_new = p_old then return jsonb_build_object('ok', false, 'err', 'same_pin'); end if;
  select * into c from public.pr_emp_check(p_no, p_old);
  if c.err is not null then return jsonb_build_object('ok', false, 'err', c.err); end if;
  update public.pr_employees set pin_hash = crypt(p_new, gen_salt('bf')) where id = c.emp_id;
  return jsonb_build_object('ok', true);
end $function$;
