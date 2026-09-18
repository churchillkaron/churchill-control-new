begin;

alter table public.finance_e_invoicing_settings
  add column if not exists provider_credential_id uuid references public.provider_credentials(id) on delete set null,
  add column if not exists standard_code text,
  add column if not exists standard_version text,
  add column if not exists provider_status text not null default 'NOT_CONFIGURED',
  add column if not exists last_verified_at timestamptz,
  add column if not exists last_error_code text,
  add column if not exists last_error_message text;

create table if not exists public.finance_e_invoice_transmissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null references public.legal_entities(id) on delete restrict,
  customer_invoice_id uuid not null references public.customer_invoices(id) on delete restrict,
  setting_id uuid not null references public.finance_e_invoicing_settings(id) on delete restrict,
  provider_code text not null,
  network text not null,
  jurisdiction_code text not null,
  document_type text not null,
  standard_code text not null,
  standard_version text,
  source_hash text not null,
  idempotency_key text not null,
  source_xml text not null,
  provider_tracking_id text,
  provider_reference text,
  authority_reference text,
  provider_status_code text,
  provider_status_message text,
  callback_token_hash text,
  status text not null default 'PREPARED'
    check (status in ('PREPARED','SUBMITTING','SUBMITTED','ACCEPTED','REJECTED','FAILED','CANCELLED')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  submitted_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  failed_at timestamptz,
  last_status_checked_at timestamptz,
  request_evidence jsonb not null default '{}'::jsonb,
  response_evidence jsonb not null default '{}'::jsonb,
  created_by uuid references public.staff_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, customer_invoice_id, source_hash),
  unique (organization_id, idempotency_key)
);

create index if not exists finance_e_invoice_transmissions_invoice_idx
  on public.finance_e_invoice_transmissions (organization_id, entity_id, customer_invoice_id, created_at desc);
create index if not exists finance_e_invoice_transmissions_provider_idx
  on public.finance_e_invoice_transmissions (provider_code, provider_tracking_id)
  where provider_tracking_id is not null;
create index if not exists finance_e_invoice_transmissions_status_idx
  on public.finance_e_invoice_transmissions (organization_id, status, updated_at desc);

create table if not exists public.finance_e_invoice_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  transmission_id uuid not null references public.finance_e_invoice_transmissions(id) on delete cascade,
  provider_code text not null,
  provider_event_id text not null,
  event_type text,
  status text,
  payload_hash text not null,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_status text not null default 'RECEIVED'
    check (processing_status in ('RECEIVED','PROCESSED','IGNORED','FAILED')),
  error_message text,
  unique (provider_code, provider_event_id)
);

create index if not exists finance_e_invoice_events_transmission_idx
  on public.finance_e_invoice_events (transmission_id, received_at desc);

alter table public.finance_e_invoice_transmissions enable row level security;
alter table public.finance_e_invoice_events enable row level security;
revoke all on table public.finance_e_invoice_transmissions from anon, authenticated;
revoke all on table public.finance_e_invoice_events from anon, authenticated;
grant select, insert, update, delete on table public.finance_e_invoice_transmissions to service_role;
grant select, insert, update, delete on table public.finance_e_invoice_events to service_role;

comment on table public.finance_e_invoice_transmissions is
  'Governed customer-invoice e-invoice transmission lifecycle. Avantiqo preserves source evidence and certified-provider/authority responses without becoming the external signing authority.';
comment on table public.finance_e_invoice_events is
  'Immutable provider callback/status evidence for one governed e-invoice transmission.';

notify pgrst, 'reload schema';
commit;
