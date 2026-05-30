create table if not exists vendors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  vendor_name text not null,
  tax_number text,
  email text,
  phone text,
  address text,
  created_at timestamptz default now()
);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  customer_name text not null,
  tax_number text,
  email text,
  phone text,
  address text,
  created_at timestamptz default now()
);

create table if not exists ap_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  vendor_id uuid references vendors(id),
  invoice_number text not null,
  invoice_date date not null,
  due_date date,
  total_amount numeric(14,2) default 0,
  status text default 'pending',
  created_at timestamptz default now()
);

create table if not exists ar_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  customer_id uuid references customers(id),
  invoice_number text not null,
  invoice_date date not null,
  due_date date,
  total_amount numeric(14,2) default 0,
  status text default 'pending',
  created_at timestamptz default now()
);
