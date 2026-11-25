-- ⚠️ Applied to the ORDER project (PALTONG ORDER/RIDER, yzdhcumibflxtqkqvbul), not to MONEY TRACKER.
-- Kept here because only the payroll app calls it (pr_busy_spans in pr_breaks.sql). Owner 2026-11-26.
-- "Customers / work in the store" spans:
--   table  = dine-in table (source 'dine', T…): opened (created_at) → paid (received_at). Still open → end null. Max 6 h.
--   order  = delivery / pickup order being made: confirmed (scheduled → 45 min before) → picked up / paid / done. Max 2 h.
-- Cancelled are left out. Same shared secret as rider_jobs_ext (vault 'rider_duty_secret' on the payroll side).
-- (old dine_tables_ext from the first draft is unused; safe to drop later)
create or replace function public.busy_spans_ext(p_secret text, p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  if encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex') <> 'fa5b77c5aadc78b0d4e7428a31c4ac8c87a38c7578bf5e1910af6fbea30371dd' then
    raise exception 'forbidden';
  end if;
  return jsonb_build_object('ok', true, 'spans', coalesce((
    select jsonb_agg(jsonb_build_object('kind', kind, 'no', no, 'start', s, 'end', e) order by s) from (
      select case when o.source = 'dine' then 'table' else 'order' end kind,
             coalesce(o.order_prefix, '') || o.order_no no, z.s,
             case when z.e is not null then least(z.e, z.s + case when o.source = 'dine' then interval '6 hours' else interval '2 hours' end) end e
        from public.orders o
        cross join lateral (select
            case when o.source <> 'dine' and o.scheduled_at is not null then o.scheduled_at - interval '45 minutes' else coalesce(o.confirmed_at, o.created_at) end s,
            case when o.source = 'dine' then coalesce(o.received_at, case when o.status = 'done' then o.updated_at end)
                 else coalesce(o.picked_up_at, case when o.order_type = 'pickup' then o.received_at end, case when o.status = 'done' then o.updated_at end) end e) z
       where coalesce(o.status, '') not in ('cancelled', 'canceled', 'rejected')
         and z.s < p_to and coalesce(z.e, 'infinity'::timestamptz) > p_from and z.s > p_from - interval '1 day') q), '[]'::jsonb));
end $$;
revoke all on function public.busy_spans_ext(text, timestamptz, timestamptz) from public;
grant execute on function public.busy_spans_ext(text, timestamptz, timestamptz) to anon, authenticated;
