begin;

alter table if exists public.creative_projects
  add column if not exists organization_id uuid,
  add column if not exists version integer default 1,
  add column if not exists status text default 'DRAFT',
  add column if not exists name text,
  add column if not exists description text default '',
  add column if not exists objective text default '',
  add column if not exists target_channels jsonb default '[]'::jsonb,
  add column if not exists target_languages jsonb default '[]'::jsonb,
  add column if not exists metadata jsonb default '{}'::jsonb,
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

    drop index if exists public.creative_project_state_mission_uidx;

    create unique index creative_project_state_mission_uidx
      on public.creative_project_state (creative_mission_id)
      where creative_mission_id is not null;

    comment on index public.creative_project_state_mission_uidx is
      'One durable pipeline-state row per Creative mission.';
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
    'archived_by_migration', '20260726093000'
  ),
  updated_at = now()
from ranked
where project.id = ranked.id
  and ranked.row_number > 1;

drop index if exists public.creative_projects_mission_active_uidx;

create unique index creative_projects_mission_active_uidx
  on public.creative_projects (organization_id, creative_mission_id)
  where creative_mission_id is not null and archived = false;

alter table public.creative_projects
  alter column version set default 1,
  alter column status set default 'DRAFT',
  alter column description set default '',
  alter column objective set default '',
  alter column target_channels set default '[]'::jsonb,
  alter column target_languages set default '[]'::jsonb,
  alter column metadata set default '{}'::jsonb,
  alter column archived set default false,
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table public.creative_projects
  alter column version set not null,
  alter column status set not null,
  alter column name set not null,
  alter column description set not null,
  alter column objective set not null,
  alter column target_channels set not null,
  alter column target_languages set not null,
  alter column metadata set not null,
  alter column archived set not null,
  alter column created_at set not null,
  alter column updated_at set not null;

comment on index public.creative_projects_mission_active_uidx is
  'One active Creative project per organization and mission; duplicates are archived before enforcement.';

commit;
