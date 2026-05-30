create table if not exists chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  code text not null,
  name text not null,
  type text not null check (type in ('asset','liability','equity','revenue','expense')),
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  entry_date date not null,
  description text,
  reference text,
  status text not null default 'posted',
  created_at timestamptz default now()
);

create table if not exists journal_entry_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references journal_entries(id) on delete cascade,
  tenant_id uuid not null,
  account_id uuid not null references chart_of_accounts(id),
  debit numeric(14,2) not null default 0,
  credit numeric(14,2) not null default 0,
  memo text,
  created_at timestamptz default now()
);

create index if not exists idx_chart_accounts_tenant on chart_of_accounts(tenant_id);
create index if not exists idx_journal_entries_tenant on journal_entries(tenant_id);
create index if not exists idx_journal_lines_tenant on journal_entry_lines(tenant_id);
