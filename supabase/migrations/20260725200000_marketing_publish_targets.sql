begin;

create table if not exists public.marketing_publish_targets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  organization_service_id uuid not null,
  name text not null,
  channel text not null,
  service_id text not null,
  provider_id text,
  capability text,
  account_reference jsonb not null default '{}'::jsonb,
  media_policy jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'ACTIVE',
  version integer not null default 1,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_publish_targets_status_check
    check (status in ('ACTIVE', 'DISABLED', 'ARCHIVED')),
  constraint marketing_publish_targets_channel_required
    check (length(trim(channel)) > 0),
  constraint marketing_publish_targets_service_required
    check (length(trim(service_id)) > 0),
  constraint marketing_publish_targets_account_reference_object
    check (jsonb_typeof(account_reference) = 'object'),
  constraint marketing_publish_targets_media_policy_object
    check (jsonb_typeof(media_policy) = 'object'),
  constraint marketing_publish_targets_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists marketing_publish_targets_org_name_active_uidx
  on public.marketing_publish_targets (organization_id, lower(name))
  where status <> 'ARCHIVED';

create index if not exists marketing_publish_targets_org_status_idx
  on public.marketing_publish_targets (organization_id, status, channel);

alter table public.marketing_publish_targets enable row level security;

revoke all on public.marketing_publish_targets from anon, authenticated;
grant select, insert, update, delete on public.marketing_publish_targets to service_role;

comment on table public.marketing_publish_targets is
  'Marketing-owned channel/account routing. Stores no provider credentials; organization_service_id resolves execution through Avantiqo Services.';
comment on column public.marketing_publish_targets.account_reference is
  'Non-secret provider account identifiers such as page_id, instagram_business_id, author_urn or location_id. Never tokens or credentials.';

commit;
