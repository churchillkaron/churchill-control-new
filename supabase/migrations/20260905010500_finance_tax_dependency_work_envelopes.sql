create table if not exists public.finance_tax_dependency_work_envelopes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  vat_return_id uuid not null references public.finance_vat_returns(id) on delete cascade,
  dependency_code text not null,
  assigned_to uuid null,
  target_at timestamptz null,
  acknowledged_at timestamptz null,
  acknowledged_by uuid null,
  note text null,
  client_request_id uuid null references public.accounting_client_requests(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_tax_dependency_work_envelopes_code_not_blank check (length(trim(dependency_code)) > 0),
  constraint finance_tax_dependency_work_envelopes_note_length check (note is null or length(note) <= 4000),
  constraint finance_tax_dependency_work_envelopes_scope_unique unique (organization_id, entity_id, vat_return_id, dependency_code)
);

create index if not exists finance_tax_dependency_work_envelopes_return_idx
  on public.finance_tax_dependency_work_envelopes (organization_id, entity_id, vat_return_id, updated_at desc);

create index if not exists finance_tax_dependency_work_envelopes_assignee_idx
  on public.finance_tax_dependency_work_envelopes (organization_id, assigned_to, target_at)
  where assigned_to is not null;

comment on table public.finance_tax_dependency_work_envelopes is
  'Human ownership and coordination metadata around derived Tax dependencies. This table is not authoritative for dependency resolution; live Tax preflight remains accounting truth.';

comment on column public.finance_tax_dependency_work_envelopes.dependency_code is
  'Stable derived Tax dependency code. Resolution is never stored here.';

comment on column public.finance_tax_dependency_work_envelopes.client_request_id is
  'Optional link to a real governed accounting client request when a request exists; no synthetic engagement work item is created merely to satisfy this link.';
