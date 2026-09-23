begin;

create or replace function public.commercial_customer_respond_quotation_atomic(
  p_organization_id uuid,
  p_party_id uuid,
  p_quotation_id uuid,
  p_action text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.commercial_quotations%rowtype;
  v_action text := upper(btrim(coalesce(p_action, '')));
  v_status text;
  v_event_type text;
  v_existing jsonb;
begin
  if p_organization_id is null or p_party_id is null or p_quotation_id is null then
    raise exception 'organization_id, party_id and quotation_id required';
  end if;
  if v_action not in ('ACCEPT', 'REJECT') then
    raise exception 'Customer quotation action must be ACCEPT or REJECT';
  end if;
  if nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'idempotency_key required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_organization_id::text || ':customer-quotation:' || p_quotation_id::text,
    0
  ));

  select event.payload into v_existing
  from public.system_events event
  where event.organization_id = p_organization_id
    and event.idempotency_key = btrim(p_idempotency_key)
  order by event.created_at asc
  limit 1;

  if found then
    if v_existing->>'quotation_id' is distinct from p_quotation_id::text
       or v_existing->>'party_id' is distinct from p_party_id::text
       or v_existing->>'action' is distinct from v_action then
      raise exception 'idempotency_key is already used by another operation';
    end if;
    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'quotation_id', p_quotation_id,
      'status', v_existing->>'status'
    );
  end if;

  select quotation.* into v_quote
  from public.commercial_quotations quotation
  where quotation.organization_id = p_organization_id
    and quotation.id = p_quotation_id
    and quotation.party_id = p_party_id
  for update;

  if not found then
    raise exception 'Quotation not found for customer Party';
  end if;
  if v_quote.status <> 'SENT' then
    raise exception 'Only sent quotations can receive a customer response';
  end if;
  if v_quote.valid_until < current_date then
    raise exception 'Expired quotation cannot be accepted or rejected';
  end if;

  if v_action = 'ACCEPT' then
    v_status := 'ACCEPTED';
    v_event_type := 'COMMERCIAL_QUOTATION_ACCEPTED_BY_CUSTOMER';
  else
    v_status := 'REJECTED';
    v_event_type := 'COMMERCIAL_QUOTATION_REJECTED_BY_CUSTOMER';
  end if;

  update public.commercial_quotations quotation
  set status = v_status,
      accepted_at = case when v_action = 'ACCEPT' then now() else quotation.accepted_at end,
      rejected_at = case when v_action = 'REJECT' then now() else quotation.rejected_at end,
      updated_at = now()
  where quotation.organization_id = p_organization_id
    and quotation.id = p_quotation_id
    and quotation.party_id = p_party_id
  returning quotation.* into v_quote;

  insert into public.system_events (
    organization_id,
    type,
    payload,
    idempotency_key
  ) values (
    p_organization_id,
    v_event_type,
    jsonb_build_object(
      'source', 'customer_portal',
      'quotation_id', v_quote.id,
      'quotation_number', v_quote.quotation_number,
      'entity_id', v_quote.entity_id,
      'party_id', p_party_id,
      'action', v_action,
      'status', v_quote.status,
      'customer_attributed', true
    ),
    btrim(p_idempotency_key)
  );

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'quotation_id', v_quote.id,
    'quotation_number', v_quote.quotation_number,
    'status', v_quote.status
  );
end;
$$;

revoke all on function public.commercial_customer_respond_quotation_atomic(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.commercial_customer_respond_quotation_atomic(uuid, uuid, uuid, text, text)
  to service_role;

comment on function public.commercial_customer_respond_quotation_atomic(uuid, uuid, uuid, text, text) is
  'Party-scoped atomic customer portal ACCEPT/REJECT response for a sent, unexpired quotation. Service-role only; caller must authenticate the customer portal session.';

commit;
