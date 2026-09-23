create or replace function public.review_staff_work_permit_atomic(
  p_organization_id uuid,
  p_document_id uuid,
  p_manager_staff_id uuid,
  p_decision text,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_document public.enterprise_documents%rowtype;
  v_latest_document_id uuid;
  v_obligation public.compliance_obligations%rowtype;
  v_decision text := upper(trim(coalesce(p_decision, '')));
  v_now timestamptz := now();
  v_document_status text;
  v_obligation_status text;
  v_work_permit jsonb;
begin
  if p_organization_id is null or p_document_id is null or p_manager_staff_id is null then
    raise exception 'organization, document and manager are required';
  end if;

  if v_decision not in ('APPROVE', 'REJECT') then
    raise exception 'decision must be APPROVE or REJECT';
  end if;

  select *
    into v_document
  from public.enterprise_documents
  where organization_id = p_organization_id
    and id = p_document_id
    and document_type = 'STAFF_WORK_PERMIT'
  for update;

  if not found then
    raise exception 'work permit document not found';
  end if;

  if lower(coalesce(v_document.document_status, '')) <> 'pending_approval' then
    raise exception 'work permit has already been reviewed';
  end if;

  select id
    into v_latest_document_id
  from public.enterprise_documents
  where organization_id = p_organization_id
    and owner_staff_id = v_document.owner_staff_id
    and document_type = 'STAFF_WORK_PERMIT'
  order by updated_at desc, created_at desc, id desc
  limit 1;

  if v_latest_document_id is distinct from v_document.id then
    raise exception 'a newer work permit exists; review the latest submission';
  end if;

  select *
    into v_obligation
  from public.compliance_obligations
  where organization_id = p_organization_id
    and enterprise_document_id = p_document_id
    and source_type = 'STAFF_WORK_PERMIT'
  for update;

  if not found then
    raise exception 'work permit compliance obligation not found';
  end if;

  if upper(coalesce(v_obligation.status, '')) <> 'PENDING' then
    raise exception 'work permit compliance obligation has already been reviewed';
  end if;

  if v_decision = 'APPROVE' and v_document.expiry_date is not null and v_document.expiry_date < current_date then
    raise exception 'expired work permit cannot be approved as current';
  end if;

  v_document_status := case when v_decision = 'APPROVE' then 'active' else 'archived' end;
  v_obligation_status := case when v_decision = 'APPROVE' then 'ACTIVE' else 'CANCELLED' end;
  v_work_permit := coalesce(v_document.metadata -> 'work_permit', '{}'::jsonb)
    || jsonb_build_object(
      'review_status', case when v_decision = 'APPROVE' then 'VERIFIED' else 'REJECTED' end,
      'reviewed_at', v_now,
      'reviewed_by_staff_id', p_manager_staff_id,
      'review_notes', nullif(trim(coalesce(p_notes, '')), '')
    );

  update public.enterprise_documents
  set document_status = v_document_status,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('work_permit', v_work_permit),
      approved_by = case when v_decision = 'APPROVE' then p_manager_staff_id else null end,
      approved_at = case when v_decision = 'APPROVE' then v_now else null end,
      updated_at = v_now
  where id = v_document.id
    and organization_id = p_organization_id
    and document_status = v_document.document_status;

  if not found then
    raise exception 'work permit document changed during review';
  end if;

  update public.compliance_obligations
  set status = v_obligation_status,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'review_status', case when v_decision = 'APPROVE' then 'VERIFIED' else 'REJECTED' end,
        'reviewed_at', v_now,
        'reviewed_by_staff_id', p_manager_staff_id,
        'review_notes', nullif(trim(coalesce(p_notes, '')), '')
      ),
      updated_at = v_now
  where id = v_obligation.id
    and organization_id = p_organization_id
    and status = v_obligation.status;

  if not found then
    raise exception 'work permit obligation changed during review';
  end if;

  insert into public.enterprise_document_access_logs (
    organization_id,
    enterprise_document_id,
    accessed_by,
    access_type,
    metadata,
    accessed_at
  ) values (
    p_organization_id,
    p_document_id,
    p_manager_staff_id,
    'UPDATE',
    jsonb_build_object(
      'review_action', v_decision,
      'work_permit_review', true,
      'obligation_id', v_obligation.id
    ),
    v_now
  );

  return jsonb_build_object(
    'document_id', v_document.id,
    'document_status', v_document_status,
    'obligation_id', v_obligation.id,
    'obligation_status', v_obligation_status,
    'reviewed_at', v_now
  );
end;
$$;

revoke execute on function public.review_staff_work_permit_atomic(uuid, uuid, uuid, text, text) from public;
revoke execute on function public.review_staff_work_permit_atomic(uuid, uuid, uuid, text, text) from anon;
revoke execute on function public.review_staff_work_permit_atomic(uuid, uuid, uuid, text, text) from authenticated;
grant execute on function public.review_staff_work_permit_atomic(uuid, uuid, uuid, text, text) to service_role;
