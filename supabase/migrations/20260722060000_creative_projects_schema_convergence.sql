begin;

alter table if exists public.creative_projects
  add column if not exists organization_id uuid,
  add column if not exists creative_mission_id uuid,
  add column if not exists campaign_id uuid,
  add column if not exists production_type text,
  add column if not exists status text,
  add column if not exists name text,
  add column if not exists description text,
  add column if not exists objective text,
  add column if not exists target_channels jsonb,
  add column if not exists target_languages jsonb,
  add column if not exists target_duration integer,
  add column if not exists quality_profile text,
  add column if not exists budget_profile text,
  add column if not exists metadata jsonb,
  add column if not exists version_number integer,
  add column if not exists version_parent_id uuid,
  add column if not exists revision_reason text,
  add column if not exists version_created_at timestamptz,
  add column if not exists created_by text,
  add column if not exists archived boolean,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

update public.creative_projects
set
  production_type = case
    when production_type in (
      'VIDEO',
      'IMAGE',
      'DOCUMENT',
      'MENU',
      'WEBSITE',
      'PRESENTATION',
      'AUDIO',
      'WEB_ASSET',
      'MULTIMEDIA'
    ) then production_type
    else 'VIDEO'
  end,
  status = case
    when status in (
      'DRAFT',
      'RESEARCH',
      'DIRECTION',
      'PRODUCTION',
      'RENDERING',
      'QUALITY',
      'PUBLISHED',
      'ARCHIVED'
    ) then status
    else 'DRAFT'
  end,
  name = coalesce(nullif(name, ''), 'Untitled Creative Project'),
  description = coalesce(description, ''),
  objective = coalesce(objective, ''),
  target_channels = coalesce(target_channels, '[]'::jsonb),
  target_languages = coalesce(target_languages, '["en"]'::jsonb),
  target_duration = case
    when target_duration is null or target_duration <= 0 then 30
    else target_duration
  end,
  quality_profile = coalesce(nullif(quality_profile, ''), 'HIGH'),
  budget_profile = coalesce(nullif(budget_profile, ''), 'BALANCED'),
  metadata = coalesce(metadata, '{}'::jsonb),
  version_number = case
    when version_number is null or version_number <= 0 then 1
    else version_number
  end,
  version_created_at = coalesce(version_created_at, created_at, now()),
  archived = coalesce(archived, false),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, created_at, now());

alter table public.creative_projects
  alter column production_type set default 'VIDEO',
  alter column status set default 'DRAFT',
  alter column description set default '',
  alter column objective set default '',
  alter column target_channels set default '[]'::jsonb,
  alter column target_languages set default '["en"]'::jsonb,
  alter column target_duration set default 30,
  alter column quality_profile set default 'HIGH',
  alter column budget_profile set default 'BALANCED',
  alter column metadata set default '{}'::jsonb,
  alter column version_number set default 1,
  alter column version_created_at set default now(),
  alter column archived set default false,
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table public.creative_projects
  alter column production_type set not null,
  alter column status set not null,
  alter column name set not null,
  alter column description set not null,
  alter column objective set not null,
  alter column target_channels set not null,
  alter column target_languages set not null,
  alter column target_duration set not null,
  alter column quality_profile set not null,
  alter column budget_profile set not null,
  alter column metadata set not null,
  alter column version_number set not null,
  alter column version_created_at set not null,
  alter column archived set not null,
  alter column created_at set not null,
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'creative_projects_version_parent_fkey'
      and conrelid = 'public.creative_projects'::regclass
  ) then
    alter table public.creative_projects
      add constraint creative_projects_version_parent_fkey
      foreign key (version_parent_id)
      references public.creative_artifact_versions(id);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'creative_projects_production_type_check'
      and conrelid = 'public.creative_projects'::regclass
  ) then
    alter table public.creative_projects
      add constraint creative_projects_production_type_check
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
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'creative_projects_status_check'
      and conrelid = 'public.creative_projects'::regclass
  ) then
    alter table public.creative_projects
      add constraint creative_projects_status_check
      check (status in (
        'DRAFT',
        'RESEARCH',
        'DIRECTION',
        'PRODUCTION',
        'RENDERING',
        'QUALITY',
        'PUBLISHED',
        'ARCHIVED'
      ));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'creative_projects_target_duration_check'
      and conrelid = 'public.creative_projects'::regclass
  ) then
    alter table public.creative_projects
      add constraint creative_projects_target_duration_check
      check (target_duration > 0);
  end if;
end;
$$;

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

drop trigger if exists capture_creative_projects_version
  on public.creative_projects;
create trigger capture_creative_projects_version
before update or delete on public.creative_projects
for each row
execute function public.capture_creative_artifact_version('PROJECT');

notify pgrst, 'reload schema';

commit;
