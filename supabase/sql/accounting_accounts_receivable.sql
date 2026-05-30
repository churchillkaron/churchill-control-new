create table if not exists ar_customer_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  customer_name text not null,
  invoice_number text not null,
  invoice_date date not null,
  due_date date,
  invoice_amount numeric(14,2) default 0,
  outstanding_balance numeric(14,2) default 0,
  invoice_status text default 'open',
  created_at timestamptz default now()
);

create table if not exists ar_payment_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  invoice_id uuid not null,
  payment_reference text,
  payment_amount numeric(14,2) default 0,
  payment_method text,
  received_at timestamptz default now()
);

create table if not exists ar_aging_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  customer_name text,
  current_bucket numeric(14,2) default 0,
  days_30 numeric(14,2) default 0,
  days_60 numeric(14,2) default 0,
  days_90 numeric(14,2) default 0,
  total_outstanding numeric(14,2) default 0,
  created_at timestamptz default now()
);
