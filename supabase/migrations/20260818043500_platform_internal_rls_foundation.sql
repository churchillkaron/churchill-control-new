-- P0 security convergence: harden platform/internal tables that do not require
-- direct browser mutation. This migration deliberately starts with a verified
-- server-owned set so RLS can converge without breaking organization workflows.

begin;

-- Internal worker heartbeat: server/service-role only.
alter table public.runtime_heartbeat enable row level security;
revoke all on table public.runtime_heartbeat from anon, authenticated;

-- Legacy governance audit store: no active browser/runtime consumer.
alter table public.governance_audit enable row level security;
revoke all on table public.governance_audit from anon, authenticated;

-- Provider commercial pricing is resolved only through the Service Domain
-- repository using the shared admin client. Pricing must never be directly
-- writable/readable through the public API roles.
alter table public.provider_pricing enable row level security;
revoke all on table public.provider_pricing from anon, authenticated;

-- Distributed runtime jobs are inspected and mutated by server infrastructure
-- through the shared admin client, never directly by a browser session.
alter table public.distributed_jobs enable row level security;
revoke all on table public.distributed_jobs from anon, authenticated;

-- Canonical provider/business event bus is persisted and projected by server
-- runtimes and authenticated API routes through the shared admin client.
alter table public.event_bus enable row level security;
revoke all on table public.event_bus from anon, authenticated;

-- Kernel snapshots have no active browser consumer and are platform-internal.
alter table public.kernel_snapshots enable row level security;
revoke all on table public.kernel_snapshots from anon, authenticated;

-- Legacy trust traceability is retained only as platform/legacy evidence; no
-- active browser consumer exists in the current application tree.
alter table public.trust_traceability enable row level security;
revoke all on table public.trust_traceability from anon, authenticated;

-- Platform module catalog is intentionally client-readable for workspace/nav
-- discovery, but must not be publicly mutable.
alter table public.platform_modules enable row level security;
revoke insert, update, delete, truncate, references, trigger
  on table public.platform_modules
  from anon, authenticated;
grant select on table public.platform_modules to anon, authenticated;

-- Preserve the existing public read policy if present; create it only when the
-- catalog has no SELECT policy. The policy is safe because this table contains
-- platform catalog metadata, not organization/customer records.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'platform_modules'
      and cmd = 'SELECT'
  ) then
    create policy "platform_modules_public_read"
      on public.platform_modules
      for select
      to public
      using (true);
  end if;
end
$$;

commit;
