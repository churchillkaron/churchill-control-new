begin;

create table if not exists public.finance_auditor_packages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null references public.legal_entities(id) on delete restrict,
  period_id uuid not null references public.accounting_periods(id) on delete restrict,
  package_version integer not null check (package_version > 0),
  close_run_id uuid not null references public.finance_period_close_runs(id) on delete restrict,
  close_type text not null,
  close_fingerprint_digest text not null,
  package_digest text not null,
  controlled_document_id uuid not null references public.enterprise_documents(id) on delete restrict,
  status text not null default 'GENERATED' check (status in ('GENERATED','REVOKED')),
  manifest jsonb not null default '{}'::jsonb,
  generated_by uuid references public.staff_accounts(id) on delete set null,
  generated_at timestamptz not null default now(),
  revoked_by uuid references public.staff_accounts(id) on delete set null,
  revoked_at timestamptz,
  revoke_reason text,
  unique (organization_id, entity_id, period_id, package_version),
  unique (organization_id, package_digest)
);

create index if not exists finance_auditor_packages_scope_idx
  on public.finance_auditor_packages (organization_id, entity_id, period_id, generated_at desc);

create table if not exists public.finance_auditor_package_grants (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.finance_auditor_packages(id) on delete cascade,
  organization_id uuid not null,
  entity_id uuid not null,
  auditor_name text,
  auditor_email text not null,
  token_hash text not null unique,
  issued_by uuid references public.staff_accounts(id) on delete set null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_by uuid references public.staff_accounts(id) on delete set null,
  revoked_at timestamptz,
  revoke_reason text,
  last_viewed_at timestamptz,
  last_downloaded_at timestamptz,
  download_count integer not null default 0 check (download_count >= 0),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists finance_auditor_package_grants_package_idx
  on public.finance_auditor_package_grants (package_id, issued_at desc);
create index if not exists finance_auditor_package_grants_active_idx
  on public.finance_auditor_package_grants (organization_id, expires_at)
  where revoked_at is null;

alter table public.finance_auditor_packages enable row level security;
alter table public.finance_auditor_package_grants enable row level security;
revoke all on table public.finance_auditor_packages from anon, authenticated;
revoke all on table public.finance_auditor_package_grants from anon, authenticated;
grant select, insert, update, delete on table public.finance_auditor_packages to service_role;
grant select, insert, update, delete on table public.finance_auditor_package_grants to service_role;

comment on table public.finance_auditor_packages is
  'Immutable auditor evidence package metadata bound to one governed close run, exact close-package fingerprint and private controlled ZIP document.';
comment on table public.finance_auditor_package_grants is
  'Expiring, revocable, read-only external auditor access to exactly one frozen auditor package. Grants never provide ERP or ledger mutation authority.';

notify pgrst, 'reload schema';
commit;
