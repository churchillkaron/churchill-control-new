begin;

create unique index if not exists secretary_tasks_message_attachment_review_uidx
  on public.secretary_tasks ((metadata->>'secretary_reception_request_id'))
  where source = 'secretary_message_attachment'
    and metadata ? 'secretary_reception_request_id';

create or replace function public.secretary_ensure_attachment_review_task(
  p_request_id uuid,
  p_contact_party_id uuid default null,
  p_owner_party_id uuid default null,
  p_attachment_count integer default 1
)
returns public.secretary_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.secretary_message_reception_requests%rowtype;
  v_task public.secretary_tasks%rowtype;
begin
  if p_request_id is null then
    raise exception 'SECRETARY_MESSAGE_REQUEST_REQUIRED' using errcode = '22023';
  end if;

  select * into v_request
  from public.secretary_message_reception_requests
  where id = p_request_id
  for update;
  if not found then
    raise exception 'SECRETARY_MESSAGE_REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_task
  from public.secretary_tasks
  where organization_id = v_request.organization_id
    and source = 'secretary_message_attachment'
    and metadata->>'secretary_reception_request_id' = v_request.id::text
  limit 1;

  if found then
    return v_task;
  end if;

  insert into public.secretary_tasks (
    organization_id,
    owner_party_id,
    contact_party_id,
    title,
    details,
    status,
    priority,
    source,
    metadata
  ) values (
    v_request.organization_id,
    p_owner_party_id,
    coalesce(p_contact_party_id, v_request.contact_party_id),
    'Review incoming attachment',
    'An outside sender sent ' || greatest(1, coalesce(p_attachment_count, 1))::text || ' attachment(s) without message text. Review the original Communications conversation.',
    'OPEN',
    'NORMAL',
    'secretary_message_attachment',
    jsonb_build_object(
      'secretary_reception_request_id', v_request.id,
      'conversation_id', v_request.conversation_id,
      'inbound_message_id', v_request.inbound_message_id,
      'attachment_count', greatest(1, coalesce(p_attachment_count, 1)),
      'restricted_message_authority', true
    )
  )
  returning * into v_task;

  return v_task;
end;
$$;

revoke all on function public.secretary_ensure_attachment_review_task(uuid, uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.secretary_ensure_attachment_review_task(uuid, uuid, uuid, integer)
  to service_role;

comment on function public.secretary_ensure_attachment_review_task(uuid, uuid, uuid, integer) is
  'Creates exactly one native Secretary review task for an attachment-only inbound Communications message instead of silently discarding it.';

commit;
