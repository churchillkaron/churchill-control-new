begin;

create table if not exists public.creative_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  creative_mission_id uuid,
  campaign_id uuid,
  production_type text not null default 'VIDEO',
  status text not null default 'DRAFT',
  name text not null,
  description text not null default '',
  objective text not null default '',
  target_channels jsonb not null default '[]'::jsonb,
  target_languages jsonb not null default '["en"]'::jsonb,
  target_duration integer not null default 30,
  quality_profile text not null default 'HIGH',
  budget_profile text not null default 'BALANCED',
  metadata jsonb not null default '{}'::jsonb,
  version_number integer not null default 1,
  version_parent_id uuid references public.creative_artifact_versions(id),
  revision_reason text,
  version_created_at timestamptz not null default now(),
  created_by text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creative_projects_production_type_check
    check (production_type in (
      'VIDEO',
      'IMAGE',
      'DOCUMENT',
      'MENU',
      'WEBSITE',
      'PRESENTATION',
      'AUDIO',
      'WEB_ASSET',
      'MULTIMEDIA'
    )),
  constraint creative_projects_status_check
    check (status in (
      'DRAFT',
      'RESEARCH',
      'DIRECTION',
      'PRODUCTION',
      'RENDERING',
      'QUALITY',
      'PUBLISHED',
      'ARCHIVED'
    )),
  constraint creative_projects_target_duration_check
    check (target_duration > 0)
);

create index if not exists creative_projects_organization_idx
  on public.creative_projects (
    organization_id,
    archived,
    created_at desc
  );

create index if not exists creative_projects_mission_idx
  on public.creative_projects (
    organization_id,
    creative_mission_id,
    created_at desc
  );

create index if not exists creative_projects_campaign_idx
  on public.creative_projects (
    organization_id,
    campaign_id,
    created_at desc
  );

alter table public.creative_projects enable row level security;

revoke all on table public.creative_projects
  from public, anon, authenticated;
grant select, insert, update, delete on table public.creative_projects
  to service_role;

select public.attach_creative_version_trigger('creative_projects', 'PROJECT');

commit;
