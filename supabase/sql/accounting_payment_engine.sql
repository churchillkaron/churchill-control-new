create table if not exists payment_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  batch_reference text not null,
  payment_type text not null,
  total_amount numeric(14,2) default 0,
  payment_status text default 'pending',
  created_at timestamptz default now()
);

create table if not exists invoice_settlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  invoice_id text not null,
  payment_batch_id uuid,
  settled_amount numeric(14,2) default 0,
  settlement_date timestamptz default now(),
  settlement_status text default 'settled'
);
