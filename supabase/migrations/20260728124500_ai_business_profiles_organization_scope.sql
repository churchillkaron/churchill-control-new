begin;

alter table if exists public.ai_business_profiles
  add column if not exists organization_id uuid;

do $migration$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ai_business_profiles'
      and column_name = 'tenant_id'
  ) then
    execute $sql$
      update public.ai_business_profiles profile
      set organization_id = organization.id
      from public.organizations organization
      where profile.organization_id is null
        and profile.tenant_id is not null
        and organization.id::text = profile.tenant_id::text
    $sql$;
  end if;
end
$migration$;

do $migration$
begin
  if exists (
    select 1
    from public.ai_business_profiles
    where organization_id is null
  ) then
    raise exception
      'ai_business_profiles contains rows without organization_id';
  end if;
end
$migration$;

alter table if exists public.ai_business_profiles
  alter column organization_id set not null;

create unique index if not exists
  ai_business_profiles_organization_id_uidx
  on public.ai_business_profiles (organization_id);

alter table if exists public.ai_business_profiles
  drop column if exists tenant_id;

commit;
