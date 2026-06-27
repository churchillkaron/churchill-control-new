create table if not exists customer_invoices (
    id uuid primary key default gen_random_uuid(),

    organization_id uuid not null,
    entity_id uuid not null,

    invoice_number text not null,

    customer_id uuid not null,

    invoice_date date not null,
    due_date date,

    currency_code text default 'THB',
    exchange_rate numeric(18,8) default 1,

    subtotal numeric(18,2) default 0,
    tax_amount numeric(18,2) default 0,
    discount_amount numeric(18,2) default 0,
    total_amount numeric(18,2) default 0,
    outstanding_amount numeric(18,2) default 0,

    status text default 'DRAFT',

    journal_entry_id uuid
        references journal_entries(id),

    created_by uuid,

    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create index if not exists idx_ar_org_entity
on customer_invoices(
    organization_id,
    entity_id
);

create index if not exists idx_ar_customer
on customer_invoices(
    customer_id
);

create index if not exists idx_ar_status
on customer_invoices(
    status
);

create index if not exists idx_ar_due
on customer_invoices(
    due_date
);

create index if not exists idx_ar_journal
on customer_invoices(
    journal_entry_id
);
