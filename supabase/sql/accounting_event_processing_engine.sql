alter table accounting_event_bus
add column if not exists processing_started_at timestamptz;

alter table accounting_event_bus
add column if not exists processing_completed_at timestamptz;

alter table accounting_event_bus
add column if not exists processing_node text;

alter table accounting_event_bus
add column if not exists parent_event_id uuid;

create index if not exists idx_accounting_event_status
on accounting_event_bus(status);

create index if not exists idx_accounting_event_type
on accounting_event_bus(event_type);

create index if not exists idx_accounting_event_created
on accounting_event_bus(created_at);
