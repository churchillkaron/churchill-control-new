create or replace function public.platform_transition_acquisition(
  p_acquisition_id uuid,
  p_seller_organization_id uuid,
  p_expected_from_stage text,
  p_to_stage text,
  p_evidence_type text,
  p_evidence_reference text default null,
  p_note text default null,
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

  if p_evidence_type is null or btrim(p_evidence_type) = '' then
    raise exception 'ACQUISITION_EVIDENCE_REQUIRED';
  end if;

  if not (
    (v_record.stage = 'PROSPECT' and p_to_stage in ('QUALIFIED', 'LOST')) or
    (v_record.stage = 'QUALIFIED' and p_to_stage in ('COMMITMENT_PENDING', 'LOST')) or
    (v_record.stage = 'COMMITMENT_PENDING' and p_to_stage in ('COMMITTED', 'LOST')) or
    (v_record.stage = 'COMMITTED' and p_to_stage in ('CUSTOMER_CREATED', 'LOST')) or
    (v_record.stage = 'CUSTOMER_CREATED' and p_to_stage = 'HUMAN_ACTIVE') or
    (v_record.stage = 'HUMAN_ACTIVE' and p_to_stage = 'FIRST_VALUE')
  ) then
    raise exception 'ACQUISITION_TRANSITION_NOT_ALLOWED:%:%', v_record.stage, p_to_stage;
  end if;

  if p_to_stage = 'COMMITTED' and coalesce(p_subscription_id, v_record.subscription_id) is null then
    raise exception 'ACQUISITION_SUBSCRIPTION_REQUIRED';
  end if;

  if p_to_stage in ('CUSTOMER_CREATED', 'HUMAN_ACTIVE', 'FIRST_VALUE')
     and coalesce(p_customer_organization_id, v_record.customer_organization_id) is null then
    raise exception 'ACQUISITION_CUSTOMER_ORGANIZATION_REQUIRED';
  end if;

  if p_to_stage = 'FIRST_VALUE' and p_first_value_at is null then
    raise exception 'ACQUISITION_FIRST_VALUE_TIMESTAMP_REQUIRED';
  end if;

  update public.platform_acquisition_records
     set stage = p_to_stage,
         subscription_id = coalesce(p_subscription_id, subscription_id),
         customer_organization_id = coalesce(p_customer_organization_id, customer_organization_id),
         first_value_at = case when p_to_stage = 'FIRST_VALUE' then p_first_value_at else first_value_at end,
         stage_updated_at = now(),
         updated_at = now()
   where id = p_acquisition_id
   returning * into v_record;

  insert into public.platform_acquisition_events (
    acquisition_id,
    seller_organization_id,
    from_stage,
    to_stage,
    evidence_type,
    evidence_reference,
    note,
    occurred_at
  ) values (
    v_record.id,
    p_seller_organization_id,
    p_expected_from_stage,
    p_to_stage,
    p_evidence_type,
    p_evidence_reference,
    p_note,
    now()
  );

  return v_record;
end;
$$;

revoke all on function public.platform_transition_acquisition(uuid, uuid, text, text, text, text, text, uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.platform_transition_acquisition(uuid, uuid, text, text, text, text, text, uuid, uuid, timestamptz) to service_role;
