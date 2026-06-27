create table if not exists bank_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  bank_name text not null,
  account_name text not null,
  account_number text,
  currency text default 'THB',
  created_at timestamptz default now()
);

create table if not exists bank_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  bank_account_id uuid references bank_accounts(id),
  transaction_date date not null,
  description text,
  reference text,
  amount numeric(14,2) not null,
  type text check (type in ('deposit','withdrawal')),
  reconciled boolean default false,
  created_at timestamptz default now()
);

create table if not exists accounting_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  period_name text not null,
  start_date date not null,
  end_date date not null,
  status text default 'open',
  closed_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  module text not null,
  action text not null,
  entity_type text,
  entity_id text,
  user_email text,
  metadata jsonb,
  created_at timestamptz default now()
);
