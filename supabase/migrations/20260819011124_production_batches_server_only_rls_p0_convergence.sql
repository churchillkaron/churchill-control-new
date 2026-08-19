-- P0 security convergence: production_batches is server-owned.
-- Organization access is enforced by the application boundary before
-- service-role/admin access reaches this table.

begin;

alter table public.production_batches enable row level security;

revoke all on table public.production_batches from public, anon, authenticated;

drop policy if exists production_batches_select on public.production_batches;

grant all on table public.production_batches to service_role;

commit;
