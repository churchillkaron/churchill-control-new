begin;

create table if not exists public.marketing_campaign_message_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  marketing_campaign_id uuid not null references public.marketing_campaigns(id) on delete cascade,
  plan_fingerprint text not null check (char_length(btrim(plan_fingerprint)) > 0),
  delivery_key text not null check (char_length(btrim(delivery_key)) > 0),
  channel text not null check (channel in ('email','whatsapp','line','telegram','sms')),
  sender_asset_id uuid not null,
  party_id uuid not null,
  delivery_status text not null default 'SENDING' check (delivery_status in ('SENDING','SENT','FAILED','BLOCKED','SUPPRESSED')),
  consent_snapshot jsonb not null default '{}'::jsonb,
  provider_id text null,
  provider_message_id text null,
  service_usage_id uuid null references public.platform_service_usage(id) on delete set null,
  error_code text null,
  error_message text null,
  attempt_count integer not null default 1 check (attempt_count > 0),
  first_attempted_at timestamptz not null default now(),
  last_attempted_at timestamptz not null default now(),
  sent_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, delivery_key),
  constraint marketing_campaign_message_deliveries_org_party_fkey
    foreign key (organization_id, party_id)
    references public.parties (organization_id, id)
    on delete cascade
);

create index if not exists marketing_campaign_message_deliveries_campaign_idx
  on public.marketing_campaign_message_deliveries (organization_id, marketing_campaign_id, channel, delivery_status, updated_at desc);

create index if not exists marketing_campaign_message_deliveries_party_idx
  on public.marketing_campaign_message_deliveries (organization_id, party_id, updated_at desc);

comment on table public.marketing_campaign_message_deliveries is
  'Recipient-level durable evidence and idempotency ledger for governed owned-messaging campaign delivery. Recipient addresses are intentionally not persisted here; canonical party identity plus provider result evidence is retained.';

alter table public.marketing_campaign_message_deliveries enable row level security;
revoke all on table public.marketing_campaign_message_deliveries from public, anon, authenticated;

commit;
