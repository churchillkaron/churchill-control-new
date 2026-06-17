create table if not exists organization_workspace_settings (

  id uuid primary key
    default gen_random_uuid(),

  organization_id uuid not null
    references organizations(id)
    on delete cascade,

  metric_cards jsonb
    default '[]'::jsonb,

  alerts jsonb
    default '[]'::jsonb,

  favorite_modules jsonb
    default '[]'::jsonb,

  layout jsonb
    default '{}'::jsonb,

  created_at timestamptz
    default now(),

  updated_at timestamptz
    default now(),

  unique (organization_id)

);

create index if not exists
idx_organization_workspace_settings_org
on organization_workspace_settings(
  organization_id
);
