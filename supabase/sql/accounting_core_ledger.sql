create table if not exists general_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  journal_entry_id uuid not null,
  journal_line_id uuid not null,
  account_id uuid not null,
  entry_date date not null,
  debit numeric(14,2) default 0,
  credit numeric(14,2) default 0,
  balance numeric(14,2) default 0,
  department text,
  location text,
  entity text,
  cost_center text,
  created_at timestamptz default now()
);

create index if not exists idx_gl_tenant
on general_ledger_entries(tenant_id);

create index if not exists idx_gl_account
on general_ledger_entries(account_id);

create index if not exists idx_gl_date
on general_ledger_entries(entry_date);
