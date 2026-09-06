begin;

create or replace function public.restaurant_settle_table_atomic(
  p_organization_id uuid,
  p_table_number text,
  p_amount numeric,
  p_tendered_amount numeric,
  p_payment_method text,
  p_partial boolean,
  p_item_ids uuid[],
  p_idempotency_key text,
  p_actor_id uuid,
  p_entity_id uuid,
  p_application_id text,
  p_cash_session_id uuid,
  p_currency_code text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
  v_payment_id uuid;
  v_payment public.payments%rowtype;
  v_method text := upper(pg_catalog.btrim(coalesce(p_payment_method, '')));
  v_paid numeric(18,2) := round(coalesce(p_amount, 0), 2);
  v_tendered numeric(18,2);
  v_change numeric(18,2);
  v_duplicate boolean;
begin
  if p_organization_id is null then raise exception 'organizationId required'; end if;
  if p_entity_id is null then raise exception 'entityId required'; end if;
  if nullif(pg_catalog.btrim(coalesce(p_idempotency_key, '')), '') is null then raise exception 'idempotencyKey required'; end if;
  if v_paid <= 0 then raise exception 'payment amount must be greater than zero'; end if;
  if v_method not in ('CASH', 'CARD', 'QR', 'TRANSFER') then raise exception 'Unsupported restaurant payment method'; end if;

  if v_method = 'CASH' then
    v_tendered := round(coalesce(p_tendered_amount, p_amount), 2);
    if v_tendered < v_paid then raise exception 'Cash received cannot be less than the payment amount'; end if;
    v_change := round(v_tendered - v_paid, 2);
  else
    v_tendered := v_paid;
    v_change := 0;
  end if;

  v_result := public.restaurant_settle_table_atomic(
    p_organization_id => p_organization_id,
    p_table_number => p_table_number,
    p_amount => v_paid,
    p_payment_method => v_method,
    p_partial => p_partial,
    p_item_ids => p_item_ids,
    p_idempotency_key => p_idempotency_key,
    p_actor_id => p_actor_id,
    p_entity_id => p_entity_id,
    p_application_id => p_application_id,
    p_cash_session_id => p_cash_session_id,
    p_currency_code => p_currency_code
  );

  v_payment_id := nullif(v_result->>'paymentId', '')::uuid;
  if v_payment_id is null then raise exception 'Atomic restaurant settlement returned no payment identity'; end if;

  select * into v_payment
  from public.payments
  where id = v_payment_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
  for update;

  if not found then raise exception 'Restaurant payment not found in selected organization and entity'; end if;

  v_duplicate := coalesce((v_result->>'duplicate')::boolean, false);

  if v_duplicate and v_payment.metadata ? 'cash_tender_evidence_recorded' then
    if abs(coalesce(v_payment.tendered_amount, v_paid) - v_tendered) > 0.01
       or abs(coalesce(v_payment.change_amount, 0) - v_change) > 0.01 then
      raise exception 'Idempotency key is already used with different cash tender evidence';
    end if;
  end if;

  update public.payments
  set tendered_amount = v_tendered,
      change_amount = v_change,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'cash_tender_evidence_recorded', true,
        'tendered_amount', v_tendered,
        'change_amount', v_change
      ),
      updated_at = now()
  where id = v_payment_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id;

  return v_result || jsonb_build_object(
    'tenderedAmount', v_tendered,
    'changeAmount', v_change
  );
end;
$$;

revoke all on function public.restaurant_settle_table_atomic(uuid,text,numeric,numeric,text,boolean,uuid[],text,uuid,uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function public.restaurant_settle_table_atomic(uuid,text,numeric,numeric,text,boolean,uuid[],text,uuid,uuid,text,uuid,text) to service_role;

commit;
