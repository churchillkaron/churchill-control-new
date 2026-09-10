-- Canonical atomic supplier-master creation for all organizations.
-- Creates/reuses Party + supplier relationship + supplier profile in one transaction.

alter table public.supplier_profiles
  add column if not exists source_idempotency_key text;

create unique index if not exists ux_supplier_profiles_org_idempotency
  on public.supplier_profiles (organization_id, source_idempotency_key)
  where source_idempotency_key is not null;

create index if not exists idx_supplier_profiles_org_vendor_code
  on public.supplier_profiles (organization_id, vendor_code)
  where vendor_code is not null;

create or replace function public.procurement_create_supplier_atomic(
  p_organization_id uuid,
  p_vendor_code text,
  p_legal_name text,
  p_display_name text,
  p_tax_id text,
  p_email text,
  p_phone text,
  p_address text,
  p_payment_terms text,
  p_default_expense_account uuid,
  p_default_ap_account uuid,
  p_risk_level text,
  p_notes text,
  p_actor_id uuid,
  p_idempotency_key text
) returns jsonblanguage plpgsql
security invoker
set search_path = ''
as $$
declare
  v_party_id uuid;
  v_profile record;
  v_existing_ids uuid[] := '{}';
  v_now timestamptz := clock_timestamp();
begin
  if p_organization_id is null then raise exception 'organization_id required'; end if;
  if nullif(btrim(coalesce(p_legal_name,'')), '') is null then raise exception 'legal_name required'; end if;
  if nullif(btrim(coalesce(p_idempotency_key,'')), '') is null then raise exception 'idempotency_key required'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('procurement:supplier:' || p_organization_id::text, 0)
  );

  select sp.* into v_profile
  from public.supplier_profiles sp
  where sp.organization_id = p_organization_id
    and sp.source_idempotency_key = p_idempotency_key
  limit 1;
  if found then
    return jsonb_build_object('success', true, 'reused', true,
      'party_id', v_profile.party_id, 'supplier_profile_id', v_profile.id);
  end if;
  if nullif(btrim(coalesce(p_vendor_code,'')), '') is not null then
    select array_agg(distinct sp.party_id) into v_existing_ids
    from public.supplier_profiles sp
    where sp.organization_id = p_organization_id
      and sp.vendor_code = p_vendor_code;
    if coalesce(array_length(v_existing_ids,1),0) > 1 then
      raise exception 'SUPPLIER_VENDOR_CODE_AMBIGUOUS';
    end if;
    if coalesce(array_length(v_existing_ids,1),0) = 1 then
      v_party_id := v_existing_ids[1];
    end if;
  end if;

  if nullif(btrim(coalesce(p_tax_id,'')), '') is not null then
    select array_agg(distinct p.id) into v_existing_ids
    from public.parties p
    where p.organization_id = p_organization_id and p.tax_id = p_tax_id;
    if coalesce(array_length(v_existing_ids,1),0) > 1 then raise exception 'SUPPLIER_TAX_ID_AMBIGUOUS'; end if;
    if coalesce(array_length(v_existing_ids,1),0) = 1 then
      if v_party_id is not null and v_party_id <> v_existing_ids[1] then raise exception 'SUPPLIER_IDENTITY_CONFLICT'; end if;
      v_party_id := v_existing_ids[1];
    end if;
  end if;

  if nullif(btrim(coalesce(p_email,'')), '') is not null then
    select array_agg(distinct p.id) into v_existing_ids
    from public.parties p
    where p.organization_id = p_organization_id and p.email = p_email;
    if coalesce(array_length(v_existing_ids,1),0) > 1 then raise exception 'SUPPLIER_EMAIL_AMBIGUOUS'; end if;
    if coalesce(array_length(v_existing_ids,1),0) = 1 then
      if v_party_id is not null and v_party_id <> v_existing_ids[1] then raise exception 'SUPPLIER_IDENTITY_CONFLICT'; end if;
      v_party_id := v_existing_ids[1];
    end if;
  end if;
  if v_party_id is not null then
    select sp.* into v_profile
    from public.supplier_profiles sp
    where sp.organization_id = p_organization_id and sp.party_id = v_party_id
    order by sp.created_at asc, sp.id asc
    limit 1;
    if found then
      return jsonb_build_object('success', true, 'reused', true,
        'party_id', v_profile.party_id, 'supplier_profile_id', v_profile.id);
    end if;
  end if;

  if p_default_expense_account is not null and not exists (
    select 1 from public.chart_of_accounts coa
    where coa.organization_id = p_organization_id and coa.id = p_default_expense_account and coalesce(coa.is_active,true)
  ) then raise exception 'SUPPLIER_DEFAULT_EXPENSE_ACCOUNT_INVALID'; end if;

  if p_default_ap_account is not null and not exists (
    select 1 from public.chart_of_accounts coa
    where coa.organization_id = p_organization_id and coa.id = p_default_ap_account and coalesce(coa.is_active,true)
  ) then raise exception 'SUPPLIER_DEFAULT_AP_ACCOUNT_INVALID'; end if;

  if v_party_id is null then
    insert into public.parties (
      organization_id, party_type, legal_name, display_name, tax_id, email, phone, address, status, created_at, updated_at
    ) values (
      p_organization_id, 'company', btrim(p_legal_name), coalesce(nullif(btrim(p_display_name),''),btrim(p_legal_name)),
      nullif(btrim(p_tax_id),''), nullif(btrim(p_email),''), nullif(btrim(p_phone),''), nullif(btrim(p_address),''),
      'ACTIVE', v_now, v_now
    ) returning id into v_party_id;
  end if;

  if not exists (
    select 1 from public.party_relationships pr
    where pr.organization_id = p_organization_id
      and pr.party_id = v_party_id
      and lower(pr.relationship_type) = 'supplier'
      and coalesce(lower(pr.status),'active') <> 'archived'
  ) then
    insert into public.party_relationships (
      party_id, organization_id, relationship_type, status, metadata, created_at, updated_at
    ) values (
      v_party_id, p_organization_id, 'supplier', 'ACTIVE',
      jsonb_build_object('vendor_code', nullif(btrim(p_vendor_code),'')), v_now, v_now
    );
  end if;

  insert into public.supplier_profiles (
    organization_id, party_id, vendor_code, payment_terms, default_expense_account, default_ap_account,
    risk_level, is_active, is_blocked, notes, source_idempotency_key, created_at, updated_at
  ) values (
    p_organization_id, v_party_id, nullif(btrim(p_vendor_code),''), nullif(btrim(p_payment_terms),''),
    p_default_expense_account, p_default_ap_account, coalesce(nullif(upper(btrim(p_risk_level)),''),'LOW'),
    true, false, nullif(btrim(p_notes),''), p_idempotency_key, v_now, v_now
  ) returning * into v_profile;

  return jsonb_build_object('success', true, 'reused', false,
    'party_id', v_party_id, 'supplier_profile_id', v_profile.id);
end;
$$;

revoke all on function public.procurement_create_supplier_atomic(uuid,text,text,text,text,text,text,text,text,uuid,uuid,text,text,uuid,text) from public, anon, authenticated;
grant execute on function public.procurement_create_supplier_atomic(uuid,text,text,text,text,text,text,text,text,uuid,uuid,text,text,uuid,text) to service_role;
