-- P0 security convergence: harden platform/internal tables that do not require
-- direct browser mutation. This migration deliberately starts with a small,
-- verified set so RLS can converge without breaking organization workflows.

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
