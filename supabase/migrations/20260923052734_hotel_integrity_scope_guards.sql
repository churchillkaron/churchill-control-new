-- Canonicalize Hotel cross-scope integrity guards that previously existed only in production.
-- These are SECURITY INVOKER and service-role-only. Triggers enforce row integrity on every write.

create or replace function public.hotel_validate_guest_party_scope()
returns trigger
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_party_org uuid;
begin
  if new.party_id is null then return new; end if;

  select organization_id
    into v_party_org
  from public.parties
  where id = new.party_id;

  if v_party_org is distinct from new.organization_id then
    raise exception 'HOTEL_GUEST_PARTY_SCOPE: party must belong to guest organization';
  end if;

  return new;
end;
$function$;

revoke all on function public.hotel_validate_guest_party_scope() from public, anon, authenticated;
grant execute on function public.hotel_validate_guest_party_scope() to service_role;

drop trigger if exists hotel_guests_party_scope_guard on public.hotel_guests;
create trigger hotel_guests_party_scope_guard
before insert or update of organization_id, party_id
on public.hotel_guests
for each row
execute function public.hotel_validate_guest_party_scope();

create or replace function public.hotel_validate_property_finance_scope()
returns trigger
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_entity_org uuid;
  v_entity_active boolean;
  v_bank_org uuid;
  v_bank_entity uuid;
  v_bank_active boolean;
  v_finance_account uuid;
begin
  if new.finance_entity_id is null then
    if new.settlement_bank_account_id is not null then
      raise exception 'HOTEL_FINANCE_SCOPE: settlement account requires finance entity';
    end if;
    return new;
  end if;

  select organization_id, is_active
    into v_entity_org, v_entity_active
  from public.legal_entities
  where id = new.finance_entity_id;

  if v_entity_org is distinct from new.organization_id or coalesce(v_entity_active, false) is false then
    raise exception 'HOTEL_FINANCE_SCOPE: legal entity must be active in property organization';
  end if;

  if new.settlement_bank_account_id is not null then
    select organization_id, entity_id, active, finance_account_id
      into v_bank_org, v_bank_entity, v_bank_active, v_finance_account
    from public.bank_accounts
    where id = new.settlement_bank_account_id;

    if v_bank_org is distinct from new.organization_id
       or v_bank_entity is distinct from new.finance_entity_id
       or coalesce(v_bank_active, false) is false
       or v_finance_account is null then
      raise exception 'HOTEL_FINANCE_SCOPE: settlement account must be active, ledger-linked, and owned by the selected legal entity';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.hotel_validate_property_finance_scope() from public, anon, authenticated;
grant execute on function public.hotel_validate_property_finance_scope() to service_role;

drop trigger if exists hotel_properties_finance_scope_guard on public.hotel_properties;
create trigger hotel_properties_finance_scope_guard
before insert or update of organization_id, finance_entity_id, settlement_bank_account_id
on public.hotel_properties
for each row
execute function public.hotel_validate_property_finance_scope();

create or replace function public.hotel_validate_payment_transaction_scope()
returns trigger
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_booking public.hotel_bookings%rowtype;
  v_folio public.hotel_folios%rowtype;
  v_property public.hotel_properties%rowtype;
  v_party_org uuid;
  v_entity_org uuid;
  v_bank_org uuid;
  v_bank_entity uuid;
  v_bank_active boolean;
  v_finance_account uuid;
begin
  select *
    into v_property
  from public.hotel_properties
  where id = new.property_id
    and organization_id = new.organization_id;

  if not found then
    raise exception 'HOTEL_PAYMENT_SCOPE: property mismatch';
  end if;

  select *
    into v_booking
  from public.hotel_bookings
  where id = new.booking_id
    and organization_id = new.organization_id;

  if not found
     or v_booking.property_id is distinct from new.property_id
     or v_booking.guest_id is distinct from new.guest_id then
    raise exception 'HOTEL_PAYMENT_SCOPE: booking/property/guest mismatch';
  end if;

  if new.folio_id is not null then
    select *
      into v_folio
    from public.hotel_folios
    where id = new.folio_id
      and organization_id = new.organization_id;

    if not found or v_folio.booking_id is distinct from new.booking_id then
      raise exception 'HOTEL_PAYMENT_SCOPE: folio mismatch';
    end if;
  end if;

  select organization_id
    into v_party_org
  from public.parties
  where id = new.party_id;

  if v_party_org is distinct from new.organization_id then
    raise exception 'HOTEL_PAYMENT_SCOPE: party mismatch';
  end if;

  select organization_id
    into v_entity_org
  from public.legal_entities
  where id = new.entity_id
    and is_active = true;

  if v_entity_org is distinct from new.organization_id then
    raise exception 'HOTEL_PAYMENT_SCOPE: legal entity mismatch';
  end if;

  select organization_id, entity_id, active, finance_account_id
    into v_bank_org, v_bank_entity, v_bank_active, v_finance_account
  from public.bank_accounts
  where id = new.bank_account_id;

  if v_bank_org is distinct from new.organization_id
     or v_bank_entity is distinct from new.entity_id
     or coalesce(v_bank_active, false) is false
     or v_finance_account is null then
    raise exception 'HOTEL_PAYMENT_SCOPE: settlement account mismatch';
  end if;

  if v_property.finance_entity_id is distinct from new.entity_id
     or v_property.settlement_bank_account_id is distinct from new.bank_account_id then
    raise exception 'HOTEL_PAYMENT_SCOPE: property Finance configuration changed';
  end if;

  return new;
end;
$function$;

revoke all on function public.hotel_validate_payment_transaction_scope() from public, anon, authenticated;
grant execute on function public.hotel_validate_payment_transaction_scope() to service_role;

drop trigger if exists hotel_payment_transactions_scope_guard on public.hotel_payment_transactions;
create trigger hotel_payment_transactions_scope_guard
before insert or update
on public.hotel_payment_transactions
for each row
execute function public.hotel_validate_payment_transaction_scope();

create or replace function public.hotel_link_guest_party_guarded(
  p_organization_id uuid,
  p_guest_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_guest public.hotel_guests%rowtype;
  v_party_id uuid;
begin
  select *
    into v_guest
  from public.hotel_guests
  where organization_id = p_organization_id
    and id = p_guest_id
  for update;

  if not found then
    raise exception 'HOTEL_GUEST_NOT_FOUND';
  end if;

  if v_guest.party_id is not null then
    perform 1
    from public.parties
    where id = v_guest.party_id
      and organization_id = p_organization_id;

    if not found then
      raise exception 'HOTEL_GUEST_PARTY_SCOPE: existing party is outside organization';
    end if;

    v_party_id := v_guest.party_id;
  else
    insert into public.parties (
      organization_id,
      party_type,
      display_name,
      email,
      phone,
      status
    ) values (
      p_organization_id,
      'person',
      v_guest.full_name,
      v_guest.email,
      v_guest.phone,
      'active'
    )
    returning id into v_party_id;

    update public.hotel_guests
    set party_id = v_party_id,
        updated_at = now()
    where id = v_guest.id
      and organization_id = p_organization_id;
  end if;

  insert into public.customer_profiles (
    party_id,
    organization_id,
    customer_type,
    preferred_language,
    marketing_opt_in,
    status,
    updated_at
  ) values (
    v_party_id,
    p_organization_id,
    'PERSON',
    v_guest.preferred_language,
    coalesce(v_guest.marketing_consent, false),
    'ACTIVE',
    now()
  )
  on conflict (party_id) do update
  set preferred_language = coalesce(excluded.preferred_language, public.customer_profiles.preferred_language),
      marketing_opt_in = excluded.marketing_opt_in,
      updated_at = now();

  return v_party_id;
end;
$function$;

revoke all on function public.hotel_link_guest_party_guarded(uuid, uuid) from public, anon, authenticated;
grant execute on function public.hotel_link_guest_party_guarded(uuid, uuid) to service_role;
