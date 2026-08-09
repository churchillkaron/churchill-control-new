begin;

alter table public.parties
  add constraint parties_organization_id_id_unique
  unique (organization_id, id);

alter table public.customer_profiles
  add column if not exists organization_id uuid,
  add column if not exists billing_address text,
  add column if not exists shipping_address text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists postal_code text,
  add column if not exists country text,
  add column if not exists notes text,
  add column if not exists status text not null default 'ACTIVE',
  add column if not exists marketing_opt_in boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

update public.customer_profiles profile
set organization_id = party.organization_id,
    updated_at = now()
from public.parties party
where party.id = profile.party_id
  and profile.organization_id is null;

update public.customer_profiles profile
set customer_number = coalesce(profile.customer_number, legacy.customer_number),
    customer_type = coalesce(
      nullif(upper(profile.customer_type), ''),
      case
        when party.party_type = 'company' then 'COMPANY'
        else 'PERSON'
      end
    ),
    credit_limit = coalesce(profile.credit_limit, legacy.credit_limit, 0),
    payment_terms = coalesce(profile.payment_terms, legacy.payment_terms),
    preferred_language = coalesce(profile.preferred_language, legacy.preferred_language),
    preferred_currency = coalesce(profile.preferred_currency, legacy.preferred_currency),
    billing_address = coalesce(profile.billing_address, legacy.billing_address),
    shipping_address = coalesce(profile.shipping_address, legacy.shipping_address),
    city = coalesce(profile.city, legacy.city),
    state = coalesce(profile.state, legacy.state),
    postal_code = coalesce(profile.postal_code, legacy.postal_code),
    country = coalesce(profile.country, legacy.country),
    notes = coalesce(profile.notes, legacy.notes),
    status = coalesce(nullif(upper(profile.status), ''), nullif(upper(legacy.status), ''), 'ACTIVE'),
    marketing_opt_in = coalesce(legacy.marketing_opt_in, profile.marketing_opt_in, false),
    updated_at = now()
from public.parties party
left join public.customer_loyalty_accounts legacy
  on legacy.party_id = party.id
 and legacy.organization_id = party.organization_id
where profile.party_id = party.id;

insert into public.customer_profiles (
  party_id,
  organization_id,
  customer_number,
  customer_type,
  credit_limit,
  payment_terms,
  preferred_language,
  preferred_currency,
  billing_address,
  shipping_address,
  city,
  state,
  postal_code,
  country,
  notes,
  status,
  marketing_opt_in,
  updated_at
)
select
  party.id,
  party.organization_id,
  legacy.customer_number,
  case
    when party.party_type = 'company' then 'COMPANY'
    else 'PERSON'
  end,
  coalesce(legacy.credit_limit, 0),
  legacy.payment_terms,
  legacy.preferred_language,
  legacy.preferred_currency,
  legacy.billing_address,
  legacy.shipping_address,
  legacy.city,
  legacy.state,
  legacy.postal_code,
  legacy.country,
  legacy.notes,
  coalesce(nullif(upper(legacy.status), ''), 'ACTIVE'),
  coalesce(legacy.marketing_opt_in, false),
  now()
from public.party_relationships relationship
join public.parties party
  on party.id = relationship.party_id
 and party.organization_id = relationship.organization_id
left join public.customer_loyalty_accounts legacy
  on legacy.party_id = party.id
 and legacy.organization_id = party.organization_id
where lower(relationship.relationship_type) = 'customer'
on conflict (party_id) do nothing;

alter table public.customer_profiles
  alter column organization_id set not null;

create unique index if not exists customer_profiles_organization_party_uidx
  on public.customer_profiles (organization_id, party_id);

alter table public.customer_profiles
  drop constraint if exists customer_profiles_organization_party_fkey;

alter table public.customer_profiles
  add constraint customer_profiles_organization_party_fkey
  foreign key (organization_id, party_id)
  references public.parties (organization_id, id)
  on delete cascade;

create unique index if not exists party_relationships_organization_customer_uidx
  on public.party_relationships (organization_id, party_id)
  where lower(relationship_type) = 'customer';

alter table public.party_person_profiles
  add column if not exists organization_id uuid;

update public.party_person_profiles profile
set organization_id = party.organization_id
from public.parties party
where party.id = profile.party_id
  and profile.organization_id is null;

alter table public.party_person_profiles
  alter column organization_id set not null;

create unique index if not exists party_person_profiles_organization_party_uidx
  on public.party_person_profiles (organization_id, party_id);

alter table public.party_person_profiles
  drop constraint if exists party_person_profiles_organization_party_fkey;

alter table public.party_person_profiles
  add constraint party_person_profiles_organization_party_fkey
  foreign key (organization_id, party_id)
  references public.parties (organization_id, id)
  on delete cascade;

alter table public.party_company_profiles
  add column if not exists organization_id uuid;

update public.party_company_profiles profile
set organization_id = party.organization_id
from public.parties party
where party.id = profile.party_id
  and profile.organization_id is null;

alter table public.party_company_profiles
  alter column organization_id set not null;

create unique index if not exists party_company_profiles_organization_party_uidx
  on public.party_company_profiles (organization_id, party_id);

alter table public.party_company_profiles
  drop constraint if exists party_company_profiles_organization_party_fkey;

alter table public.party_company_profiles
  add constraint party_company_profiles_organization_party_fkey
  foreign key (organization_id, party_id)
  references public.parties (organization_id, id)
  on delete cascade;

alter table public.sales_orders
  add column if not exists party_id uuid;

update public.sales_orders sales_order
set party_id = coalesce(
  (
    select party.id
    from public.parties party
    where party.id = sales_order.customer_id
      and party.organization_id = sales_order.organization_id
    limit 1
  ),
  (
    select legacy.party_id
    from public.customer_loyalty_accounts legacy
    where legacy.id = sales_order.customer_id
      and legacy.organization_id = sales_order.organization_id
    limit 1
  )
)
where sales_order.party_id is null
  and sales_order.customer_id is not null;

create index if not exists sales_orders_organization_party_idx
  on public.sales_orders (organization_id, party_id, created_at desc)
  where party_id is not null;

alter table public.sales_orders
  drop constraint if exists sales_orders_organization_party_fkey;

alter table public.sales_orders
  add constraint sales_orders_organization_party_fkey
  foreign key (organization_id, party_id)
  references public.parties (organization_id, id)
  on delete restrict;

alter table public.table_sessions
  add column if not exists party_id uuid;

update public.table_sessions session
set party_id = coalesce(
  (
    select party.id
    from public.parties party
    where party.id = session.customer_id
      and party.organization_id = session.organization_id
    limit 1
  ),
  (
    select legacy.party_id
    from public.customer_loyalty_accounts legacy
    where legacy.id = session.customer_id
      and legacy.organization_id = session.organization_id
    limit 1
  )
)
where session.party_id is null
  and session.customer_id is not null;

create index if not exists table_sessions_organization_party_idx
  on public.table_sessions (organization_id, party_id, created_at desc)
  where party_id is not null;

alter table public.table_sessions
  drop constraint if exists table_sessions_organization_party_fkey;

alter table public.table_sessions
  add constraint table_sessions_organization_party_fkey
  foreign key (organization_id, party_id)
  references public.parties (organization_id, id)
  on delete restrict;

create or replace function public.enforce_table_session_customer_party()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.party_id is null and new.customer_id is not null then
    new.party_id := new.customer_id;
  end if;

  if new.party_id is not null then
    if new.organization_id is null then
      raise exception 'organization_id required when party_id is present';
    end if;

    perform 1
    from public.parties party
    join public.party_relationships relationship
      on relationship.organization_id = party.organization_id
     and relationship.party_id = party.id
     and relationship.relationship_type = 'customer'
     and lower(coalesce(relationship.status, 'active')) <> 'archived'
    where party.organization_id = new.organization_id
      and party.id = new.party_id
      and lower(coalesce(party.status, 'active')) <> 'archived';

    if not found then
      raise exception 'Customer Party not found in organization scope';
    end if;

    new.customer_id := new.party_id;
  else
    new.customer_id := null;
  end if;

  return new;
end;
$$;

drop trigger if exists table_sessions_customer_party_scope_trigger
  on public.table_sessions;

create trigger table_sessions_customer_party_scope_trigger
before insert or update of organization_id, customer_id, party_id
on public.table_sessions
for each row
execute function public.enforce_table_session_customer_party();

alter table public.customer_provider_identities
  add column if not exists party_id uuid;

update public.customer_provider_identities identity
set party_id = coalesce(
  (
    select party.id
    from public.parties party
    where party.id = identity.customer_id
      and party.organization_id = identity.organization_id
    limit 1
  ),
  (
    select legacy.party_id
    from public.customer_loyalty_accounts legacy
    where legacy.id = identity.customer_id
      and legacy.organization_id = identity.organization_id
    limit 1
  )
)
where identity.party_id is null
  and identity.customer_id is not null;

create index if not exists customer_provider_identities_organization_party_idx
  on public.customer_provider_identities (organization_id, party_id)
  where party_id is not null;

alter table public.customer_provider_identities
  drop constraint if exists customer_provider_identities_organization_party_fkey;

alter table public.customer_provider_identities
  add constraint customer_provider_identities_organization_party_fkey
  foreign key (organization_id, party_id)
  references public.parties (organization_id, id)
  on delete cascade;

alter table public.attribution_events
  add column if not exists party_id uuid;

update public.attribution_events attribution
set party_id = coalesce(
  (
    select party.id
    from public.parties party
    where party.id = attribution.customer_id
      and party.organization_id = attribution.organization_id
    limit 1
  ),
  (
    select legacy.party_id
    from public.customer_loyalty_accounts legacy
    where legacy.id = attribution.customer_id
      and legacy.organization_id = attribution.organization_id
    limit 1
  )
)
where attribution.party_id is null
  and attribution.customer_id is not null;

create index if not exists attribution_events_organization_party_idx
  on public.attribution_events (organization_id, party_id, created_at desc)
  where party_id is not null;

alter table public.attribution_events
  drop constraint if exists attribution_events_organization_party_fkey;

alter table public.attribution_events
  add constraint attribution_events_organization_party_fkey
  foreign key (organization_id, party_id)
  references public.parties (organization_id, id)
  on delete restrict;

create or replace function public.commercial_upsert_customer_party_atomic(
  p_organization_id uuid,
  p_party_id uuid,
  p_party_type text,
  p_display_name text,
  p_email text,
  p_phone text,
  p_legal_name text,
  p_tax_id text,
  p_address text,
  p_customer_number text,
  p_credit_limit numeric,
  p_payment_terms text,
  p_preferred_language text,
  p_preferred_currency text,
  p_billing_address text,
  p_shipping_address text,
  p_city text,
  p_state text,
  p_postal_code text,
  p_country text,
  p_birthday date,
  p_notes text,
  p_marketing_opt_in boolean,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_party public.parties%rowtype;
  v_party_type text;
  v_relationship_id uuid;
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;

  if nullif(btrim(p_display_name), '') is null then
    raise exception 'display_name required';
  end if;

  perform 1
  from public.organizations
  where id = p_organization_id;

  if not found then
    raise exception 'Organization not found';
  end if;

  v_party_type := case
    when lower(coalesce(p_party_type, 'person')) in ('company', 'organization', 'business')
      then 'company'
    else 'person'
  end;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':commercial-customer-party:' ||
      coalesce(
        p_party_id::text,
        lower(nullif(btrim(p_email), '')),
        regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'),
        gen_random_uuid()::text
      ),
      0
    )
  );

  if p_party_id is not null then
    select *
    into v_party
    from public.parties
    where id = p_party_id
      and organization_id = p_organization_id
    for update;

    if not found then
      raise exception 'Party not found in organization scope';
    end if;
  elsif nullif(lower(btrim(p_email)), '') is not null then
    select *
    into v_party
    from public.parties
    where organization_id = p_organization_id
      and lower(coalesce(email, '')) = lower(btrim(p_email))
      and lower(coalesce(status, 'active')) <> 'archived'
    order by created_at asc
    limit 1
    for update;
  elsif nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), '') is not null then
    select *
    into v_party
    from public.parties
    where organization_id = p_organization_id
      and regexp_replace(coalesce(phone, ''), '[^0-9+]', '', 'g') =
          regexp_replace(p_phone, '[^0-9+]', '', 'g')
      and lower(coalesce(status, 'active')) <> 'archived'
    order by created_at asc
    limit 1
    for update;
  end if;

  if v_party.id is null then
    insert into public.parties (
      organization_id,
      party_type,
      display_name,
      email,
      phone,
      status,
      legal_name,
      tax_id,
      address,
      created_at,
      updated_at
    ) values (
      p_organization_id,
      v_party_type,
      btrim(p_display_name),
      nullif(lower(btrim(p_email)), ''),
      nullif(btrim(p_phone), ''),
      'active',
      nullif(btrim(p_legal_name), ''),
      nullif(btrim(p_tax_id), ''),
      nullif(btrim(p_address), ''),
      now(),
      now()
    )
    returning * into v_party;
  else
    update public.parties
    set party_type = v_party_type,
        display_name = btrim(p_display_name),
        email = coalesce(nullif(lower(btrim(p_email)), ''), email),
        phone = coalesce(nullif(btrim(p_phone), ''), phone),
        legal_name = coalesce(nullif(btrim(p_legal_name), ''), legal_name),
        tax_id = coalesce(nullif(btrim(p_tax_id), ''), tax_id),
        address = coalesce(nullif(btrim(p_address), ''), address),
        status = 'active',
        updated_at = now()
    where id = v_party.id
      and organization_id = p_organization_id
    returning * into v_party;
  end if;

  insert into public.party_relationships (
    party_id,
    organization_id,
    relationship_type,
    status,
    start_date,
    metadata,
    created_at,
    updated_at
  ) values (
    v_party.id,
    p_organization_id,
    'customer',
    'active',
    current_date,
    jsonb_build_object('actor_id', p_actor_id),
    now(),
    now()
  )
  on conflict (organization_id, party_id)
    where lower(relationship_type) = 'customer'
  do update set
    status = 'active',
    end_date = null,
    metadata = coalesce(public.party_relationships.metadata, '{}'::jsonb) ||
      jsonb_build_object('actor_id', p_actor_id),
    updated_at = now()
  returning id into v_relationship_id;

  insert into public.customer_profiles (
    party_id,
    organization_id,
    customer_number,
    customer_type,
    credit_limit,
    payment_terms,
    preferred_language,
    preferred_currency,
    billing_address,
    shipping_address,
    city,
    state,
    postal_code,
    country,
    notes,
    status,
    marketing_opt_in,
    updated_at
  ) values (
    v_party.id,
    p_organization_id,
    coalesce(nullif(btrim(p_customer_number), ''), 'CUS-' || upper(substr(v_party.id::text, 1, 8))),
    case when v_party_type = 'company' then 'COMPANY' else 'PERSON' end,
    greatest(coalesce(p_credit_limit, 0), 0),
    nullif(btrim(p_payment_terms), ''),
    nullif(btrim(p_preferred_language), ''),
    nullif(upper(btrim(p_preferred_currency)), ''),
    nullif(btrim(p_billing_address), ''),
    nullif(btrim(p_shipping_address), ''),
    nullif(btrim(p_city), ''),
    nullif(btrim(p_state), ''),
    nullif(btrim(p_postal_code), ''),
    nullif(btrim(p_country), ''),
    nullif(btrim(p_notes), ''),
    'ACTIVE',
    coalesce(p_marketing_opt_in, false),
    now()
  )
  on conflict (party_id)
  do update set
    organization_id = excluded.organization_id,
    customer_number = coalesce(public.customer_profiles.customer_number, excluded.customer_number),
    customer_type = excluded.customer_type,
    credit_limit = excluded.credit_limit,
    payment_terms = excluded.payment_terms,
    preferred_language = excluded.preferred_language,
    preferred_currency = excluded.preferred_currency,
    billing_address = excluded.billing_address,
    shipping_address = excluded.shipping_address,
    city = excluded.city,
    state = excluded.state,
    postal_code = excluded.postal_code,
    country = excluded.country,
    notes = excluded.notes,
    status = 'ACTIVE',
    marketing_opt_in = excluded.marketing_opt_in,
    updated_at = now();

  if v_party_type = 'company' then
    insert into public.party_company_profiles (
      party_id,
      organization_id,
      legal_name,
      tax_number,
      billing_address,
      shipping_address
    ) values (
      v_party.id,
      p_organization_id,
      coalesce(nullif(btrim(p_legal_name), ''), v_party.display_name),
      nullif(btrim(p_tax_id), ''),
      nullif(btrim(p_billing_address), ''),
      nullif(btrim(p_shipping_address), '')
    )
    on conflict (party_id)
    do update set
      organization_id = excluded.organization_id,
      legal_name = excluded.legal_name,
      tax_number = excluded.tax_number,
      billing_address = excluded.billing_address,
      shipping_address = excluded.shipping_address;

    delete from public.party_person_profiles
    where party_id = v_party.id
      and organization_id = p_organization_id;
  else
    insert into public.party_person_profiles (
      party_id,
      organization_id,
      first_name,
      last_name,
      birthday
    ) values (
      v_party.id,
      p_organization_id,
      split_part(v_party.display_name, ' ', 1),
      nullif(btrim(substr(v_party.display_name, length(split_part(v_party.display_name, ' ', 1)) + 1)), ''),
      p_birthday
    )
    on conflict (party_id)
    do update set
      organization_id = excluded.organization_id,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      birthday = excluded.birthday;

    delete from public.party_company_profiles
    where party_id = v_party.id
      and organization_id = p_organization_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'organization_id', p_organization_id,
    'party_id', v_party.id,
    'relationship_id', v_relationship_id,
    'customer_number', (
      select customer_number
      from public.customer_profiles
      where party_id = v_party.id
        and organization_id = p_organization_id
    )
  );
end;
$$;

create or replace function public.commercial_create_sales_order_draft_party_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_channel text,
  p_application_id text,
  p_source_type text,
  p_source_reference text,
  p_party_id uuid,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_currency_code text,
  p_prices_include_tax boolean,
  p_tax_code_id uuid,
  p_tax_code text,
  p_tax_rate numeric,
  p_items jsonb,
  p_actor_staff_id uuid,
  p_actor_name text,
  p_notes text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
  v_sales_order_id uuid;
begin
  if p_party_id is not null then
    perform 1
    from public.parties party
    join public.party_relationships relationship
      on relationship.organization_id = party.organization_id
     and relationship.party_id = party.id
     and relationship.relationship_type = 'customer'
     and lower(coalesce(relationship.status, 'active')) <> 'archived'
    where party.organization_id = p_organization_id
      and party.id = p_party_id
      and lower(coalesce(party.status, 'active')) <> 'archived';

    if not found then
      raise exception 'Customer Party not found in organization scope';
    end if;
  end if;

  v_result := public.commercial_create_sales_order_draft_atomic(
    p_organization_id,
    p_entity_id,
    p_channel,
    p_application_id,
    p_source_type,
    p_source_reference,
    p_party_id,
    p_customer_name,
    p_customer_email,
    p_customer_phone,
    p_currency_code,
    p_prices_include_tax,
    p_tax_code_id,
    p_tax_code,
    p_tax_rate,
    p_items,
    p_actor_staff_id,
    p_actor_name,
    p_notes,
    p_idempotency_key
  );

  v_sales_order_id := nullif(v_result->>'sales_order_id', '')::uuid;

  if v_sales_order_id is not null then
    perform 1
    from public.sales_orders
    where id = v_sales_order_id
      and organization_id = p_organization_id
      and coalesce(party_id, customer_id) is not distinct from p_party_id;

    if not found then
      raise exception 'Idempotency key is already associated with another customer Party';
    end if;

    update public.sales_orders
      set party_id = p_party_id,
        updated_at = now()
    where id = v_sales_order_id
      and organization_id = p_organization_id
      and party_id is null;
  end if;

  return v_result || jsonb_build_object('party_id', p_party_id);
end;
$$;

revoke execute on function public.commercial_upsert_customer_party_atomic(
  uuid, uuid, text, text, text, text, text, text, text, text,
  numeric, text, text, text, text, text, text, text, text, text,
  date, text, boolean, uuid
) from public, anon, authenticated;

grant execute on function public.commercial_upsert_customer_party_atomic(
  uuid, uuid, text, text, text, text, text, text, text, text,
  numeric, text, text, text, text, text, text, text, text, text,
  date, text, boolean, uuid
) to service_role;

revoke execute on function public.enforce_table_session_customer_party()
  from public, anon, authenticated;

revoke execute on function public.commercial_create_sales_order_draft_party_atomic(
  uuid, uuid, text, text, text, text, uuid, text, text, text, text,
  boolean, uuid, text, numeric, jsonb, uuid, text, text, text
) from public, anon, authenticated;

grant execute on function public.commercial_create_sales_order_draft_party_atomic(
  uuid, uuid, text, text, text, text, uuid, text, text, text, text,
  boolean, uuid, text, numeric, jsonb, uuid, text, text, text
) to service_role;

revoke execute on function public.commercial_create_sales_order_draft_atomic(
  uuid, uuid, text, text, text, text, uuid, text, text, text, text,
  boolean, uuid, text, numeric, jsonb, uuid, text, text, text
) from public, anon, authenticated;

grant execute on function public.commercial_create_sales_order_draft_atomic(
  uuid, uuid, text, text, text, text, uuid, text, text, text, text,
  boolean, uuid, text, numeric, jsonb, uuid, text, text, text
) to service_role;

revoke execute on function public.commercial_confirm_sales_order_atomic(
  uuid, uuid, uuid, uuid, text
) from public, anon, authenticated;

grant execute on function public.commercial_confirm_sales_order_atomic(
  uuid, uuid, uuid, uuid, text
) to service_role;

comment on function public.commercial_upsert_customer_party_atomic(
  uuid, uuid, text, text, text, text, text, text, text, text,
  numeric, text, text, text, text, text, text, text, text, text,
  date, text, boolean, uuid
) is
  'Creates or updates one organization-scoped Party and its customer relationship/profile atomically. Party ID is the customer identity.';

comment on function public.commercial_create_sales_order_draft_party_atomic(
  uuid, uuid, text, text, text, text, uuid, text, text, text, text,
  boolean, uuid, text, numeric, jsonb, uuid, text, text, text
) is
  'Creates a Commercial sales-order draft for an organization-scoped customer Party. The legacy customer_id storage field is only a compatibility mirror of party_id.';

notify pgrst, 'reload schema';

commit;
