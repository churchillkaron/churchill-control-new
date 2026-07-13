begin;

alter table public.billing_invoices
  add column if not exists organization_id uuid,
  add column if not exists party_id uuid,
  add column if not exists entity_id uuid,
  add column if not exists bill_to_organization_id uuid,
  add column if not exists invoice_type text not null default 'SUBSCRIPTION',
  add column if not exists source text not null default 'PLATFORM',
  add column if not exists subtotal numeric(18,6) not null default 0,
  add column if not exists tax_amount numeric(18,6) not null default 0,
  add column if not exists total_amount numeric(18,6) not null default 0,
  add column if not exists period_start date,
  add column if not exists period_end date,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table public.billing_invoices
  alter column tenant_id drop not null;

drop trigger if exists set_tenant_id_billing_invoices
  on public.billing_invoices;

drop policy if exists tenant_delete_billing_invoices
  on public.billing_invoices;

drop policy if exists tenant_insert_billing_invoices
  on public.billing_invoices;

drop policy if exists tenant_select_billing_invoices
  on public.billing_invoices;

drop policy if exists tenant_update_billing_invoices
  on public.billing_invoices;

drop index if exists public.idx_billing_invoices_tenant_id;

update public.billing_invoices
set
  subtotal = case
    when subtotal = 0 then coalesce(amount, 0)
    else subtotal
  end,
  total_amount = case
    when total_amount = 0 then coalesce(amount, 0)
    else total_amount
  end,
  updated_at = coalesce(updated_at, now());

create index if not exists idx_billing_invoices_organization_id
  on public.billing_invoices (organization_id);

create index if not exists idx_billing_invoices_entity_id
  on public.billing_invoices (entity_id);

create index if not exists idx_billing_invoices_party_id
  on public.billing_invoices (party_id);

create index if not exists idx_billing_invoices_source_status
  on public.billing_invoices (organization_id, source, status);

create table if not exists public.billing_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  bill_to_organization_id uuid not null,
  entity_id uuid,
  party_id uuid,
  invoice_id uuid not null
    references public.billing_invoices(id)
    on delete cascade,
  usage_id uuid,
  service_id text,
  provider_id text,
  description text not null,
  quantity numeric(18,6) not null default 1,
  unit text not null default 'request',
  unit_price numeric(18,6) not null default 0,
  supplier_cost numeric(18,6) not null default 0,
  platform_markup numeric(18,6) not null default 0,
  line_total numeric(18,6) not null default 0,
  currency text not null default 'USD',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_billing_invoice_lines_usage_id
  on public.billing_invoice_lines (usage_id)
  where usage_id is not null;

create index if not exists idx_billing_invoice_lines_invoice_id
  on public.billing_invoice_lines (invoice_id);

create index if not exists idx_billing_invoice_lines_organization_id
  on public.billing_invoice_lines (organization_id);

alter table public.platform_service_usage
  add column if not exists party_id uuid,
  add column if not exists entity_id uuid,
  add column if not exists organization_service_id uuid,
  add column if not exists pricing_id uuid,
  add column if not exists billing_invoice_line_id uuid,
  add column if not exists error_message text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_platform_service_usage_party_id
  on public.platform_service_usage (party_id);

create index if not exists idx_platform_service_usage_entity_id
  on public.platform_service_usage (entity_id);

create index if not exists idx_platform_service_usage_invoice_status
  on public.platform_service_usage (
    organization_id,
    invoice_status
  );

alter table public.wallet_transactions
  add column if not exists party_id uuid,
  add column if not exists entity_id uuid,
  add column if not exists reservation_id uuid;

create index if not exists idx_wallet_transactions_usage_id
  on public.wallet_transactions (usage_id);

create index if not exists idx_wallet_transactions_party_id
  on public.wallet_transactions (party_id);

create index if not exists idx_wallet_transactions_entity_id
  on public.wallet_transactions (entity_id);

commit;
