begin;

create table if not exists public.creative_business_truth_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid,
  period_id uuid,
  creative_mission_id uuid,
  creative_project_id uuid,
  schema_version text not null default 'creative-business-truth-v1',
  source_manifest jsonb not null default '[]'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  payload_hash text not null,
  record_counts jsonb not null default '{}'::jsonb,
  captured_by text,
  captured_at timestamptz not null default now(),
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists creative_business_truth_snapshot_hash_unique
  on public.creative_business_truth_snapshots (
    organization_id,
    payload_hash,
    coalesce(creative_mission_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(creative_project_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists creative_business_truth_snapshot_scope_idx
  on public.creative_business_truth_snapshots (
    organization_id,
    creative_mission_id,
    creative_project_id,
    captured_at desc
  );

alter table public.creative_business_truth_snapshots enable row level security;

revoke all on table public.creative_business_truth_snapshots
  from public, anon, authenticated;
grant select, insert, update on table public.creative_business_truth_snapshots
  to service_role;

commit;
