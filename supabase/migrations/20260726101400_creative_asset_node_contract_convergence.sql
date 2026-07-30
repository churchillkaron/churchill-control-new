begin;

-- creative_asset_nodes is the canonical persistence table used by
-- CreativeAssetGraphRepository and the release/publication runtimes. Some
-- production environments never received its retired base migration, so
-- establish the minimum document identity and scope contract before applying
-- the lifecycle and evidence convergence below.

create table if not exists public.creative_asset_nodes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  creative_project_id uuid,
  type text not null default 'ASSET',
  created_at timestamptz not null default now()
);

-- The Creative asset graph document has evolved beyond the original table.
-- Converge older deployments before publication idempotency relies on the
-- lifecycle status and structured evidence columns.

alter table public.creative_asset_nodes
  add column if not exists status text,
  add column if not exists name text,
  add column if not exists description text,
  add column if not exists url text,
  add column if not exists storage_path text,
  add column if not exists lineage jsonb,
  add column if not exists technical jsonb,
  add column if not exists intelligence jsonb,
  add column if not exists cost jsonb,
  add column if not exists reuse jsonb,
  add column if not exists review jsonb,
  add column if not exists metadata jsonb,
  add column if not exists created_by uuid,
  add column if not exists updated_at timestamptz;

update public.creative_asset_nodes
set
  status = coalesce(nullif(btrim(status), ''), 'IMPORTED'),
  name = coalesce(name, ''),
  description = coalesce(description, ''),
  lineage = coalesce(lineage, '{}'::jsonb),
  technical = coalesce(technical, '{}'::jsonb),
  intelligence = coalesce(intelligence, '{}'::jsonb),
  cost = coalesce(cost, '{}'::jsonb),
  reuse = coalesce(reuse, '{}'::jsonb),
  review = coalesce(review, '{}'::jsonb),
  metadata = coalesce(metadata, '{}'::jsonb),
  updated_at = coalesce(updated_at, created_at, now());

alter table public.creative_asset_nodes
  alter column status set default 'IMPORTED',
  alter column status set not null,
  alter column name set default '',
  alter column name set not null,
  alter column description set default '',
  alter column description set not null,
  alter column lineage set default '{}'::jsonb,
  alter column lineage set not null,
  alter column technical set default '{}'::jsonb,
  alter column technical set not null,
  alter column intelligence set default '{}'::jsonb,
  alter column intelligence set not null,
  alter column cost set default '{}'::jsonb,
  alter column cost set not null,
  alter column reuse set default '{}'::jsonb,
  alter column reuse set not null,
  alter column review set default '{}'::jsonb,
  alter column review set not null,
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

create index if not exists creative_asset_nodes_project_created_idx
  on public.creative_asset_nodes (
    organization_id,
    creative_project_id,
    created_at desc
  );

create index if not exists creative_asset_nodes_project_type_status_idx
  on public.creative_asset_nodes (
    organization_id,
    creative_project_id,
    type,
    status,
    created_at desc
  );

alter table public.creative_asset_nodes enable row level security;

grant select, insert, update, delete
  on table public.creative_asset_nodes
  to service_role;

comment on column public.creative_asset_nodes.status is
  'Lifecycle state for an immutable Creative asset-graph node. ARCHIVED removes a node from active identity resolution while preserving history.';

comment on column public.creative_asset_nodes.lineage is
  'Source, provider, capability, generation-version and upstream provenance evidence.';

comment on column public.creative_asset_nodes.technical is
  'Technical media or artifact evidence such as MIME type, dimensions, duration and checksum.';

comment on column public.creative_asset_nodes.intelligence is
  'Evidence-backed semantic analysis, quality signals, tags and detected subjects.';

comment on column public.creative_asset_nodes.metadata is
  'Node-type-specific immutable execution, approval, release and publication evidence.';

notify pgrst, 'reload schema';

commit;
