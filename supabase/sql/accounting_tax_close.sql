create table if not exists tax_filings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  filing_type text not null,
  filing_period text not null,
  tax_payable numeric(14,2) default 0,
  tax_receivable numeric(14,2) default 0,
  net_tax numeric(14,2) default 0,
  filing_status text default 'draft',
  created_at timestamptz default now()
);
