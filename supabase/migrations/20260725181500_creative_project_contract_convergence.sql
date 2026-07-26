begin;

create table if not exists public.creative_projects (
  id uuid primary key,
  organization_id uuid not null,
  version integer not null default 1,
  production_type text,
  status text not null default 'DRAFT',
  name text not null,
  description text not null default '',
  objective text not null default '',
  campaign_id uuid,
  creative_mission_id uuid,
  brand_id uuid,
  target_channels jsonb not null default '[]'::jsonb,
  target_languages jsonb not null default '[]'::jsonb,
  target_duration numeric,
  quality_profile jsonb,
  budget_profile jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.creative_projects
  add column if not exists organization_id uuid,
  add column if not exists version integer default 1,
  add column if not exists production_type text,
  add column if not exists status text default 'DRAFT',
  add column if not exists name text,
  add column if not exists description text default '',
  add column if not exists objective text default '',
  add column if not exists campaign_id uuid,
  add column if not exists creative_mission_id uuid,
  add column if not exists brand_id uuid,
  add column if not exists target_channels jsonb default '[]'::jsonb,
  add column if not exists target_languages jsonb default '[]'::jsonb,
  add column if not exists target_duration numeric,
  add column if not exists quality_profile jsonb,
  add column if not exists budget_profile jsonb,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists archived boolean default false,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.creative_projects
set
  version = coalesce(version, 1),
  status = coalesce(nullif(status, ''), 'DRAFT'),
  name = coalesce(nullif(name, ''), 'Creative project'),
  description = coalesce(description, ''),
  objective = coalesce(objective, ''),
  target_channels = coalesce(target_channels, '[]'::jsonb),
  target_languages = coalesce(target_languages, '[]'::jsonb),
  metadata = coalesce(metadata, '{}'::jsonb),
  archived = coalesce(archived, false),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

create index if not exists creative_projects_organization_idx
  on public.creative_projects (organization_id, created_at desc);

create index if not exists creative_projects_mission_idx
  on public.creative_projects (organization_id, creative_mission_id)
  where creative_mission_id is not null;

alter table public.creative_projects enable row level security;

alter table if exists public.creative_project_state
  add column if not exists creative_project_id uuid;

do $$
begin
  if to_regclass('public.creative_project_state') is not null then
    with ranked as (
      select
        ctid,
        row_number() over (
          partition by creative_mission_id
          order by
            coalesce(to_jsonb(state_row) ->> 'updated_at', '') desc,
            coalesce(to_jsonb(state_row) ->> 'created_at', '') desc,
            coalesce(to_jsonb(state_row) ->> 'id', '') desc,
            ctid desc
        ) as row_number
      from public.creative_project_state state_row
      where creative_mission_id is not null
    )
    delete from public.creative_project_state target
    using ranked
    where target.ctid = ranked.ctid
      and ranked.row_number > 1;

    create unique index if not exists creative_project_state_mission_uidx
      on public.creative_project_state (creative_mission_id)
      where creative_mission_id is not null;
  end if;
end
$$;

do $$
declare
  uuid_pattern constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';
begin
  if to_regclass('public.creative_project_state') is not null then
    insert into public.creative_projects (
      id,
      organization_id,
      version,
      production_type,
      status,
      name,
      description,
      objective,
      campaign_id,
      creative_mission_id,
      brand_id,
      target_channels,
      target_languages,
      target_duration,
      quality_profile,
      budget_profile,
      metadata,
      created_by,
      archived,
      created_at,
      updated_at
    )
    select
      (row_data ->> 'id')::uuid,
      (row_data ->> 'organization_id')::uuid,
      case
        when coalesce(row_data ->> 'version', '') ~ '^[0-9]+$'
          then (row_data ->> 'version')::integer
        else 1
      end,
      nullif(row_data ->> 'production_type', ''),
      coalesce(nullif(row_data ->> 'status', ''), 'DRAFT'),
      coalesce(nullif(row_data ->> 'name', ''), nullif(row_data ->> 'title', ''), 'Creative project'),
      coalesce(row_data ->> 'description', ''),
      coalesce(row_data ->> 'objective', ''),
      case when coalesce(row_data ->> 'campaign_id', '') ~ uuid_pattern then (row_data ->> 'campaign_id')::uuid end,
      case when coalesce(row_data ->> 'creative_mission_id', '') ~ uuid_pattern then (row_data ->> 'creative_mission_id')::uuid end,
      case when coalesce(row_data ->> 'brand_id', '') ~ uuid_pattern then (row_data ->> 'brand_id')::uuid end,
      coalesce(row_data -> 'target_channels', '[]'::jsonb),
      coalesce(row_data -> 'target_languages', '[]'::jsonb),
      case
        when coalesce(row_data ->> 'target_duration', '') ~ '^[0-9]+([.][0-9]+)?$'
          then (row_data ->> 'target_duration')::numeric
      end,
      row_data -> 'quality_profile',
      row_data -> 'budget_profile',
      coalesce(row_data -> 'metadata', '{}'::jsonb),
      case when coalesce(row_data ->> 'created_by', '') ~ uuid_pattern then (row_data ->> 'created_by')::uuid end,
      case lower(trim(coalesce(row_data ->> 'archived', '')))
        when 'true' then true
        when 't' then true
        when '1' then true
        when 'yes' then true
        when 'y' then true
        when 'on' then true
        when 'false' then false
        when 'f' then false
        when '0' then false
        when 'no' then false
        when 'n' then false
        when 'off' then false
        else false
      end,
      now(),
      now()
    from (
      select to_jsonb(project_state) as row_data
      from public.creative_project_state project_state
    ) source_rows
    where coalesce(row_data ->> 'id', '') ~ uuid_pattern
      and coalesce(row_data ->> 'organization_id', '') ~ uuid_pattern
      and (
        nullif(row_data ->> 'name', '') is not null
        or nullif(row_data ->> 'production_type', '') is not null
        or nullif(row_data ->> 'objective', '') is not null
      )
    on conflict (id) do update set
      organization_id = excluded.organization_id,
      version = excluded.version,
      production_type = excluded.production_type,
      status = excluded.status,
      name = excluded.name,
      description = excluded.description,
      objective = excluded.objective,
      campaign_id = excluded.campaign_id,
      creative_mission_id = excluded.creative_mission_id,
      brand_id = excluded.brand_id,
      target_channels = excluded.target_channels,
      target_languages = excluded.target_languages,
      target_duration = excluded.target_duration,
      quality_profile = excluded.quality_profile,
      budget_profile = excluded.budget_profile,
      metadata = excluded.metadata,
      created_by = excluded.created_by,
      archived = excluded.archived,
      updated_at = now();
  end if;
end
$$;

with ranked as (
  select
    id,
    row_number() over (
      partition by organization_id, creative_mission_id
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as row_number
  from public.creative_projects
  where creative_mission_id is not null
    and archived = false
)
update public.creative_projects project
set
  archived = true,
  status = 'ARCHIVED',
  metadata = coalesce(project.metadata, '{}'::jsonb) || jsonb_build_object(
    'archived_reason', 'duplicate_active_mission_project',
    'archived_by_migration', '20260725181500'
  ),
  updated_at = now()
from ranked
where project.id = ranked.id
  and ranked.row_number > 1;

create unique index if not exists creative_projects_mission_active_uidx
  on public.creative_projects (organization_id, creative_mission_id)
  where creative_mission_id is not null and archived = false;

comment on table public.creative_projects is
  'Canonical Creative Studio project documents. Pipeline state remains in creative_project_state.';

commit;
