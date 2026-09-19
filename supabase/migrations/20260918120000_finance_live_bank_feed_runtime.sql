begin;

alter table public.finance_banking_integrations
  add column if not exists entity_id uuid references public.legal_entities(id) on delete set null,
  add column if not exists provider_credential_id uuid references public.provider_credentials(id) on delete set null,
  add column if not exists provider_country_code text,
  add column if not exists provider_bank_code text,
  add column if not exists external_connection_id text,
  add column if not exists external_account_id text,
  add column if not exists consent_expires_at timestamptz,
  add column if not exists sync_cursor text,
  add column if not exists sync_status text not null default 'NEVER_SYNCED',
  add column if not exists last_sync_started_at timestamptz,
  add column if not exists last_sync_completed_at timestamptz,
  add column if not exists last_error_code text,
  add column if not exists last_error_message text,
  add column if not exists webhook_token_hash text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists finance_banking_integrations_external_connection_uq
  on public.finance_banking_integrations (provider_name, external_connection_id)
  where external_connection_id is not null and status <> 'ARCHIVED';

create index if not exists finance_banking_integrations_sync_idx
  on public.finance_banking_integrations (status, sync_status, last_sync_completed_at)
  where connection_type = 'TRANSACTION_FEED';

create table if not exists public.finance_bank_feed_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null references public.legal_entities(id) on delete restrict,
  integration_id uuid not null references public.finance_banking_integrations(id) on delete cascade,
  bank_account_id uuid not null references public.bank_accounts(id) on delete restrict,
  provider_name text not null,
  sync_mode text not null check (sync_mode in ('INITIAL','INCREMENTAL','WEBHOOK','MANUAL')),
  idempotency_key text not null,
  provider_request_id text,
  external_statement_id text,
  cursor_before text,
  cursor_after text,
  fetched_transaction_count integer not null default 0 check (fetched_transaction_count >= 0),
  imported_transaction_count integer not null default 0 check (imported_transaction_count >= 0),
  duplicate_transaction_count integer not null default 0 check (duplicate_transaction_count >= 0),
  statement_import_ids uuid[] not null default '{}',
  status text not null default 'RUNNING' check (status in ('RUNNING','COMPLETED','NO_CHANGE','FAILED')),
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (integration_id, idempotency_key)
);

create index if not exists finance_bank_feed_sync_runs_integration_idx
  on public.finance_bank_feed_sync_runs (integration_id, started_at desc);

create table if not exists public.finance_bank_feed_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null references public.legal_entities(id) on delete restrict,
  integration_id uuid not null references public.finance_banking_integrations(id) on delete cascade,
  bank_account_id uuid not null references public.bank_accounts(id) on delete restrict,
  provider_name text not null,
  provider_transaction_id text not null,
  external_statement_id text,
  statement_import_id uuid references public.finance_bank_statement_imports(id) on delete set null,
  transaction_date date not null,
  description text,
  amount numeric(20,6) not null check (amount > 0),
  direction text not null check (direction in ('IN','OUT')),
  reference_number text,
  running_balance numeric(20,6),
  payload_hash text,
  created_at timestamptz not null default now(),
  unique (integration_id, provider_transaction_id)
);

create index if not exists finance_bank_feed_transactions_date_idx
  on public.finance_bank_feed_transactions (integration_id, transaction_date desc, created_at desc);

create table if not exists public.finance_bank_feed_provider_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  integration_id uuid not null references public.finance_banking_integrations(id) on delete cascade,
  provider_name text not null,
  provider_event_id text not null,
  event_type text,
  external_statement_id text,
  payload_hash text not null,
  payload jsonb not null default '{}'::jsonb,
  processing_status text not null default 'RECEIVED' check (processing_status in ('RECEIVED','PROCESSED','IGNORED','FAILED')),
  processed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  unique (provider_name, provider_event_id)
);

create index if not exists finance_bank_feed_provider_events_integration_idx
  on public.finance_bank_feed_provider_events (integration_id, created_at desc);

alter table public.finance_bank_feed_sync_runs enable row level security;
alter table public.finance_bank_feed_transactions enable row level security;
alter table public.finance_bank_feed_provider_events enable row level security;
revoke all on table public.finance_bank_feed_sync_runs from anon, authenticated;
revoke all on table public.finance_bank_feed_transactions from anon, authenticated;
revoke all on table public.finance_bank_feed_provider_events from anon, authenticated;
grant select, insert, update, delete on table public.finance_bank_feed_sync_runs to service_role;
grant select, insert, update, delete on table public.finance_bank_feed_transactions to service_role;
grant select, insert, update, delete on table public.finance_bank_feed_provider_events to service_role;

comment on table public.finance_bank_feed_sync_runs is
  'Immutable receipts for provider bank-feed retrievals settled into canonical Finance bank-statement imports and reconciliation.';
comment on table public.finance_bank_feed_provider_events is
  'Deduplicated provider webhook/callback evidence for governed bank feeds. Payloads never grant posting authority.';

notify pgrst, 'reload schema';
commit;
