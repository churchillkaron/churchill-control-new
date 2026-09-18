begin;

create table if not exists public.finance_client_portal_deliveries (
  id uuid primary key default gen_random_uuid(),
  accounting_firm_id uuid not null,
  organization_id uuid not null,
  entity_id uuid references public.legal_entities(id) on delete set null,
  engagement_id uuid not null references public.accounting_engagements(id) on delete cascade,
  portal_grant_id uuid not null references public.accounting_client_portal_grants(id) on delete cascade,
  recipient_email text not null,
  channel text not null default 'EMAIL' check (channel in ('EMAIL')),
  provider_id text,
  status text not null default 'PENDING'
    check (status in ('PENDING','CREDENTIAL_REQUIRED','SENDING','SENT','FAILED')),
  subject text,
  external_message_id text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (portal_grant_id, recipient_email)
);

create index if not exists finance_client_portal_deliveries_engagement_idx
  on public.finance_client_portal_deliveries (accounting_firm_id, engagement_id, created_at desc);

alter table public.document_signature_requests
  add column if not exists viewed_at timestamptz,
  add column if not exists signing_method text,
  add column if not exists signed_name text,
  add column if not exists signed_document_checksum_sha256 text,
  add column if not exists signature_evidence_hash text,
  add column if not exists consent_version text,
  add column if not exists consent_text text;

create table if not exists public.document_signature_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid,
  signature_request_id uuid not null references public.document_signature_requests(id) on delete cascade,
  enterprise_document_id uuid not null references public.enterprise_documents(id) on delete cascade,
  version_number integer not null,
  event_type text not null check (event_type in ('CREATED','DELIVERED','VIEWED','SIGNED','DECLINED','EXPIRED','CANCELLED','FAILED')),
  actor_type text not null check (actor_type in ('SIGNER','STAFF','PROVIDER','SYSTEM')),
  portal_grant_id uuid references public.accounting_client_portal_grants(id) on delete set null,
  evidence_hash text,
  evidence jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists document_signature_events_request_idx
  on public.document_signature_events (organization_id, signature_request_id, occurred_at desc);
create unique index if not exists document_signature_events_terminal_unique
  on public.document_signature_events (signature_request_id, event_type)
  where event_type in ('SIGNED','DECLINED');

alter table public.finance_client_portal_deliveries enable row level security;
alter table public.document_signature_events enable row level security;
revoke all on table public.finance_client_portal_deliveries from anon, authenticated;
revoke all on table public.document_signature_events from anon, authenticated;
grant select, insert, update, delete on table public.finance_client_portal_deliveries to service_role;
grant select, insert, update, delete on table public.document_signature_events to service_role;

comment on table public.finance_client_portal_deliveries is
  'Provider-backed delivery receipts for exact accounting client portal grants. A delivery receipt does not broaden portal scope.';
comment on table public.document_signature_events is
  'Immutable execution evidence for governed document signature lifecycle. Native portal signing records a simple electronic signature bound to an exact controlled document version/checksum and does not claim qualified digital-signature status.';

notify pgrst, 'reload schema';
commit;
