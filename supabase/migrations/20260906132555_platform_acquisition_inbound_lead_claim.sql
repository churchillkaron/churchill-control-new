create or replace function public.platform_claim_inbound_lead_v1(
  p_seller_organization_id uuid,
  p_lead_id uuid,
  p_claim_note text,
  p_next_due_at timestamptz,
  p_next_schedule_note text,
  p_owner_staff_account_id uuid
)
returns public.platform_acquisition_records
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_lead public.organization_leads%rowtype;
  v_record public.platform_acquisition_records%rowtype;
begin
  if p_seller_organization_id is null then
    raise exception 'ACQUISITION_SELLER_REQUIRED';
  end if;
  if p_lead_id is null then
    raise exception 'ACQUISITION_INBOUND_LEAD_REQUIRED';
  end if;
  if p_claim_note is null or btrim(p_claim_note) = '' then
    raise exception 'ACQUISITION_INBOUND_CLAIM_NOTE_REQUIRED';
  end if;
  if p_next_due_at is null then
    raise exception 'ACQUISITION_NEXT_OBLIGATION_DUE_REQUIRED';
  end if;
  if p_next_schedule_note is null or btrim(p_next_schedule_note) = '' then
    raise exception 'ACQUISITION_NEXT_OBLIGATION_NOTE_REQUIRED';
  end if;
  if p_owner_staff_account_id is null then
    raise exception 'ACQUISITION_NEXT_OBLIGATION_OWNER_REQUIRED';
  end if;

  select * into v_lead
  from public.organization_leads
  where id = p_lead_id
  for update;

  if not found then
    raise exception 'ACQUISITION_INBOUND_LEAD_NOT_FOUND';
  end if;

  if btrim(coalesce(v_lead.company, '')) = ''
     or btrim(coalesce(v_lead.contact, '')) = ''
     or btrim(coalesce(v_lead.email, '')) = '' then
    raise exception 'ACQUISITION_INBOUND_IDENTITY_INCOMPLETE';
  end if;

  if exists (
    select 1
    from public.platform_acquisition_records
    where seller_organization_id = p_seller_organization_id
      and lead_id = p_lead_id
  ) then
    raise exception 'ACQUISITION_INBOUND_LEAD_ALREADY_CLAIMED';
  end if;

  select * into v_record
  from public.platform_create_acquisition_v2(
    p_seller_organization_id,
    'PLATFORM_INBOUND_LEAD_CLAIMED',
    'organization_leads:' || v_lead.id::text,
    p_claim_note,
    v_lead.id,
    'INBOUND_LEAD',
    'organization_leads:' || v_lead.id::text,
    p_next_due_at,
    p_next_schedule_note,
    p_owner_staff_account_id
  );

  update public.platform_acquisition_records
  set prospect_company = btrim(v_lead.company),
      prospect_contact = btrim(v_lead.contact),
      prospect_email = lower(btrim(v_lead.email)),
      updated_at = now()
  where id = v_record.id
  returning * into v_record;

  return v_record;
end;
$$;

revoke all on function public.platform_claim_inbound_lead_v1(uuid,uuid,text,timestamptz,text,uuid)
from public, anon, authenticated;

grant execute on function public.platform_claim_inbound_lead_v1(uuid,uuid,text,timestamptz,text,uuid)
to service_role;
