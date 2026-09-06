create or replace function public.platform_create_acquisition_v2(
  p_seller_organization_id uuid,
  p_evidence_type text,
  p_evidence_reference text default null,
  p_note text default null,
  p_lead_id uuid default null,
  p_source text default null,
  p_source_reference text default null,
  p_next_due_at timestamptz default null,
  p_next_schedule_note text default null,
  p_owner_staff_account_id uuid default null
)
returns public.platform_acquisition_records
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_record public.platform_acquisition_records%rowtype;
begin
  if p_next_due_at is null then
    raise exception 'ACQUISITION_NEXT_OBLIGATION_DUE_REQUIRED';
  end if;
  if p_next_schedule_note is null or btrim(p_next_schedule_note) = '' then
    raise exception 'ACQUISITION_NEXT_OBLIGATION_NOTE_REQUIRED';
  end if;
  if p_owner_staff_account_id is null then
    raise exception 'ACQUISITION_NEXT_OBLIGATION_OWNER_REQUIRED';
  end if;

  select * into v_record
    from public.platform_create_acquisition(
      p_seller_organization_id,
      p_evidence_type,
      p_evidence_reference,
      p_note,
      p_lead_id,
      p_source,
      p_source_reference
    );

  perform public.platform_set_acquisition_obligation(
    v_record.id,
    p_seller_organization_id,
    'PROSPECT',
    'Record verified prospect identity and qualification evidence.',
    p_next_due_at,
    p_next_schedule_note,
    p_owner_staff_account_id,
    null
  );

  return v_record;
end;
$$;

create or replace function public.platform_transition_acquisition_v3(
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
  p_first_value_at timestamptz default null,
  p_next_due_at timestamptz default null,
  p_next_schedule_note text default null,
  p_owner_staff_account_id uuid default null
)
returns public.platform_acquisition_records
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_record public.platform_acquisition_records%rowtype;
  v_next_title text;
begin
  if p_to_stage not in ('FIRST_VALUE', 'LOST') then
    if p_next_due_at is null then
      raise exception 'ACQUISITION_NEXT_OBLIGATION_DUE_REQUIRED';
    end if;
    if p_next_schedule_note is null or btrim(p_next_schedule_note) = '' then
      raise exception 'ACQUISITION_NEXT_OBLIGATION_NOTE_REQUIRED';
    end if;
    if p_owner_staff_account_id is null then
      raise exception 'ACQUISITION_NEXT_OBLIGATION_OWNER_REQUIRED';
    end if;
  end if;

  select * into v_record
    from public.platform_transition_acquisition_v2(
      p_acquisition_id,
      p_seller_organization_id,
      p_expected_from_stage,
      p_to_stage,
      p_evidence_type,
      p_evidence_reference,
      p_note,
      p_prospect_company,
      p_prospect_contact,
      p_prospect_email,
      p_subscription_id,
      p_customer_organization_id,
      p_first_value_at
    );

  if p_to_stage not in ('FIRST_VALUE', 'LOST') then
    v_next_title := case p_to_stage
      when 'PROSPECT' then 'Record verified prospect identity and qualification evidence.'
      when 'QUALIFIED' then 'Record evidence that a real commercial commitment is being pursued.'
      when 'COMMITMENT_PENDING' then 'Verify the exact subscription tied to this prospect identity.'
      when 'COMMITTED' then 'Verify the customer organization already linked to the committed subscription.'
      when 'CUSTOMER_CREATED' then 'Re-read current organization users and prove at least one active human.'
      when 'HUMAN_ACTIVE' then 'Re-read metered service usage and prove the first successful use.'
      else 'Review canonical evidence before taking another action.'
    end;

    perform public.platform_set_acquisition_obligation(
      v_record.id,
      p_seller_organization_id,
      p_to_stage,
      v_next_title,
      p_next_due_at,
      p_next_schedule_note,
      p_owner_staff_account_id,
      null
    );
  end if;

  return v_record;
end;
$$;

revoke all on function public.platform_create_acquisition_v2(uuid,text,text,text,uuid,text,text,timestamptz,text,uuid) from public, anon, authenticated;
grant execute on function public.platform_create_acquisition_v2(uuid,text,text,text,uuid,text,text,timestamptz,text,uuid) to service_role;
revoke all on function public.platform_transition_acquisition_v3(uuid,uuid,text,text,text,text,text,text,text,text,uuid,uuid,timestamptz,timestamptz,text,uuid) from public, anon, authenticated;
grant execute on function public.platform_transition_acquisition_v3(uuid,uuid,text,text,text,text,text,text,text,text,uuid,uuid,timestamptz,timestamptz,text,uuid) to service_role;
