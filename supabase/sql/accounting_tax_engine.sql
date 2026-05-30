create table if not exists tax_configurations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  tax_name text not null,
  tax_rate numeric(14,4) default 0,
  tax_type text not null,
  output_account text,
  input_account text,
  created_at timestamptz default now()
);

create table if not exists tax_calculations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  reference_type text,
  reference_id text,
  taxable_amount numeric(14,2) default 0,
  tax_amount numeric(14,2) default 0,
  tax_rate numeric(14,4) default 0,
  tax_name text,
  created_at timestamptz default now()
);

create table if not exists tax_filing_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  filing_period text not null,
  tax_name text,
  taxable_total numeric(14,2) default 0,
  tax_total numeric(14,2) default 0,
  filing_status text default 'draft',
  created_at timestamptz default now()
);
