create table if not exists intercompany_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  source_entity text not null,
  target_entity text not null,
  transaction_type text not null,
  reference_number text,
  amount numeric(14,2) default 0,
  reconciliation_status text default 'pending',
  created_at timestamptz default now()
);

create table if not exists intercompany_reconciliations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  transaction_id uuid not null,
  source_balance numeric(14,2) default 0,
  target_balance numeric(14,2) default 0,
  variance_amount numeric(14,2) default 0,
  reconciliation_status text default 'matched',
  created_at timestamptz default now()
);

create table if not exists intercompany_eliminations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  reconciliation_id uuid,
  elimination_amount numeric(14,2) default 0,
  elimination_status text default 'posted',
  created_at timestamptz default now()
);
