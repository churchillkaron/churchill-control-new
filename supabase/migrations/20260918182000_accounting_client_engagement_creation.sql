begin;

create unique index if not exists accounting_client_profiles_firm_client_uidx
  on public.accounting_client_profiles (accounting_firm_id, organization_id);

create unique index if not exists accounting_engagements_one_active_firm_client_uidx
  on public.accounting_engagements (accounting_firm_id, organization_id)
  where upper(coalesce(status, '')) in ('ACTIVE', 'ENABLED');

create or replace function public.accounting_create_client_engagement_atomic(
  p_accounting_firm_id uuid,
  p_client_organization_id uuid,
  p_entity_id uuid default null,
  p_service_package text default null,
  p_monthly_fee numeric default 0,
  p_billing_day integer default 1,
  p_start_date date default null,
  p_contract_start_date date default null,
  p_renewal_date date default null,
  p_year_end_date date default null,
  p_accounting_standard text default 'TFRS',
  p_vat_frequency text default 'MONTHLY',
  p_payroll_frequency text default 'MONTHLY',
  p_bookkeeping_enabled boolean default true,
  p_vat_enabled boolean default true,
  p_payroll_enabled boolean default false,
  p_tax_enabled boolean default true,
  p_reporting_enabled boolean default true,
  p_audit_enabled boolean default false,
  p_contact_name text default null,
  p_contact_email text default null,
  p_contact_phone text default null,
  p_tax_id text default null,
  p_vat_number text default null,
  p_position text default null,
  p_whatsapp text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_profile public.accounting_client_profiles%rowtype;
  v_engagement public.accounting_engagements%rowtype;
begin
  if p_accounting_firm_id is null or p_client_organization_id is null then
    raise exception 'ACCOUNTING_FIRM_AND_CLIENT_REQUIRED';
  end if;

  if p_accounting_firm_id = p_client_organization_id then
    raise exception 'ACCOUNTING_CLIENT_MUST_DIFFER_FROM_FIRM';
  end if;

  if p_billing_day is null or p_billing_day < 1 or p_billing_day > 28 then
    raise exception 'BILLING_DAY_OUT_OF_RANGE';
  end if;

  if coalesce(p_monthly_fee, 0) < 0 then
    raise exception 'MONTHLY_FEE_NEGATIVE';
  end if;

  perform 1 from public.organizations where id = p_accounting_firm_id;
  if not found then raise exception 'ACCOUNTING_FIRM_NOT_FOUND'; end if;

  perform 1 from public.organizations
  where id = p_client_organization_id
    and coalesce(upper(status), 'ACTIVE') not in ('INACTIVE','DISABLED','SUSPENDED','TERMINATED','ARCHIVED');
  if not found then raise exception 'CLIENT_ORGANIZATION_NOT_FOUND_OR_INACTIVE'; end if;

  if p_entity_id is not null then
    perform 1 from public.legal_entities
    where id = p_entity_id
      and organization_id = p_client_organization_id
      and coalesce(is_active, true) = true;
    if not found then raise exception 'CLIENT_ENTITY_NOT_FOUND_OR_INACTIVE'; end if;
  end if;

  insert into public.accounting_client_profiles (
    organization_id,
    accounting_firm_id,
    contact_name,
    contact_email,
    contact_phone,
    tax_id,
    vat_number,
    position,
    whatsapp,
    status
  )
  values (
    p_client_organization_id,
    p_accounting_firm_id,
    nullif(btrim(p_contact_name), ''),
    nullif(btrim(p_contact_email), ''),
    nullif(btrim(p_contact_phone), ''),
    nullif(btrim(p_tax_id), ''),
    nullif(btrim(p_vat_number), ''),
    nullif(btrim(p_position), ''),
    nullif(btrim(p_whatsapp), ''),
    'ACTIVE'
  )
  on conflict (accounting_firm_id, organization_id)
  do update set
    contact_name = coalesce(excluded.contact_name, accounting_client_profiles.contact_name),
    contact_email = coalesce(excluded.contact_email, accounting_client_profiles.contact_email),
    contact_phone = coalesce(excluded.contact_phone, accounting_client_profiles.contact_phone),
    tax_id = coalesce(excluded.tax_id, accounting_client_profiles.tax_id),
    vat_number = coalesce(excluded.vat_number, accounting_client_profiles.vat_number),
    position = coalesce(excluded.position, accounting_client_profiles.position),
    whatsapp = coalesce(excluded.whatsapp, accounting_client_profiles.whatsapp),
    status = 'ACTIVE',
    updated_at = now()
  returning * into v_profile;

  select *
  into v_engagement
  from public.accounting_engagements
  where accounting_firm_id = p_accounting_firm_id
    and organization_id = p_client_organization_id
    and upper(coalesce(status, '')) in ('ACTIVE', 'ENABLED')
  order by created_at asc, id asc
  limit 1
  for update;

  if found then
    return jsonb_build_object(
      'status', 'ALREADY_EXISTS',
      'created', false,
      'profile_id', v_profile.id,
      'engagement_id', v_engagement.id,
      'organization_id', v_engagement.organization_id,
      'entity_id', v_engagement.entity_id
    );
  end if;

  insert into public.accounting_engagements (
    organization_id,
    accounting_firm_id,
    entity_id,
    service_package,
    monthly_fee,
    billing_day,
    start_date,
    contract_start_date,
    renewal_date,
    year_end_date,
    accounting_standard,
    vat_frequency,
    payroll_frequency,
    bookkeeping_enabled,
    vat_enabled,
    payroll_enabled,
    tax_enabled,
    reporting_enabled,
    audit_enabled,
    status
  )
  values (
    p_client_organization_id,
    p_accounting_firm_id,
    p_entity_id,
    nullif(btrim(p_service_package), ''),
    coalesce(p_monthly_fee, 0),
    p_billing_day,
    p_start_date,
    p_contract_start_date,
    p_renewal_date,
    p_year_end_date,
    upper(coalesce(nullif(btrim(p_accounting_standard), ''), 'TFRS')),
    upper(coalesce(nullif(btrim(p_vat_frequency), ''), 'MONTHLY')),
    upper(coalesce(nullif(btrim(p_payroll_frequency), ''), 'MONTHLY')),
    coalesce(p_bookkeeping_enabled, true),
    coalesce(p_vat_enabled, true),
    coalesce(p_payroll_enabled, false),
    coalesce(p_tax_enabled, true),
    coalesce(p_reporting_enabled, true),
    coalesce(p_audit_enabled, false),
    'ACTIVE'
  )
  returning * into v_engagement;

  return jsonb_build_object(
    'status', 'CREATED',
    'created', true,
    'profile_id', v_profile.id,
    'engagement_id', v_engagement.id,
    'organization_id', v_engagement.organization_id,
    'entity_id', v_engagement.entity_id
  );
exception
  when unique_violation then
    select *
    into v_profile
    from public.accounting_client_profiles
    where accounting_firm_id = p_accounting_firm_id
      and organization_id = p_client_organization_id
    order by created_at asc nulls last, id asc
    limit 1;

    select *
    into v_engagement
    from public.accounting_engagements
    where accounting_firm_id = p_accounting_firm_id
      and organization_id = p_client_organization_id
      and upper(coalesce(status, '')) in ('ACTIVE', 'ENABLED')
    order by created_at asc, id asc
    limit 1;

    if v_engagement.id is not null then
      return jsonb_build_object(
        'status', 'ALREADY_EXISTS',
        'created', false,
        'profile_id', v_profile.id,
        'engagement_id', v_engagement.id,
        'organization_id', v_engagement.organization_id,
        'entity_id', v_engagement.entity_id
      );
    end if;
    raise;
end;
$$;

revoke all on function public.accounting_create_client_engagement_atomic(
  uuid,uuid,uuid,text,numeric,integer,date,date,date,date,text,text,text,
  boolean,boolean,boolean,boolean,boolean,boolean,text,text,text,text,text,text,text
) from public, anon, authenticated;

grant execute on function public.accounting_create_client_engagement_atomic(
  uuid,uuid,uuid,text,numeric,integer,date,date,date,date,text,text,text,
  boolean,boolean,boolean,boolean,boolean,boolean,text,text,text,text,text,text,text
) to service_role;

commit;
