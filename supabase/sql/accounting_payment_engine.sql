create table if not exists payment_transactions (
    id uuid primary key default gen_random_uuid(),

    organization_id uuid not null,
    entity_id uuid not null,

    payment_number text not null,

    payment_type text not null,
    payment_method text not null,

    payer_type text,
    payer_id uuid,

    payee_type text,
    payee_id uuid,

    reference_type text,
    reference_id uuid,

    currency_code text default 'THB',
    exchange_rate numeric(18,8) default 1,

    amount numeric(18,2) not null,

    status text default 'PENDING',

    journal_entry_id uuid
        references journal_entries(id),

    notes text,

    created_by uuid,

    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create index if not exists idx_payment_org_entity
on payment_transactions(
    organization_id,
    entity_id
);

create index if not exists idx_payment_number
on payment_transactions(
    payment_number
);

create index if not exists idx_payment_reference
on payment_transactions(
    reference_type,
    reference_id
);

create index if not exists idx_payment_status
on payment_transactions(
    status
);

create index if not exists idx_payment_journal
on payment_transactions(
    journal_entry_id
);
