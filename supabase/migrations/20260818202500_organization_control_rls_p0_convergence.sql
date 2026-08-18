-- P0 security convergence: organization control-plane tables.
-- Browser context is read-only and membership-scoped. Organization creation,
-- configuration writes, template installation, and session mutation remain
-- server-owned through the shared admin/service-role clients.

begin;

-- Organizations ------------------------------------------------------------
alter table public.organizations enable row level security;

revoke all on table public.organizations from anon, authenticated;
grant select on table public.organizations to authenticated;

drop policy if exists organizations_member_read on public.organizations;

create policy organizations_member_read
  on public.organizations
  for select
  to authenticated
  using (public.same_organization(id));

-- Organization modules -----------------------------------------------------
alter table public.organization_modules enable row level security;

revoke all on table public.organization_modules from anon, authenticated;
grant select on table public.organization_modules to authenticated;

drop policy if exists "Allow workspace read" on public.organization_modules;
drop policy if exists organization_modules_member_read on public.organization_modules;

create policy organization_modules_member_read
  on public.organization_modules
  for select
  to authenticated
  using (public.same_organization(organization_id));

-- Organization industries --------------------------------------------------
alter table public.organization_industries enable row level security;

revoke all on table public.organization_industries from anon, authenticated;
grant select on table public.organization_industries to authenticated;

drop policy if exists organization_industries_member_read on public.organization_industries;

create policy organization_industries_member_read
  on public.organization_industries
  for select
  to authenticated
  using (public.same_organization(organization_id));

commit;
