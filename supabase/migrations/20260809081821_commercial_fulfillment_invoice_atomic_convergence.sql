create or replace function public.commercial_fulfill_and_invoice_sales_order_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_sales_order_id uuid,
  p_actor_id uuid,
  p_fulfillment_idempotency_key text,
  p_invoice_id uuid,
  p_party_id uuid,
  p_invoice_date date,
  p_due_date date,
  p_currency_code text,
  p_exchange_rate numeric,
  p_subtotal numeric,
  p_tax_amount numeric,
  p_total_amount numeric,
  p_notes text,
  p_lines jsonb,
  p_journal_lines jsonb,
  p_invoice_idempotency_key text,
  p_prefix text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fulfillment jsonb;
  v_invoice jsonb;
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;
  if p_entity_id is null then
    raise exception 'entity_id required';
  end if;
  if p_sales_order_id is null then
    raise exception 'sales_order_id required';
  end if;
  if p_actor_id is null then
    raise exception 'authenticated actor required';
  end if;
  if p_party_id is null then
    raise exception 'party_id required';
  end if;

  v_fulfillment := public.inventory_fulfill_sales_order_atomic(
    p_organization_id,
    p_entity_id,
    p_sales_order_id,
    p_actor_id,
    p_fulfillment_idempotency_key
  );

  v_invoice := public.finance_create_customer_invoice_party_idempotent(
    p_invoice_id,
    p_organization_id,
    p_entity_id,
    p_party_id,
    p_invoice_date,
    p_due_date,
    p_currency_code,
    p_exchange_rate,
    p_subtotal,
    p_tax_amount,
    p_total_amount,
    p_notes,
    p_lines,
    p_journal_lines,
    p_actor_id,
    p_invoice_idempotency_key,
    p_prefix,
    'SALES_ORDER',
    p_sales_order_id
  );

  return jsonb_build_object(
    'success', true,
    'organization_id', p_organization_id,
    'entity_id', p_entity_id,
    'sales_order_id', p_sales_order_id,
    'party_id', p_party_id,
    'fulfillment', v_fulfillment,
    'invoice', v_invoice
  );
end;
$$;

revoke all on function public.commercial_fulfill_and_invoice_sales_order_atomic(
  uuid, uuid, uuid, uuid, text, uuid, uuid, date, date, text, numeric,
  numeric, numeric, numeric, text, jsonb, jsonb, text, text
) from public;
revoke all on function public.commercial_fulfill_and_invoice_sales_order_atomic(
  uuid, uuid, uuid, uuid, text, uuid, uuid, date, date, text, numeric,
  numeric, numeric, numeric, text, jsonb, jsonb, text, text
) from anon;
revoke all on function public.commercial_fulfill_and_invoice_sales_order_atomic(
  uuid, uuid, uuid, uuid, text, uuid, uuid, date, date, text, numeric,
  numeric, numeric, numeric, text, jsonb, jsonb, text, text
) from authenticated;
grant execute on function public.commercial_fulfill_and_invoice_sales_order_atomic(
  uuid, uuid, uuid, uuid, text, uuid, uuid, date, date, text, numeric,
  numeric, numeric, numeric, text, jsonb, jsonb, text, text
) to service_role;
