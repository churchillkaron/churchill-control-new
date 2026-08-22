begin;

create table if not exists public.finance_e_invoicing_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  network text not null,
  jurisdiction_code text not null,
  document_type text not null,
  sender_identifier text not null,
  status text not null default 'INACTIVE',
  provider_code text,
  connection_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_e_invoicing_document_type_chk
    check (upper(document_type) in ('CUSTOMER_INVOICE','CREDIT_NOTE','DEBIT_NOTE','SELF_BILLED_INVOICE','OTHER')),
  constraint finance_e_invoicing_status_chk
    check (upper(status) in ('INACTIVE','ACTIVE','SUSPENDED'))
);

create unique index if not exists finance_e_invoicing_settings_scope_uidx
  on public.finance_e_invoicing_settings (
    organization_id,
    upper(network),
    upper(jurisdiction_code),
    upper(document_type),
    sender_identifier
  );

create index if not exists finance_e_invoicing_settings_status_idx
  on public.finance_e_invoicing_settings (organization_id, status, updated_at desc);

alter table public.finance_e_invoicing_settings enable row level security;
revoke all on public.finance_e_invoicing_settings from anon, authenticated;
grant select, insert, update, delete on public.finance_e_invoicing_settings to service_role;

commit;
