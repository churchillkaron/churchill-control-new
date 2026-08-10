alter table public.provider_supplier_billing_accounts
  add column if not exists verification_status text not null default 'UNVERIFIED',
  add column if not exists verification_method text,
  add column if not exists verification_reference text,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid;

alter table public.provider_supplier_billing_accounts
  drop constraint if exists provider_supplier_billing_accounts_verification_status_check;

alter table public.provider_supplier_billing_accounts
  add constraint provider_supplier_billing_accounts_verification_status_check
  check (verification_status in ('UNVERIFIED','VERIFIED','REJECTED'));

update public.provider_supplier_billing_accounts
set verification_status = 'UNVERIFIED',
    status = case when status = 'ACTIVE' then 'BLOCKED' else status end,
    verified_at = null,
    verified_by = null
where verification_status is distinct from 'VERIFIED';

comment on column public.provider_supplier_billing_accounts.verification_status is
  'Commercial verification state. Provider execution is not ready until the operator has verified that the external supplier invoices or charges the selected Avantiqo legal payer entity.';
comment on column public.provider_supplier_billing_accounts.verification_reference is
  'Non-secret evidence reference such as supplier invoice number, billing profile identifier, statement reference, or billing portal reference.';
