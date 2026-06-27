create table if not exists general_ledger (
    id uuid primary key default gen_random_uuid(),

    organization_id uuid not null,
    entity_id uuid not null,

    legal_entity_id uuid,

    journal_entry_id uuid not null
        references journal_entries(id)
        on delete cascade,

    journal_entry_line_id uuid not null
        references journal_entry_lines(id)
        on delete cascade,

    account_id uuid not null,

    posting_date date not null,
    posting_period text not null,

    currency_code text default 'THB',
    exchange_rate numeric(18,8) default 1,

    debit numeric(18,2) default 0,
    credit numeric(18,2) default 0,
    balance numeric(18,2) default 0,

    department_id uuid,
    cost_center_id uuid,

    reference_type text,
    reference_id uuid,

    created_by uuid,

    created_at timestamptz default now()
);

create index if not exists idx_gl_org_entity
on general_ledger(
    organization_id,
    entity_id
);

create index if not exists idx_gl_account
on general_ledger(
    account_id
);

create index if not exists idx_gl_posting_date
on general_ledger(
    posting_date
);

create index if not exists idx_gl_period
on general_ledger(
    posting_period
);

create index if not exists idx_gl_journal
on general_ledger(
    journal_entry_id
);
