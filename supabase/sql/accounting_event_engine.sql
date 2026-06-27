create table if not exists accounting_events (
    id uuid primary key default gen_random_uuid(),

    organization_id uuid not null,
    entity_id uuid not null,

    event_type text not null,
    event_version integer default 1,

    source_module text not null,
    source_document text,
    source_document_id uuid,

    reference text,

    payload jsonb default '{}'::jsonb,

    journal_entry_id uuid
        references journal_entries(id),

    status text default 'PENDING',

    processed_at timestamptz,

    created_by uuid,

    created_at timestamptz default now()
);

create index if not exists idx_accounting_events_org_entity
on accounting_events(
    organization_id,
    entity_id
);

create index if not exists idx_accounting_events_status
on accounting_events(
    status
);

create index if not exists idx_accounting_events_type
on accounting_events(
    event_type
);

create index if not exists idx_accounting_events_journal
on accounting_events(
    journal_entry_id
);

create index if not exists idx_accounting_events_created
on accounting_events(
    created_at
);
