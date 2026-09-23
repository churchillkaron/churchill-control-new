begin;

create table if not exists public.accounting_managed_clients (
  id uuid primary key default gen_random_uuid(),
  firm_organization_id uuid not null references public.organizations(id) on delete cascade,
  client_organization_id uuid not null references public.organizations(id) on delete cascade,
  organization_client_relationship_id uuid not null references public.organization_clients(id) on delete cascade,
  management_status text not null default 'UNCLAIMED'
    check (management_status in ('UNCLAIMED','CLAIM_PENDING','CLAIMING','CLAIMED','ARCHIVED')),
  contact_email text,
  registration_number text,
  registration_number_key text,
  tax_number text,
  tax_number_key text,
  fiscal_year_start_month integer not null default 1
    check (fiscal_year_start_month between 1 and 12),
  claim_email text,
  claim_token_hash text unique check (claim_token_hash is null or char_length(claim_token_hash) = 64),
  claim_expires_at timestamptz,
  claim_invited_at timestamptz,
  claiming_by_auth_user_id uuid,
  claiming_attempt_id uuid,
  claiming_started_at timestamptz,
  created_by_auth_user_id uuid,
  claimed_by_auth_user_id uuid,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    management_status not in ('CLAIM_PENDING','CLAIMING')
    or (claim_email is not null and claim_token_hash is not null and claim_expires_at is not null)
  ),
  check (
    management_status <> 'CLAIMING'
    or (claiming_by_auth_user_id is not null and claiming_attempt_id is not null and claiming_started_at is not null)
  ),
  check (
    management_status <> 'CLAIMED'
    or (claimed_by_auth_user_id is not null and claimed_at is not null)
  ),
  unique (firm_organization_id, client_organization_id),
  unique (organization_client_relationship_id)
);
create table if not exists public.accounting_managed_client_identity_reservations (
  id uuid primary key default gen_random_uuid(),
  firm_organization_id uuid not null references public.organizations(id) on delete cascade,
  identity_kind text not null check (identity_kind in ('registration','tax')),
  identity_key text not null,
  reservation_token uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  unique (firm_organization_id, identity_kind, identity_key)
);

alter table public.accounting_managed_client_identity_reservations enable row level security;
revoke all on table public.accounting_managed_client_identity_reservations from public, anon, authenticated;
grant select, insert, update, delete on table public.accounting_managed_client_identity_reservations to service_role;

create index if not exists accounting_managed_clients_firm_status_idx
  on public.accounting_managed_clients(firm_organization_id, management_status);

create unique index if not exists accounting_managed_clients_firm_registration_uidx
  on public.accounting_managed_clients(firm_organization_id, registration_number_key)
  where registration_number_key is not null and management_status <> 'ARCHIVED';

create unique index if not exists accounting_managed_clients_firm_tax_uidx
  on public.accounting_managed_clients(firm_organization_id, tax_number_key)
  where tax_number_key is not null and management_status <> 'ARCHIVED';

alter table public.accounting_managed_clients enable row level security;

revoke all on table public.accounting_managed_clients from public, anon, authenticated;
grant select, insert, update, delete on table public.accounting_managed_clients to service_role;

comment on table public.accounting_managed_clients is
  'Accounting-firm managed client organizations that may exist without a client Avantiqo login.';

create or replace function public.activate_accounting_managed_client_setup(
  p_managed_client_id uuid,
  p_relationship_id uuid,
  p_organization_id uuid,
  p_firm_organization_id uuid
)
returns table (
  managed_client_id uuid,
  relationship_id uuid,
  organization_id uuid,
  relationship_status text,
  organization_status text
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_managed_id uuid;
  v_relationship_id uuid;
  v_organization_id uuid;
begin
  select amc.id, oc.id, o.id
  into v_managed_id, v_relationship_id, v_organization_id
  from public.accounting_managed_clients amc
  join public.organization_clients oc
    on oc.id = amc.organization_client_relationship_id
   and oc.firm_organization_id = amc.firm_organization_id
   and oc.client_organization_id = amc.client_organization_id
  join public.organizations o
    on o.id = amc.client_organization_id
  where amc.id = p_managed_client_id
    and amc.organization_client_relationship_id = p_relationship_id
    and amc.client_organization_id = p_organization_id
    and amc.firm_organization_id = p_firm_organization_id
    and amc.management_status = 'UNCLAIMED'
    and oc.relationship_status = 'inactive'
    and o.organization_status = 'PROVISIONING'
  for update of amc, oc, o;

  if v_managed_id is null then
    raise exception 'MANAGED_CLIENT_SETUP_ACTIVATION_INVALID';
  end if;

  update public.organizations
  set status = 'active',
      organization_status = 'ACTIVE'
  where id = v_organization_id
    and organization_status = 'PROVISIONING';

  if not found then
    raise exception 'MANAGED_CLIENT_ORGANIZATION_ACTIVATION_CONFLICT';
  end if;

  update public.organization_clients
  set relationship_status = 'active'
  where id = v_relationship_id
    and firm_organization_id = p_firm_organization_id
    and client_organization_id = v_organization_id
    and relationship_status = 'inactive';

  if not found then
    raise exception 'MANAGED_CLIENT_RELATIONSHIP_ACTIVATION_CONFLICT';
  end if;

  return query
  select v_managed_id, v_relationship_id, v_organization_id, 'active'::text, 'ACTIVE'::text;
end;
$$;

revoke all on function public.activate_accounting_managed_client_setup(uuid,uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.activate_accounting_managed_client_setup(uuid,uuid,uuid,uuid)
  to service_role;

create or replace function public.finalize_accounting_managed_client_claim(
  p_claim_id uuid,
  p_auth_user_id uuid,
  p_claiming_attempt_id uuid,
  p_staff_account_id uuid,
  p_owner_name text,
  p_owner_email text,
  p_organization_id uuid,
  p_industry text,
  p_organization_type text,
  p_token_hash text
)
returns table (
  claim_id uuid,
  client_organization_id uuid,
  management_status text,
  claimed_at timestamptz,
  party_id uuid
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_party_id uuid;
  v_party_count integer;
  v_claimed_at timestamptz := now();
  v_membership_id uuid;
  v_relationship_id uuid;
begin
  select oc.id
  into v_relationship_id
  from public.accounting_managed_clients amc
  join public.organization_clients oc
    on oc.id = amc.organization_client_relationship_id
   and oc.firm_organization_id = amc.firm_organization_id
   and oc.client_organization_id = amc.client_organization_id
  where amc.id = p_claim_id
    and amc.client_organization_id = p_organization_id
    and amc.management_status = 'CLAIMING'
    and amc.claiming_by_auth_user_id = p_auth_user_id
    and amc.claiming_attempt_id = p_claiming_attempt_id
    and amc.claim_token_hash = p_token_hash
    and lower(amc.claim_email) = lower(p_owner_email)
    and amc.claim_expires_at > now()
    and oc.relationship_status = 'active'
  for update of amc, oc;

  if v_relationship_id is null then
    raise exception 'MANAGED_CLIENT_CLAIM_RESERVATION_INVALID';
  end if;

  select count(*)
  into v_party_count
  from public.parties p
  where p.organization_id = p_organization_id
    and lower(coalesce(p.email,'')) = lower(p_owner_email);

  if v_party_count > 1 then
    raise exception 'MANAGED_CLIENT_OWNER_PARTY_AMBIGUOUS';
  end if;

  if v_party_count = 1 then
    select p.id
    into v_party_id
    from public.parties p
    where p.organization_id = p_organization_id
      and lower(coalesce(p.email,'')) = lower(p_owner_email)
    limit 1;
  end if;

  if v_party_id is null then
    insert into public.parties (
      organization_id,
      party_type,
      display_name,
      email,
      status
    ) values (
      p_organization_id,
      'person',
      p_owner_name,
      lower(p_owner_email),
      'ACTIVE'
    )
    returning id into v_party_id;
  else
    update public.parties
    set display_name = p_owner_name,
        email = lower(p_owner_email),
        status = 'ACTIVE',
        updated_at = now()
    where id = v_party_id;
  end if;

  update public.staff_accounts
  set name = p_owner_name,
      party_id = v_party_id,
      active_organization_id = p_organization_id,
      role = 'OWNER',
      active = true
  where id = p_staff_account_id
    and auth_user_id = p_auth_user_id
    and lower(coalesce(email,'')) = lower(p_owner_email)
    and (
      (
        coalesce(active,false) = true
        and upper(coalesce(role,'')) in ('OWNER','ORGANIZATION_OWNER','ORG_OWNER','PLATFORM_OWNER','SUPER_ADMIN')
      )
      or
      (
        coalesce(active,false) = false
        and role is null
        and party_id is null
        and active_organization_id is null
      )
    );

  if not found then
    raise exception 'MANAGED_CLIENT_OWNER_STAFF_IDENTITY_INVALID';
  end if;

  select ou.id
  into v_membership_id
  from public.organization_users ou
  where ou.organization_id = p_organization_id
    and ou.staff_account_id = p_staff_account_id
  order by ou.created_at asc
  limit 1;

  if v_membership_id is null then
    insert into public.organization_users (
      organization_id,
      staff_account_id,
      role,
      status
    ) values (
      p_organization_id,
      p_staff_account_id,
      'OWNER',
      'active'
    );
  else
    update public.organization_users
    set role = 'OWNER',
        status = 'active'
    where id = v_membership_id;
  end if;

  update public.organizations
  set industry = p_industry,
      organization_type = p_organization_type,
      status = 'active',
      organization_status = 'ACTIVE'
  where id = p_organization_id;

  if not found then
    raise exception 'MANAGED_CLIENT_ORGANIZATION_NOT_FOUND';
  end if;

  update public.accounting_managed_clients
  set management_status = 'CLAIMED',
      claimed_by_auth_user_id = p_auth_user_id,
      claimed_at = v_claimed_at,
      claim_token_hash = null,
      claim_expires_at = null,
      claiming_by_auth_user_id = null,
      claiming_attempt_id = null,
      claiming_started_at = null,
      updated_at = v_claimed_at
  where id = p_claim_id
    and management_status = 'CLAIMING'
    and claiming_by_auth_user_id = p_auth_user_id
    and claiming_attempt_id = p_claiming_attempt_id
    and claim_token_hash = p_token_hash
    and lower(claim_email) = lower(p_owner_email)
    and claim_expires_at > now();

  if not found then
    raise exception 'MANAGED_CLIENT_CLAIM_FINALIZE_CONFLICT';
  end if;

  return query
  select p_claim_id, p_organization_id, 'CLAIMED'::text, v_claimed_at, v_party_id;
end;
$$;

revoke all on function public.finalize_accounting_managed_client_claim(uuid,uuid,uuid,uuid,text,text,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.finalize_accounting_managed_client_claim(uuid,uuid,uuid,uuid,text,text,uuid,text,text,text) to service_role;

commit;
