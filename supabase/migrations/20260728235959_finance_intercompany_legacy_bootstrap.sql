begin;

create table if not exists public.intercompany_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.intercompany_reconciliations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid,
  transaction_id uuid not null,
  source_balance numeric,
  target_balance numeric,
  variance_amount numeric,
  reconciliation_status text default 'UNRECONCILED',
  created_at timestamptz default now()
);

comment on table public.intercompany_transactions is
  'Intercompany source-document boundary, extended by the atomic governance migration.';

comment on table public.intercompany_reconciliations is
  'Intercompany matching evidence, extended by the atomic governance migration.';

commit;
