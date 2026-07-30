begin;

create table if not exists public.customer_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  customer_id uuid not null,
  invoice_number text not null,
  invoice_date date not null,
  due_date date,
  currency_code text not null,
  exchange_rate numeric(20,8) not null default 1,
  subtotal numeric(20,4) not null default 0,
  tax_amount numeric(20,4) not null default 0,
  total_amount numeric(20,4) not null default 0,
  outstanding_balance numeric(20,4) not null default 0,
  status text not null default 'DRAFT',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_invoices_exchange_rate_positive check (exchange_rate > 0),
  constraint customer_invoices_amounts_nonnegative check (
    subtotal >= 0 and tax_amount >= 0 and total_amount >= 0 and outstanding_balance >= 0
  ),
  constraint customer_invoices_number_scope_unique unique (
    organization_id,
    entity_id,
    invoice_number
  )
);

create table if not exists public.customer_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  customer_invoice_id uuid not null references public.customer_invoices(id) on delete cascade,
  description text,
  quantity numeric(20,6) not null default 0,
  unit_price numeric(20,4) not null default 0,
  line_total numeric(20,4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_invoice_lines_amounts_nonnegative check (
    quantity >= 0 and unit_price >= 0 and line_total >= 0
  )
);

create table if not exists public.accounts_receivable (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  customer_id uuid not null,
  customer_invoice_id uuid not null references public.customer_invoices(id) on delete restrict,
  amount numeric(20,4) not null default 0,
  outstanding_balance numeric(20,4) not null default 0,
  due_date date,
  status text not null default 'OPEN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounts_receivable_amounts_nonnegative check (
    amount >= 0 and outstanding_balance >= 0
  ),
  constraint accounts_receivable_invoice_scope_unique unique (
    organization_id,
    entity_id,
    customer_invoice_id
  )
);

create table if not exists public.customer_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  customer_id uuid not null,
  customer_invoice_id uuid references public.customer_invoices(id) on delete restrict,
  payment_date date not null,
  amount numeric(20,4) not null,
  payment_method text not null,
  reference_number text,
  paid_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_payments_amount_positive check (amount > 0)
);

create table if not exists public.vendor_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  vendor_party_id uuid not null,
  purchase_order_id uuid,
  goods_receipt_id uuid,
  document_id uuid,
  invoice_number text not null,
  invoice_date date not null,
  due_date date,
  currency_code text not null,
  exchange_rate numeric(20,8) not null default 1,
  subtotal numeric(20,4) not null default 0,
  tax_amount numeric(20,4) not null default 0,
  discount_amount numeric(20,4) not null default 0,
  total_amount numeric(20,4) not null default 0,
  outstanding_amount numeric(20,4) not null default 0,
  source text not null default 'manual',
  ai_extracted boolean not null default false,
  ocr_confidence numeric(8,6) not null default 0,
  status text not null default 'RECEIVED',
  received_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_invoices_exchange_rate_positive check (exchange_rate > 0),
  constraint vendor_invoices_amounts_nonnegative check (
    subtotal >= 0 and tax_amount >= 0 and discount_amount >= 0 and total_amount >= 0 and outstanding_amount >= 0
  ),
  constraint vendor_invoices_ocr_confidence_range check (
    ocr_confidence >= 0 and ocr_confidence <= 1
  ),
  constraint vendor_invoices_number_scope_unique unique (
    organization_id,
    entity_id,
    vendor_party_id,
    invoice_number
  )
);

create table if not exists public.accounts_payable (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  vendor_party_id uuid not null,
  vendor_invoice_id uuid references public.vendor_invoices(id) on delete restrict,
  amount numeric(20,4) not null default 0,
  due_date date,
  status text not null default 'OPEN',
  payment_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounts_payable_amount_nonnegative check (amount >= 0)
);

create table if not exists public.vendor_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  accounts_payable_id uuid not null references public.accounts_payable(id) on delete restrict,
  vendor_party_id uuid not null,
  amount numeric(20,4) not null,
  payment_method text not null,
  paid_by uuid,
  paid_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_payments_amount_positive check (amount > 0)
);

create table if not exists public.bank_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  transaction_type text not null,
  reference_id uuid,
  amount numeric(20,4) not null,
  direction text not null,
  created_at timestamptz not null default now(),
  constraint bank_ledger_amount_nonnegative check (amount >= 0),
  constraint bank_ledger_direction_check check (
    upper(direction) in ('INFLOW', 'OUTFLOW')
  )
);

create index if not exists customer_invoices_scope_idx
  on public.customer_invoices (organization_id, entity_id, invoice_date desc, created_at desc);
create index if not exists customer_invoice_lines_invoice_idx
  on public.customer_invoice_lines (organization_id, entity_id, customer_invoice_id);
create index if not exists accounts_receivable_scope_idx
  on public.accounts_receivable (organization_id, entity_id, status, due_date);
create index if not exists customer_payments_scope_idx
  on public.customer_payments (organization_id, entity_id, payment_date desc);
create index if not exists vendor_invoices_scope_idx
  on public.vendor_invoices (organization_id, entity_id, status, invoice_date desc);
create index if not exists accounts_payable_scope_idx
  on public.accounts_payable (organization_id, entity_id, status, due_date);
create index if not exists vendor_payments_scope_idx
  on public.vendor_payments (organization_id, entity_id, paid_at desc);
create index if not exists bank_ledger_scope_idx
  on public.bank_ledger (organization_id, entity_id, created_at desc);

alter table public.customer_invoices enable row level security;
alter table public.customer_invoice_lines enable row level security;
alter table public.accounts_receivable enable row level security;
alter table public.customer_payments enable row level security;
alter table public.vendor_invoices enable row level security;
alter table public.accounts_payable enable row level security;
alter table public.vendor_payments enable row level security;
alter table public.bank_ledger enable row level security;

grant select, insert, update, delete on table public.customer_invoices to service_role;
grant select, insert, update, delete on table public.customer_invoice_lines to service_role;
grant select, insert, update, delete on table public.accounts_receivable to service_role;
grant select, insert, update, delete on table public.customer_payments to service_role;
grant select, insert, update, delete on table public.vendor_invoices to service_role;
grant select, insert, update, delete on table public.accounts_payable to service_role;
grant select, insert, update, delete on table public.vendor_payments to service_role;
grant select, insert, update, delete on table public.bank_ledger to service_role;

commit;
