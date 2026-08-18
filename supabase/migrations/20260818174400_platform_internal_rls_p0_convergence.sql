-- P0 security convergence from current main.
--
-- This slice is intentionally limited to platform/internal tables whose active
-- application access is server/service-role owned, plus the read-only platform
-- module catalog and authorization helper execute grants.
--
-- No organization business tables are included here. Those remain a separate
-- bounded migration after their browser access paths are verified.

begin;

-- Internal server-owned tables ------------------------------------------------
alter table public.runtime_heartbeat enable row level security;
revoke all on table public.runtime_heartbeat from anon, authenticated;

alter table public.governance_audit enable row level security;
revoke all on table public.governance_audit from anon, authenticated;

alter table public.provider_pricing enable row level security;
revoke all on table public.provider_pricing from anon, authenticated;

alter table public.distributed_jobs enable row level security;
revoke all on table public.distributed_jobs from anon, authenticated;

alter table public.event_bus enable row level security;
revoke all on table public.event_bus from anon, authenticated;

alter table public.kernel_snapshots enable row level security;
revoke all on table public.kernel_snapshots from anon, authenticated;

alter table public.trust_traceability enable row level security;
revoke all on table public.trust_traceability from anon, authenticated;

-- Platform module catalog -----------------------------------------------------
-- The catalog remains readable by browser roles for workspace discovery, while
-- all browser mutation privileges are removed.
alter table public.platform_modules enable row level security;
revoke insert, update, delete, truncate, references, trigger
  on table public.platform_modules
  from anon, authenticated;
grant select on table public.platform_modules to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'platform_modules'
      and cmd = 'SELECT'
  ) then
    create policy platform_modules_public_read
      on public.platform_modules
      for select
      to public
      using (true);
  end if;
end
$$;

-- Authorization helper execution ---------------------------------------------
-- Both helpers are SECURITY DEFINER and evaluate auth.uid(). They are policy
-- primitives for authenticated organization access and must not be callable by
-- anonymous/public database roles.
revoke execute on function public.same_organization(uuid) from public, anon;
revoke execute on function public.can_manage_organization(uuid) from public, anon;

grant execute on function public.same_organization(uuid) to authenticated, service_role;
grant execute on function public.can_manage_organization(uuid) to authenticated, service_role;

commit;
