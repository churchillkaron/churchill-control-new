create table if not exists ap_vendor_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  vendor_name text not null,
  invoice_number text not null,
  invoice_date date not null,
  due_date date,
  invoice_amount numeric(14,2) default 0,
  invoice_status text default 'pending',
  created_at timestamptz default now()
);

create table if not exists ap_invoice_approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  invoice_id uuid not null,
  approved_by text,
  approval_role text,
  approval_status text default 'approved',
  approved_at timestamptz default now()
);

create table if not exists ap_payment_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  invoice_id uuid not null,
  payment_reference text,
  payment_amount numeric(14,2) default 0,
  payment_method text,
  payment_status text default 'paid',
  paid_at timestamptz default now()
);
