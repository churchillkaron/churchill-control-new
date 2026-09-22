create table if not exists public.billing_provider_price_mappings (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  environment text not null default 'sandbox',
  module_id text not null,
  billing_cycle text not null,
  currency text not null,
  unit_amount numeric not null,
  provider_product_id text not null,
  provider_price_id text not null,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_provider_price_mappings_cycle_chk
    check (billing_cycle in ('monthly','yearly')),
  constraint billing_provider_price_mappings_amount_chk
    check (unit_amount > 0),
  constraint billing_provider_price_mappings_currency_chk
    check (currency ~ '^[A-Z]{3}$'),
  constraint billing_provider_price_mappings_scope_uidx
    unique (provider, environment, module_id, billing_cycle, currency),
  constraint billing_provider_price_mappings_provider_price_uidx
    unique (provider, environment, provider_price_id)
);

create index if not exists billing_provider_price_mappings_module_idx
  on public.billing_provider_price_mappings (module_id, billing_cycle, currency)
  where active = true;

alter table public.billing_provider_price_mappings enable row level security;

revoke all on public.billing_provider_price_mappings from anon, authenticated;
grant all on public.billing_provider_price_mappings to service_role;

comment on table public.billing_provider_price_mappings is
  'Provider-specific price identifiers mapped to Avantiqo canonical module pricing. Provider IDs never become commercial source of truth.';
