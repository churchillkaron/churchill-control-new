begin;

create table if not exists public.creative_image_artboards (
  id uuid primary key,
  organization_id uuid not null,
  entity_id uuid,
  creative_project_id uuid not null references public.creative_projects(id) on delete cascade,
  name text not null,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  sort_order integer not null default 0,
  background jsonb not null default '{}'::jsonb,
  export_preset jsonb not null default '{}'::jsonb,
  status text not null default 'DRAFT',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creative_image_layers (
  id uuid primary key,
  organization_id uuid not null,
  creative_project_id uuid not null references public.creative_projects(id) on delete cascade,
  artboard_id uuid not null references public.creative_image_artboards(id) on delete cascade,
  parent_layer_id uuid references public.creative_image_layers(id) on delete cascade,
  source_asset_id uuid,
  layer_type text not null,
  name text not null,
  bounds jsonb not null default '{}'::jsonb,
  transform jsonb not null default '{}'::jsonb,
  style jsonb not null default '{}'::jsonb,
  content jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  visible boolean not null default true,
  locked boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creative_image_references (
  id uuid primary key,
  organization_id uuid not null,
  creative_project_id uuid not null references public.creative_projects(id) on delete cascade,
  asset_id uuid not null,
  reference_role text not null,
  strength numeric not null default 1 check (strength >= 0 and strength <= 1),
  locked boolean not null default false,
  notes text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.creative_image_comments (
  id uuid primary key,
  organization_id uuid not null,
  creative_project_id uuid not null references public.creative_projects(id) on delete cascade,
  artboard_id uuid references public.creative_image_artboards(id) on delete cascade,
  layer_id uuid references public.creative_image_layers(id) on delete cascade,
  position jsonb not null default '{}'::jsonb,
  body text not null,
  status text not null default 'OPEN',
  assigned_to uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.creative_image_versions (
  id uuid primary key,
  organization_id uuid not null,
  creative_project_id uuid not null references public.creative_projects(id) on delete cascade,
  artboard_id uuid not null references public.creative_image_artboards(id) on delete cascade,
  snapshot_asset_id uuid,
  based_on_version_id uuid references public.creative_image_versions(id),
  version_number integer not null check (version_number > 0),
  status text not null default 'WORKING',
  summary text not null default '',
  snapshot jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (artboard_id, version_number)
);

create table if not exists public.creative_image_exports (
  id uuid primary key,
  organization_id uuid not null,
  creative_project_id uuid not null references public.creative_projects(id) on delete cascade,
  artboard_id uuid not null references public.creative_image_artboards(id) on delete cascade,
  version_id uuid references public.creative_image_versions(id),
  asset_id uuid,
  export_type text not null,
  status text not null default 'PENDING',
  settings jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists creative_image_artboards_project_idx on public.creative_image_artboards (organization_id, creative_project_id, sort_order);
create index if not exists creative_image_layers_artboard_idx on public.creative_image_layers (organization_id, artboard_id, sort_order);
create index if not exists creative_image_references_project_idx on public.creative_image_references (organization_id, creative_project_id, reference_role);
create index if not exists creative_image_comments_project_idx on public.creative_image_comments (organization_id, creative_project_id, status, created_at desc);
create index if not exists creative_image_versions_artboard_idx on public.creative_image_versions (organization_id, artboard_id, version_number desc);
create index if not exists creative_image_exports_project_idx on public.creative_image_exports (organization_id, creative_project_id, created_at desc);

alter table public.creative_image_artboards enable row level security;
alter table public.creative_image_layers enable row level security;
alter table public.creative_image_references enable row level security;
alter table public.creative_image_comments enable row level security;
alter table public.creative_image_versions enable row level security;
alter table public.creative_image_exports enable row level security;

comment on table public.creative_image_artboards is 'Durable Image Studio artboards attached to canonical Creative projects.';
comment on table public.creative_image_layers is 'Editable deterministic Image Studio layers; generated pixels remain assets, exact copy and geometry remain structured.';
comment on table public.creative_image_references is 'Role-bound visual evidence used by prompt-free Image Studio planning and generation.';
comment on table public.creative_image_versions is 'Immutable artboard snapshots for compare, approval and repair lineage.';

commit;
