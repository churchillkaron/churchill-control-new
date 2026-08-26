create table if not exists public.provider_supplier_billing_events (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null,
  billing_source text not null,
  resource_type text not null,
  charge_key text not null unique,
  provider_resource_id text,
  endpoint_id text,
  endpoint_name text,
  pod_id text,
  network_volume_id text,
  gpu_type_id text,
  data_center_id text,
  billed_at timestamptz not null,
  bucket_size text not null default 'hour',
  amount numeric(20,8) not null default 0,
  currency text not null default 'USD',
  time_billed_ms bigint,
  disk_space_billed_gb numeric,
  metadata jsonb not null default '{}'::jsonb,
  ingested_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_supplier_billing_events_amount_check check (amount >= 0),
  constraint provider_supplier_billing_events_resource_type_check
    check (resource_type in ('SERVERLESS', 'POD', 'NETWORK_VOLUME')),
  constraint provider_supplier_billing_events_bucket_size_check
    check (bucket_size in ('hour', 'day', 'week', 'month', 'year'))
);

create index if not exists provider_supplier_billing_events_provider_time_idx
  on public.provider_supplier_billing_events(provider_id, billed_at desc);

create index if not exists provider_supplier_billing_events_endpoint_time_idx
  on public.provider_supplier_billing_events(endpoint_id, billed_at desc)
  where endpoint_id is not null;

create index if not exists provider_supplier_billing_events_resource_time_idx
  on public.provider_supplier_billing_events(resource_type, billed_at desc);

alter table public.provider_supplier_billing_events enable row level security;

revoke all on table public.provider_supplier_billing_events from anon, authenticated;
grant select, insert, update, delete on table public.provider_supplier_billing_events to service_role;

comment on table public.provider_supplier_billing_events is
  'Authoritative provider infrastructure billing events imported from supplier billing APIs. This is supplier-cost evidence only and does not replace platform service usage, customer wallet billing, vendor invoices, or accounts payable.';

comment on column public.provider_supplier_billing_events.charge_key is
  'Stable idempotency key derived from provider, resource type, billing bucket, resource identity and GPU identity.';
