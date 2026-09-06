create or replace function public.platform_create_acquisition(
  p_seller_organization_id uuid,
  p_evidence_type text,
  p_evidence_reference text default null,
  p_note text default null,
  p_lead_id uuid default null,
  p_source text default null,
  p_source_reference text default null
)
returns public.platform_acquisition_records
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_record public.platform_acquisition_records%rowtype;
begin
  if p_evidence_type is null or btrim(p_evidence_type) = '' then
    raise exception 'ACQUISITION_EVIDENCE_REQUIRED';
  end if;

  insert into public.platform_acquisition_records (
    seller_organization_id,
    lead_id,
    stage,
    source,
    source_reference,
    stage_updated_at
  ) values (
    p_seller_organization_id,
    p_lead_id,
    'PROSPECT',
    nullif(btrim(p_source), ''),
    nullif(btrim(p_source_reference), ''),
    now()
  )
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
    null,
    'PROSPECT',
    p_evidence_type,
    p_evidence_reference,
    p_note,
    now()
  );

  return v_record;
end;
$$;

revoke all on function public.platform_create_acquisition(uuid, text, text, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.platform_create_acquisition(uuid, text, text, text, uuid, text, text) to service_role;
