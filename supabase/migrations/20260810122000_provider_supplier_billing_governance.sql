create table if not exists public.provider_supplier_billing_accounts (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null,
  payer_organization_id uuid not null references public.organizations(id) on delete restrict,
  payer_entity_id uuid references public.legal_entities(id) on delete restrict,
  supplier_party_id uuid references public.parties(id) on delete restrict,
  billing_mode text not null default 'SUPPLIER_INVOICE_OR_CHARGE',
  status text not null default 'BLOCKED',
  currency text,
  configuration jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_supplier_billing_accounts_status_check
    check (status in ('BLOCKED', 'ACTIVE', 'SUSPENDED')),
  constraint provider_supplier_billing_accounts_mode_check
    check (billing_mode in ('SUPPLIER_INVOICE_OR_CHARGE', 'MANAGED_MEDIA_INVOICE_OR_CHARGE')),
  constraint provider_supplier_billing_accounts_unique_provider_payer
    unique (provider_id, payer_organization_id)
);

create index if not exists provider_supplier_billing_accounts_provider_idx
  on public.provider_supplier_billing_accounts(provider_id);

create index if not exists provider_supplier_billing_accounts_payer_idx
  on public.provider_supplier_billing_accounts(payer_organization_id, payer_entity_id);

create index if not exists provider_supplier_billing_accounts_supplier_idx
  on public.provider_supplier_billing_accounts(supplier_party_id);

alter table public.provider_supplier_billing_accounts enable row level security;

create table if not exists public.provider_supplier_invoice_allocations (
  id uuid primary key default gen_random_uuid(),
  allocation_key text not null unique,
  provider_id text not null,
  payer_organization_id uuid not null references public.organizations(id) on delete restrict,
  payer_entity_id uuid not null references public.legal_entities(id) on delete restrict,
  supplier_party_id uuid not null references public.parties(id) on delete restrict,
  vendor_invoice_id uuid not null references public.vendor_invoices(id) on delete cascade,
  vendor_invoice_line_id uuid references public.vendor_invoice_lines(id) on delete cascade,
  usage_id uuid references public.platform_service_usage(id) on delete restrict,
  provider_charge_reference text,
  supplier_cost_amount numeric not null default 0,
  currency text not null,
  status text not null default 'UNMATCHED',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_supplier_invoice_allocations_amount_check
    check (supplier_cost_amount >= 0),
  constraint provider_supplier_invoice_allocations_status_check
    check (status in ('UNMATCHED', 'MATCHED', 'VARIANCE'))
);

create index if not exists provider_supplier_invoice_allocations_invoice_idx
  on public.provider_supplier_invoice_allocations(vendor_invoice_id);

create index if not exists provider_supplier_invoice_allocations_usage_idx
  on public.provider_supplier_invoice_allocations(usage_id);

create index if not exists provider_supplier_invoice_allocations_provider_idx
  on public.provider_supplier_invoice_allocations(provider_id, payer_organization_id);

alter table public.provider_supplier_invoice_allocations enable row level security;

comment on table public.provider_supplier_billing_accounts is
  'Service-domain governance bridge declaring the Avantiqo payer entity and supplier party for each external provider. It is configuration only; customer wallet billing and Finance AP remain canonical.';

comment on table public.provider_supplier_invoice_allocations is
  'Reconciliation bridge between provider supplier invoices/charges in Finance AP and governed Service usage supplier cost. It does not replace vendor invoices, accounts payable, wallet billing, or service usage.';
