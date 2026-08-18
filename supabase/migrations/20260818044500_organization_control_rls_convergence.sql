-- P0 security convergence: organization control-plane authorization.
-- Organization creation stays server/admin owned. Authenticated members may
-- read organizations they belong to; organization managers control module and
-- industry configuration for their own organization only.

begin;

-- Organizations ------------------------------------------------------------
alter table public.organizations enable row level security;

revoke all on table public.organizations from anon;
revoke insert, truncate, references, trigger on table public.organizations from authenticated;
grant select, update, delete on table public.organizations to authenticated;

drop policy if exists organizations_member_read on public.organizations;
drop policy if exists organizations_manager_update on public.organizations;
drop policy if exists organizations_manager_delete on public.organizations;

create policy organizations_member_read
  on public.organizations
  for select
  to authenticated
  using (public.same_organization(id));

create policy organizations_manager_update
  on public.organizations
  for update
  to authenticated
  using (public.can_manage_organization(id))
  with check (public.can_manage_organization(id));

create policy organizations_manager_delete
  on public.organizations
  for delete
  to authenticated
  using (public.can_manage_organization(id));

-- Organization modules -----------------------------------------------------
alter table public.organization_modules enable row level security;

revoke all on table public.organization_modules from anon;
revoke truncate, references, trigger on table public.organization_modules from authenticated;
grant select, insert, update, delete on table public.organization_modules to authenticated;

drop policy if exists "Allow workspace read" on public.organization_modules;
drop policy if exists organization_modules_member_read on public.organization_modules;
drop policy if exists organization_modules_manager_insert on public.organization_modules;
drop policy if exists organization_modules_manager_update on public.organization_modules;
drop policy if exists organization_modules_manager_delete on public.organization_modules;

create policy organization_modules_member_read
  on public.organization_modules
  for select
  to authenticated
  using (public.same_organization(organization_id));

create policy organization_modules_manager_insert
  on public.organization_modules
  for insert
  to authenticated
  with check (public.can_manage_organization(organization_id));

create policy organization_modules_manager_update
  on public.organization_modules
  for update
  to authenticated
  using (public.can_manage_organization(organization_id))
  with check (public.can_manage_organization(organization_id));

create policy organization_modules_manager_delete
  on public.organization_modules
  for delete
  to authenticated
  using (public.can_manage_organization(organization_id));

-- Organization industries --------------------------------------------------
alter table public.organization_industries enable row level security;

revoke all on table public.organization_industries from anon;
revoke truncate, references, trigger on table public.organization_industries from authenticated;
grant select, insert, update, delete on table public.organization_industries to authenticated;

drop policy if exists organization_industries_member_read on public.organization_industries;
drop policy if exists organization_industries_manager_insert on public.organization_industries;
drop policy if exists organization_industries_manager_update on public.organization_industries;
drop policy if exists organization_industries_manager_delete on public.organization_industries;

create policy organization_industries_member_read
  on public.organization_industries
  for select
  to authenticated
  using (public.same_organization(organization_id));

create policy organization_industries_manager_insert
  on public.organization_industries
  for insert
  to authenticated
  with check (public.can_manage_organization(organization_id));

create policy organization_industries_manager_update
  on public.organization_industries
  for update
  to authenticated
  using (public.can_manage_organization(organization_id))
  with check (public.can_manage_organization(organization_id));

create policy organization_industries_manager_delete
  on public.organization_industries
  for delete
  to authenticated
  using (public.can_manage_organization(organization_id));

commit;
