create table if not exists legal_entities (
    id uuid primary key default gen_random_uuid(),

    organization_id uuid not null,

    entity_code text not null,
    legal_name text not null,
    display_name text,

    registration_number text,
    tax_registration_number text,

    country_code text not null,
    base_currency text not null default 'THB',

    parent_entity_id uuid,

    is_holding_company boolean default false,
    is_active boolean default true,

    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create table if not exists accounting_periods (
    id uuid primary key default gen_random_uuid(),

    organization_id uuid not null,
    entity_id uuid not null,

    fiscal_year integer not null,
    period_number integer not null,
    period_name text,

    start_date date not null,
    end_date date not null,

    status text default 'OPEN',

    closed_at timestamptz,
    closed_by uuid,

    locked_at timestamptz,
    locked_by uuid,

    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create table if not exists chart_of_accounts (
    id uuid primary key default gen_random_uuid(),

    organization_id uuid not null,
    entity_id uuid not null,

    account_code text not null,
    account_name text not null,

    account_type text not null,
    account_category text,

    parent_account_id uuid,

    normal_balance text not null,

    currency_code text default 'THB',

    is_system boolean default false,
    is_active boolean default true,

    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create table if not exists journal_entries (
    id uuid primary key default gen_random_uuid(),

    organization_id uuid not null,
    entity_id uuid not null,

    legal_entity_id uuid,

    journal_number text not null,
    journal_type text not null,

    posting_date date not null,
    document_date date,

    reference text,

    source_module text,
    source_document text,
    source_document_id uuid,

    description text,

    currency_code text default 'THB',
    exchange_rate numeric(18,8) default 1,

    status text default 'DRAFT',

    created_by uuid,
    approved_by uuid,
    approved_at timestamptz,

    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create table if not exists journal_entry_lines (
    id uuid primary key default gen_random_uuid(),

    organization_id uuid not null,
    entity_id uuid not null,

    journal_entry_id uuid not null references journal_entries(id) on delete cascade,

    line_number integer not null,

    account_id uuid not null,

    department_id uuid,
    cost_center_id uuid,

    description text,

    currency_code text default 'THB',
    exchange_rate numeric(18,8) default 1,

    debit numeric(18,2) default 0,
    credit numeric(18,2) default 0,

    created_at timestamptz default now()
);

create index if not exists idx_coa_org_entity
on chart_of_accounts(
    organization_id,
    entity_id
);

create index if not exists idx_je_org_entity
on journal_entries(
    organization_id,
    entity_id
);

create index if not exists idx_jl_org_entity
on journal_entry_lines(
    organization_id,
    entity_id
);
