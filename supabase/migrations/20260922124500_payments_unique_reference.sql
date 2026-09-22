create unique index if not exists payments_organization_payment_reference_uidx
  on public.payments (organization_id, payment_reference)
  where payment_reference is not null;

comment on index public.payments_organization_payment_reference_uidx is
  'Ensures customer-facing Avantiqo payment references are unique inside an organization.';
