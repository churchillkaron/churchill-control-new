create table if not exists accounting_approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  module text not null,
  entity_type text not null,
  entity_id text not null,
  requested_by text,
  approved_by text,
  status text default 'pending',
  notes text,
  created_at timestamptz default now(),
  approved_at timestamptz
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  payment_type text check (
    payment_type in (
      'ap_payment',
      'ar_receipt',
      'salary',
      'tax',
      'expense'
    )
  ),
  reference_id text,
  amount numeric(14,2) default 0,
  payment_date date,
  payment_method text,
  notes text,
  created_at timestamptz default now()
);
