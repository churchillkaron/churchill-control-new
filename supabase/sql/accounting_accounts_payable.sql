create table if not exists vendor_invoices (
    id uuid primary key default gen_random_uuid(),

    organization_id uuid not null,
    entity_id uuid not null,

    invoice_number text not null,

    vendor_id uuid not null,

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

create table if not exists vendor_payments (
    id uuid primary key default gen_random_uuid(),

    organization_id uuid not null,
    entity_id uuid not null,

    payment_number text not null,

    vendor_invoice_id uuid
        references vendor_invoices(id)
        on delete cascade,

    payment_date date not null,

    currency_code text default 'THB',
    exchange_rate numeric(18,8) default 1,

    amount numeric(18,2) not null,

    payment_method text,

    journal_entry_id uuid
        references journal_entries(id),

    status text default 'POSTED',

    created_by uuid,

    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create index if not exists idx_ap_invoice_org_entity
on vendor_invoices(
    organization_id,
    entity_id
);

create index if not exists idx_ap_vendor
on vendor_invoices(
    vendor_id
);

create index if not exists idx_ap_status
on vendor_invoices(
    status
);

create index if not exists idx_ap_due
on vendor_invoices(
    due_date
);

create index if not exists idx_ap_payment_org_entity
on vendor_payments(
    organization_id,
    entity_id
);

create index if not exists idx_ap_payment_invoice
on vendor_payments(
    vendor_invoice_id
);

create index if not exists idx_ap_payment_journal
on vendor_payments(
    journal_entry_id
);
