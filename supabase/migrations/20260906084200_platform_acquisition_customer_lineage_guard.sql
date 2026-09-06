create or replace function public.platform_transition_acquisition_v2(
  p_acquisition_id uuid,
  p_seller_organization_id uuid,
  p_expected_from_stage text,
  p_to_stage text,
  p_evidence_type text,
  p_evidence_reference text default null,
  p_note text default null,
  p_prospect_company text default null,
  p_prospect_contact text default null,
  p_prospect_email text default null,
  p_subscription_id uuid default null,
  p_customer_organization_id uuid default null,
  p_first_value_at timestamptz default null
)
returns public.platform_acquisition_records
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_record public.platform_acquisition_records%rowtype;
  v_subscription public.subscriptions%rowtype;
  v_lead public.organization_leads%rowtype;
  v_company text;
  v_contact text;
  v_email text;
begin
  select *
    into v_record
    from public.platform_acquisition_records
   where id = p_acquisition_id
     and seller_organization_id = p_seller_organization_id
   for update;

  if not found then
    raise exception 'ACQUISITION_NOT_FOUND';
  end if;

  if v_record.stage <> p_expected_from_stage then
    raise exception 'ACQUISITION_STAGE_CONFLICT:%:%', v_record.stage, p_expected_from_stage;
  end if;

  if p_to_stage = 'QUALIFIED' then
    v_company := coalesce(nullif(btrim(p_prospect_company), ''), nullif(btrim(v_record.prospect_company), ''));
    v_contact := coalesce(nullif(btrim(p_prospect_contact), ''), nullif(btrim(v_record.prospect_contact), ''));
    v_email := lower(coalesce(nullif(btrim(p_prospect_email), ''), nullif(btrim(v_record.prospect_email), '')));

    if v_company is null or v_contact is null or v_email is null then
      raise exception 'ACQUISITION_PROSPECT_IDENTITY_REQUIRED';
    end if;

    update public.platform_acquisition_records
       set prospect_company = v_company,
           prospect_contact = v_contact,
           prospect_email = v_email,
           updated_at = now()
     where id = p_acquisition_id
     returning * into v_record;
  end if;

  if p_to_stage = 'COMMITTED' then
    if p_subscription_id is null and v_record.subscription_id is null then
      raise exception 'ACQUISITION_SUBSCRIPTION_REQUIRED';
    end if;

    select *
      into v_subscription
      from public.subscriptions
     where id = coalesce(p_subscription_id, v_record.subscription_id);

    if not found then
      raise exception 'ACQUISITION_SUBSCRIPTION_NOT_FOUND';
    end if;

    if v_subscription.lead_id is null then
      raise exception 'ACQUISITION_SUBSCRIPTION_LEAD_REQUIRED';
    end if;

    select *
      into v_lead
      from public.organization_leads
     where id = v_subscription.lead_id;

    if not found then
      raise exception 'ACQUISITION_LEAD_NOT_FOUND';
    end if;

    if v_record.lead_id is not null and v_record.lead_id <> v_subscription.lead_id then
      raise exception 'ACQUISITION_SUBSCRIPTION_LEAD_MISMATCH';
    end if;

    if v_record.prospect_email is null
       or lower(btrim(v_lead.email)) <> lower(btrim(v_record.prospect_email)) then
      raise exception 'ACQUISITION_SUBSCRIPTION_PROSPECT_IDENTITY_MISMATCH';
    end if;

    update public.platform_acquisition_records
       set lead_id = v_subscription.lead_id,
           updated_at = now()
     where id = p_acquisition_id
     returning * into v_record;
  end if;

  if p_to_stage = 'CUSTOMER_CREATED' then
    if v_record.subscription_id is null then
      raise exception 'ACQUISITION_SUBSCRIPTION_REQUIRED_BEFORE_CUSTOMER';
    end if;
    if p_customer_organization_id is null then
      raise exception 'ACQUISITION_CUSTOMER_ORGANIZATION_REQUIRED';
    end if;

    select *
      into v_subscription
      from public.subscriptions
     where id = v_record.subscription_id;

    if not found then
      raise exception 'ACQUISITION_SUBSCRIPTION_NOT_FOUND';
    end if;
    if v_subscription.organization_id is null then
      raise exception 'ACQUISITION_SUBSCRIPTION_CUSTOMER_NOT_PROVEN';
    end if;
    if v_subscription.organization_id <> p_customer_organization_id then
      raise exception 'ACQUISITION_CUSTOMER_SUBSCRIPTION_MISMATCH';
    end if;
    if v_record.lead_id is null or v_subscription.lead_id <> v_record.lead_id then
      raise exception 'ACQUISITION_CUSTOMER_LEAD_LINEAGE_MISMATCH';
    end if;
  end if;

  return public.platform_transition_acquisition(
    p_acquisition_id,
    p_seller_organization_id,
    p_expected_from_stage,
    p_to_stage,
    p_evidence_type,
    p_evidence_reference,
    p_note,
    p_subscription_id,
    p_customer_organization_id,
    p_first_value_at
  );
end;
$$;

revoke all on function public.platform_transition_acquisition_v2(uuid, uuid, text, text, text, text, text, text, text, text, uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.platform_transition_acquisition_v2(uuid, uuid, text, text, text, text, text, text, text, text, uuid, uuid, timestamptz) to service_role;