begin;

create table if not exists public.managed_media_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  organization_service_id uuid null references public.organization_services(id) on delete set null,
  usage_id uuid null references public.platform_service_usage(id) on delete set null,
  provider text not null,
  service_id text not null default 'meta-ads',
  status text not null default 'RESERVED',
  campaign_name text not null,
  currency text not null,
  authorized_budget numeric(18,6) not null check (authorized_budget > 0),
  reserved_amount numeric(18,6) not null check (reserved_amount >= 0),
  settled_amount numeric(18,6) not null default 0 check (settled_amount >= 0),
  released_amount numeric(18,6) not null default 0 check (released_amount >= 0),
  provider_campaign_id text null,
  provider_ad_set_id text null,
  provider_creative_id text null,
  provider_ad_id text null,
  source_asset_id uuid null,
  destination text null,
  delivery_channels jsonb not null default '[]'::jsonb,
  targeting jsonb not null default '{}'::jsonb,
  schedule jsonb not null default '{}'::jsonb,
  provider_result jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null,
  constraint managed_media_campaigns_settlement_guard check (
    settled_amount + released_amount <= reserved_amount
  )
);

create index if not exists managed_media_campaigns_org_created_idx
  on public.managed_media_campaigns (organization_id, created_at desc);

create unique index if not exists managed_media_campaigns_provider_campaign_uidx
  on public.managed_media_campaigns (provider, provider_campaign_id)
  where provider_campaign_id is not null;

alter table public.managed_media_campaigns enable row level security;

revoke all on public.managed_media_campaigns from anon;
revoke all on public.managed_media_campaigns from authenticated;
grant select, insert, update, delete on public.managed_media_campaigns to service_role;

comment on table public.managed_media_campaigns is
  'Organization-scoped ledger for Avantiqo-managed media budget reservation, provider execution, spend settlement and release.';

notify pgrst, 'reload schema';

commit;
