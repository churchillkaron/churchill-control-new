alter table public.operational_settings
  alter column organization_id set not null;

create unique index if not exists operational_settings_organization_domain_uidx
  on public.operational_settings (organization_id, domain);
