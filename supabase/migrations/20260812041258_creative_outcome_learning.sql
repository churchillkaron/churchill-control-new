create table if not exists public.creative_outcome_observations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid,
  brand_id uuid,
  creative_mission_id uuid,
  creative_project_id uuid,
  campaign_id uuid,
  publish_execution_asset_node_id uuid not null references public.creative_asset_nodes(id),
  publish_command_asset_node_id uuid references public.creative_asset_nodes(id),
  release_readiness_asset_node_id uuid references public.creative_asset_nodes(id),
  final_render_asset_node_id uuid references public.creative_asset_nodes(id),
  channel text not null,
  source_provider text,
  external_publication_id text,
  external_publication_url text,
  source_event_id text,
  measurement_window text not null default 'LATEST_SNAPSHOT',
  metrics jsonb not null default '{}'::jsonb,
  normalized_metrics jsonb not null default '{}'::jsonb,
  creative_context jsonb not null default '{}'::jsonb,
  quality_evidence jsonb not null default '{}'::jsonb,
  provenance jsonb not null default '{}'::jsonb,
  eligible_for_direction boolean not null default false,
  evidence_tier text not null default 'VERIFIED_PUBLICATION',
  idempotency_key text not null,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint creative_outcome_observations_org_key unique (organization_id, idempotency_key),
  constraint creative_outcome_observations_metrics_object check (jsonb_typeof(metrics) = 'object'),
  constraint creative_outcome_observations_normalized_object check (jsonb_typeof(normalized_metrics) = 'object'),
  constraint creative_outcome_observations_context_object check (jsonb_typeof(creative_context) = 'object'),
  constraint creative_outcome_observations_quality_object check (jsonb_typeof(quality_evidence) = 'object'),
  constraint creative_outcome_observations_provenance_object check (jsonb_typeof(provenance) = 'object')
);

create index if not exists creative_outcome_observations_org_observed_idx
  on public.creative_outcome_observations (organization_id, observed_at desc);
create index if not exists creative_outcome_observations_project_observed_idx
  on public.creative_outcome_observations (organization_id, creative_project_id, observed_at desc)
  where creative_project_id is not null;
create index if not exists creative_outcome_observations_brand_observed_idx
  on public.creative_outcome_observations (organization_id, brand_id, observed_at desc)
  where brand_id is not null;
create index if not exists creative_outcome_observations_campaign_observed_idx
  on public.creative_outcome_observations (organization_id, campaign_id, observed_at desc)
  where campaign_id is not null;
create index if not exists creative_outcome_observations_execution_idx
  on public.creative_outcome_observations (publish_execution_asset_node_id, observed_at desc);

alter table public.creative_outcome_observations enable row level security;

grant select, insert on public.creative_outcome_observations to service_role;
revoke all on public.creative_outcome_observations from anon, authenticated;

create or replace function public.prevent_creative_outcome_observation_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'CREATIVE_OUTCOME_OBSERVATIONS_ARE_IMMUTABLE';
end;
$$;

revoke all on function public.prevent_creative_outcome_observation_mutation() from public;
grant execute on function public.prevent_creative_outcome_observation_mutation() to service_role;

drop trigger if exists creative_outcome_observations_immutable on public.creative_outcome_observations;
create trigger creative_outcome_observations_immutable
before update or delete on public.creative_outcome_observations
for each row execute function public.prevent_creative_outcome_observation_mutation();
