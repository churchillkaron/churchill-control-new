begin;

alter table public.enterprise_documents
  add column if not exists entity_id uuid references public.legal_entities(id) on delete restrict,
  add column if not exists document_number text,
  add column if not exists classification text not null default 'INTERNAL',
  add column if not exists owner_staff_id uuid references public.staff_accounts(id) on delete set null,
  add column if not exists effective_date date,
  add column if not exists expiry_date date,
  add column if not exists review_due_at date,
  add column if not exists retention_until date,
  add column if not exists legal_hold boolean not null default false,
  add column if not exists tags text[] not null default '{}',
  add column if not exists checksum_sha256 text,
  add column if not exists source_organization_document_id uuid references public.organization_documents(id) on delete set null;

alter table public.enterprise_documents drop constraint if exists enterprise_documents_classification_check;
alter table public.enterprise_documents add constraint enterprise_documents_classification_check
  check (classification in ('PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED'));

alter table public.enterprise_documents drop constraint if exists enterprise_documents_effective_expiry_check;
alter table public.enterprise_documents add constraint enterprise_documents_effective_expiry_check
  check (expiry_date is null or effective_date is null or expiry_date >= effective_date);

alter table public.enterprise_documents drop constraint if exists enterprise_documents_retention_check;
alter table public.enterprise_documents add constraint enterprise_documents_retention_check
  check (retention_until is null or effective_date is null or retention_until >= effective_date);

create unique index if not exists enterprise_documents_org_number_unique
  on public.enterprise_documents (organization_id, document_number)
  where document_number is not null;
create index if not exists enterprise_documents_org_entity_status_idx
  on public.enterprise_documents (organization_id, entity_id, document_status, updated_at desc);
create index if not exists enterprise_documents_expiry_idx
  on public.enterprise_documents (organization_id, entity_id, expiry_date)
  where expiry_date is not null;
create index if not exists enterprise_documents_review_idx
  on public.enterprise_documents (organization_id, entity_id, review_due_at)
  where review_due_at is not null;
create index if not exists enterprise_documents_retention_idx
  on public.enterprise_documents (organization_id, entity_id, retention_until)
  where retention_until is not null;
create index if not exists enterprise_documents_source_upload_idx
  on public.enterprise_documents (organization_id, source_organization_document_id)
  where source_organization_document_id is not null;

alter table public.enterprise_document_versions
  add column if not exists source_filename text,
  add column if not exists checksum_sha256 text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists enterprise_document_versions_document_version_unique
  on public.enterprise_document_versions (enterprise_document_id, version_number);
create index if not exists enterprise_document_versions_org_document_idx
  on public.enterprise_document_versions (organization_id, enterprise_document_id, version_number desc);

create table if not exists public.enterprise_document_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid,
  enterprise_document_id uuid not null references public.enterprise_documents(id) on delete cascade,
  reference_type text not null,
  reference_id uuid not null,
  relation_type text not null default 'RELATED',
  created_by uuid references public.staff_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint enterprise_document_links_relation_check
    check (relation_type in ('RELATED','EVIDENCE','SOURCE','OUTPUT','ATTACHMENT','CONTRACT','RECORD')),
  constraint enterprise_document_links_unique
    unique (enterprise_document_id, reference_type, reference_id, relation_type)
);

create index if not exists enterprise_document_links_reference_idx
  on public.enterprise_document_links (organization_id, reference_type, reference_id);
create index if not exists enterprise_document_links_document_idx
  on public.enterprise_document_links (organization_id, enterprise_document_id);

create table if not exists public.document_signature_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid,
  enterprise_document_id uuid not null references public.enterprise_documents(id) on delete cascade,
  version_number integer not null,
  signer_party_id uuid references public.parties(id) on delete set null,
  signer_name text,
  signer_email text,
  signing_order integer not null default 1,
  status text not null default 'PENDING',
  requested_by uuid references public.staff_accounts(id) on delete set null,
  requested_at timestamptz not null default now(),
  expires_at timestamptz,
  signed_at timestamptz,
  declined_at timestamptz,
  provider text,
  provider_reference text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_signature_requests_status_check
    check (status in ('PENDING','SENT','VIEWED','SIGNED','DECLINED','EXPIRED','CANCELLED')),
  constraint document_signature_requests_order_check check (signing_order > 0),
  constraint document_signature_requests_signer_check
    check (signer_party_id is not null or signer_email is not null or signer_name is not null)
);

create index if not exists document_signature_requests_document_idx
  on public.document_signature_requests (organization_id, enterprise_document_id, version_number, status);
create index if not exists document_signature_requests_pending_idx
  on public.document_signature_requests (organization_id, entity_id, status, expires_at)
  where status in ('PENDING','SENT','VIEWED');

create table if not exists public.document_retention_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid,
  policy_name text not null,
  document_type text,
  classification text,
  retention_days integer not null,
  disposition_action text not null default 'REVIEW',
  legal_hold_blocks_disposition boolean not null default true,
  active boolean not null default true,
  created_by uuid references public.staff_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_retention_policies_days_check check (retention_days >= 0),
  constraint document_retention_policies_action_check
    check (disposition_action in ('REVIEW','ARCHIVE','DELETE')),
  constraint document_retention_policies_classification_check
    check (classification is null or classification in ('PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED'))
);

create index if not exists document_retention_policies_lookup_idx
  on public.document_retention_policies (organization_id, entity_id, active, document_type, classification);

create table if not exists public.document_disposition_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid,
  enterprise_document_id uuid not null references public.enterprise_documents(id) on delete restrict,
  policy_id uuid references public.document_retention_policies(id) on delete set null,
  action text not null,
  status text not null default 'PENDING',
  scheduled_for date,
  decided_by uuid references public.staff_accounts(id) on delete set null,
  decision_notes text,
  decided_at timestamptz,
  executed_at timestamptz,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_disposition_events_action_check check (action in ('REVIEW','ARCHIVE','DELETE')),
  constraint document_disposition_events_status_check
    check (status in ('PENDING','APPROVED','REJECTED','EXECUTED','CANCELLED'))
);

create index if not exists document_disposition_events_queue_idx
  on public.document_disposition_events (organization_id, entity_id, status, scheduled_for);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  104857600,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain',
    'text/csv',
    'application/json',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.enterprise_document_links enable row level security;
alter table public.document_signature_requests enable row level security;
alter table public.document_retention_policies enable row level security;
alter table public.document_disposition_events enable row level security;

comment on table public.enterprise_document_links is
  'Organization-scoped links from controlled documents to canonical business records.';
comment on table public.document_signature_requests is
  'Governed signature-request evidence for immutable document versions; no signature authority is implied by row creation.';
comment on table public.document_retention_policies is
  'Organization/entity configured retention rules. Legal hold prevents automated disposition.';
comment on table public.document_disposition_events is
  'Governed retention disposition queue and execution evidence.';

commit;
