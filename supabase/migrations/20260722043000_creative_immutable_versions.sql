begin;

create table if not exists public.creative_artifact_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  creative_project_id uuid,
  creative_mission_id uuid,
  artifact_type text not null,
  artifact_id uuid not null,
  version_number integer not null,
  parent_version_id uuid references public.creative_artifact_versions(id),
  change_type text not null default 'UPDATE',
  reason text,
  payload jsonb not null,
  payload_hash text not null,
  created_by text,
  created_at timestamptz not null default now(),
  constraint creative_artifact_versions_change_type_check
    check (change_type in ('UPDATE', 'DELETE', 'RESTORE', 'FORK', 'SNAPSHOT')),
  constraint creative_artifact_versions_identity_unique
    unique (artifact_type, artifact_id, version_number)
);

create index if not exists creative_artifact_versions_scope_idx
  on public.creative_artifact_versions (
    organization_id,
    creative_project_id,
    artifact_type,
    artifact_id,
    version_number desc
  );

create index if not exists creative_artifact_versions_created_idx
  on public.creative_artifact_versions (created_at desc);

alter table public.creative_artifact_versions enable row level security;

alter table if exists public.creative_strategies
  add column if not exists version_number integer not null default 1,
  add column if not exists version_parent_id uuid references public.creative_artifact_versions(id),
  add column if not exists revision_reason text,
  add column if not exists version_created_at timestamptz not null default now();

alter table if exists public.creative_concepts
  add column if not exists version_number integer not null default 1,
  add column if not exists version_parent_id uuid references public.creative_artifact_versions(id),
  add column if not exists revision_reason text,
  add column if not exists version_created_at timestamptz not null default now();

alter table if exists public.creative_storyboards
  add column if not exists version_number integer not null default 1,
  add column if not exists version_parent_id uuid references public.creative_artifact_versions(id),
  add column if not exists revision_reason text,
  add column if not exists version_created_at timestamptz not null default now();

alter table if exists public.creative_scenes
  add column if not exists version_number integer not null default 1,
  add column if not exists version_parent_id uuid references public.creative_artifact_versions(id),
  add column if not exists revision_reason text,
  add column if not exists version_created_at timestamptz not null default now();

alter table if exists public.creative_shots
  add column if not exists version_number integer not null default 1,
  add column if not exists version_parent_id uuid references public.creative_artifact_versions(id),
  add column if not exists revision_reason text,
  add column if not exists version_created_at timestamptz not null default now();

alter table if exists public.creative_production_graphs
  add column if not exists version_number integer not null default 1,
  add column if not exists version_parent_id uuid references public.creative_artifact_versions(id),
  add column if not exists revision_reason text,
  add column if not exists version_created_at timestamptz not null default now();

alter table if exists public.creative_asset_nodes
  add column if not exists version_number integer not null default 1,
  add column if not exists version_parent_id uuid references public.creative_artifact_versions(id),
  add column if not exists revision_reason text,
  add column if not exists version_created_at timestamptz not null default now();

create or replace function public.capture_creative_artifact_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  artifact_kind text := tg_argv[0];
  old_payload jsonb := to_jsonb(old);
  snapshot_id uuid;
  old_version integer := coalesce((old_payload ->> 'version_number')::integer, 1);
  change_reason text := coalesce(
    case when tg_op = 'UPDATE' then to_jsonb(new) ->> 'revision_reason' else null end,
    old_payload ->> 'revision_reason',
    tg_op
  );
begin
  insert into public.creative_artifact_versions (
    organization_id,
    creative_project_id,
    creative_mission_id,
    artifact_type,
    artifact_id,
    version_number,
    parent_version_id,
    change_type,
    reason,
    payload,
    payload_hash,
    created_by
  ) values (
    (old_payload ->> 'organization_id')::uuid,
    nullif(old_payload ->> 'creative_project_id', '')::uuid,
    nullif(old_payload ->> 'creative_mission_id', '')::uuid,
    artifact_kind,
    (old_payload ->> 'id')::uuid,
    old_version,
    nullif(old_payload ->> 'version_parent_id', '')::uuid,
    case when tg_op = 'DELETE' then 'DELETE' else 'UPDATE' end,
    change_reason,
    old_payload,
    md5(old_payload::text),
    old_payload ->> 'created_by'
  )
  on conflict (artifact_type, artifact_id, version_number)
  do update set
    reason = excluded.reason,
    payload = excluded.payload,
    payload_hash = excluded.payload_hash
  returning id into snapshot_id;

  if tg_op = 'DELETE' then
    return old;
  end if;

  new.version_number := old_version + 1;
  new.version_parent_id := snapshot_id;
  new.version_created_at := now();
  new.revision_reason := change_reason;
  return new;
end;
$$;

revoke all on function public.capture_creative_artifact_version()
  from public, anon, authenticated;
grant execute on function public.capture_creative_artifact_version()
  to service_role;

create or replace function public.attach_creative_version_trigger(
  table_name text,
  artifact_kind text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regclass(format('public.%I', table_name)) is null then
    return;
  end if;

  execute format(
    'drop trigger if exists %I on public.%I',
    'capture_' || table_name || '_version',
    table_name
  );

  execute format(
    'create trigger %I before update or delete on public.%I for each row execute function public.capture_creative_artifact_version(%L)',
    'capture_' || table_name || '_version',
    table_name,
    artifact_kind
  );
end;
$$;

select public.attach_creative_version_trigger('creative_strategies', 'STRATEGY');
select public.attach_creative_version_trigger('creative_concepts', 'CONCEPT');
select public.attach_creative_version_trigger('creative_storyboards', 'STORYBOARD');
select public.attach_creative_version_trigger('creative_scenes', 'SCENE');
select public.attach_creative_version_trigger('creative_shots', 'SHOT');
select public.attach_creative_version_trigger('creative_production_graphs', 'PRODUCTION_GRAPH');
select public.attach_creative_version_trigger('creative_asset_nodes', 'ASSET');

drop function if exists public.attach_creative_version_trigger(text, text);

commit;
