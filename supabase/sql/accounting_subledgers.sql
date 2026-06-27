create table if not exists ap_subledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  vendor_id uuid,
  invoice_id uuid,
  journal_entry_id uuid,
  outstanding_amount numeric(14,2) default 0,
  due_date date,
  status text default 'open',
  created_at timestamptz default now()
);

create table if not exists ar_subledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  customer_id uuid,
  invoice_id uuid,
  journal_entry_id uuid,
  outstanding_amount numeric(14,2) default 0,
  due_date date,
  status text default 'open',
  created_at timestamptz default now()
);

create table if not exists inventory_subledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  item_id text,
  movement_type text,
  quantity numeric(14,2),
  unit_cost numeric(14,2),
  total_cost numeric(14,2),
  journal_entry_id uuid,
  created_at timestamptz default now()
);
