begin;

alter table if exists public.invoice_matches
  add column if not exists organization_id uuid,
  add column if not exists entity_id uuid;

do $$
declare
  v_unscoped_organization_count bigint;
  v_unscoped_entity_count bigint;
begin
  if to_regclass('public.invoice_matches') is null then
    raise exception 'public.invoice_matches is required before scope alignment';
  end if;

  if to_regclass('public.vendor_invoices') is null then
    raise exception 'public.vendor_invoices is required before invoice match scope alignment';
  end if;

  -- invoice_id references the matched vendor invoice. Vendor invoice UUIDs are
  -- globally unique, so both organization and entity scope can be resolved
  -- without guessing or relying on a pre-existing invoice_matches scope value.
  update public.invoice_matches as invoice_match
  set organization_id = vendor_invoice.organization_id,
      entity_id = vendor_invoice.entity_id
  from public.vendor_invoices as vendor_invoice
  where vendor_invoice.id = invoice_match.invoice_id
    and (
      invoice_match.organization_id is null
      or invoice_match.entity_id is null
      or invoice_match.organization_id <> vendor_invoice.organization_id
      or invoice_match.entity_id <> vendor_invoice.entity_id
    );

  select count(*)
  into v_unscoped_organization_count
  from public.invoice_matches
  where organization_id is null;

  if v_unscoped_organization_count > 0 then
    raise exception
      'Unable to resolve organization scope for % invoice_matches rows; migration stopped without guessing scope',
      v_unscoped_organization_count;
  end if;

  select count(*)
  into v_unscoped_entity_count
  from public.invoice_matches
  where entity_id is null;

  if v_unscoped_entity_count > 0 then
    raise exception
      'Unable to resolve entity scope for % invoice_matches rows; migration stopped without guessing scope',
      v_unscoped_entity_count;
  end if;
end;
$$;

alter table if exists public.invoice_matches
  alter column organization_id set not null,
  alter column entity_id set not null;

create index if not exists invoice_matches_organization_entity_idx
on public.invoice_matches (
  organization_id,
  entity_id
);

notify pgrst, 'reload schema';

commit;
