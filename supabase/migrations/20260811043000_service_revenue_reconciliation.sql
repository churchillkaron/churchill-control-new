begin;

create table if not exists public.service_revenue_reconciliation (
  id uuid primary key default gen_random_uuid(),
  usage_id uuid not null unique references public.platform_service_usage(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_id uuid null references public.legal_entities(id) on delete set null,
  provider text not null,
  currency text not null,
  expected_customer_charge numeric(18,6) not null default 0,
  wallet_charged numeric(18,6) not null default 0,
  invoiced_amount numeric(18,6) not null default 0,
  supplier_cost numeric(18,6) not null default 0,
  platform_markup numeric(18,6) not null default 0,
  billing_completed boolean not null default false,
  finance_posted boolean not null default false,
  status text not null default 'OPEN',
  issue_code text null,
  first_seen_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  resolved_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  constraint service_revenue_reconciliation_status_ck
    check (status in ('OPEN','BALANCED','CRITICAL','PENDING_FINANCE'))
);

create index if not exists idx_service_revenue_reconciliation_status
  on public.service_revenue_reconciliation(status, last_checked_at);

create index if not exists idx_service_revenue_reconciliation_organization
  on public.service_revenue_reconciliation(organization_id, last_checked_at desc);

alter table public.service_revenue_reconciliation enable row level security;

comment on table public.service_revenue_reconciliation is
  'Service-domain reconciliation evidence comparing successful paid usage with customer Wallet charges, billing records, and Finance posting state. This is not a billing ledger and must never originate provider execution or retroactive customer charges.';

comment on column public.service_revenue_reconciliation.issue_code is
  'Reconciliation classification such as UNCHARGED_SUCCESS, CHARGED_UNBILLED, INVOICE_MISMATCH, BILLING_STATE_MISMATCH, or FINANCE_PENDING.';

-- Safe historical state repair only: if a usage already has an invoice and matching
-- invoice line for the exact customer price, mark billing completion true.
-- This does not create invoices, alter Wallet balances, or post Finance entries.
update public.platform_service_usage u
set
  billing_completed = true,
  updated_at = now()
where u.status = 'SUCCESS'
  and coalesce(u.customer_price, 0) > 0
  and u.invoice_status = 'INVOICED'
  and u.invoice_id is not null
  and u.billing_invoice_line_id is not null
  and coalesce(u.billing_completed, false) = false
  and exists (
    select 1
    from public.billing_invoice_lines bil
    where bil.id = u.billing_invoice_line_id
      and bil.invoice_id = u.invoice_id
      and bil.usage_id = u.id
      and bil.organization_id = u.organization_id
      and coalesce(bil.line_total, 0) = coalesce(u.customer_price, 0)
  );

notify pgrst, 'reload schema';
commit;
