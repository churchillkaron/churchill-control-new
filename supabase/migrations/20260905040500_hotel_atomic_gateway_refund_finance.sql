create or replace function public.hotel_finalize_gateway_refund_with_finance(
  p_transaction_id uuid,
  p_provider_event_id text default null,
  p_provider_refund_id text default null
) returns jsonb
language plpgsql
set search_path to 'public','pg_temp'
as $$
declare
  v_tx public.hotel_payment_transactions%rowtype;
  v_parent public.hotel_payment_transactions%rowtype;
  v_property public.hotel_properties%rowtype;
  v_bank_finance_account_id uuid;
  v_deposit_account_type text;
  v_finance jsonb;
  v_hotel jsonb;
  v_lines jsonb;
begin
  select * into v_tx
  from public.hotel_payment_transactions
  where id = p_transaction_id
  for update;

  if not found then raise exception 'HOTEL_GATEWAY_REFUND_FINANCE: transaction not found'; end if;
  if v_tx.processor_mode <> 'AVANTIQO_GATEWAY' then raise exception 'HOTEL_GATEWAY_REFUND_FINANCE: transaction is not gateway-managed'; end if;
  if v_tx.transaction_type <> 'REFUND' then raise exception 'HOTEL_GATEWAY_REFUND_FINANCE: transaction is not a refund'; end if;
  if v_tx.status = 'FAILED' then raise exception 'HOTEL_GATEWAY_REFUND_FINANCE: failed refund cannot settle'; end if;
  if v_tx.parent_transaction_id is null then raise exception 'HOTEL_GATEWAY_REFUND_FINANCE: parent payment is required'; end if;

  select * into v_parent
  from public.hotel_payment_transactions
  where id = v_tx.parent_transaction_id
    and organization_id = v_tx.organization_id
  for update;

  if not found then raise exception 'HOTEL_GATEWAY_REFUND_FINANCE: parent payment not found'; end if;
  if v_parent.status <> 'SETTLED' or v_parent.transaction_type not in ('PAYMENT','DEPOSIT') then
    raise exception 'HOTEL_GATEWAY_REFUND_FINANCE: parent must be a settled payment or deposit';
  end if;
  if v_parent.processor_mode <> 'AVANTIQO_GATEWAY' then raise exception 'HOTEL_GATEWAY_REFUND_FINANCE: parent is not gateway-managed'; end if;
  if v_parent.finance_payment_id is null then raise exception 'HOTEL_GATEWAY_REFUND_FINANCE: parent has no Finance prepayment'; end if;
  if v_parent.booking_id is distinct from v_tx.booking_id
     or v_parent.property_id is distinct from v_tx.property_id
     or v_parent.folio_id is distinct from v_tx.folio_id
     or v_parent.party_id is distinct from v_tx.party_id
     or v_parent.entity_id is distinct from v_tx.entity_id
     or v_parent.bank_account_id is distinct from v_tx.bank_account_id then
    raise exception 'HOTEL_GATEWAY_REFUND_FINANCE: refund scope differs from parent payment';
  end if;

  select * into v_property
  from public.hotel_properties
  where id = v_tx.property_id
    and organization_id = v_tx.organization_id;
  if not found then raise exception 'HOTEL_GATEWAY_REFUND_FINANCE: property not found'; end if;
  if v_property.finance_entity_id is distinct from v_tx.entity_id
     or v_property.settlement_bank_account_id is distinct from v_tx.bank_account_id then
    raise exception 'HOTEL_GATEWAY_REFUND_FINANCE: property Finance configuration changed';
  end if;
  if v_property.customer_deposit_account_id is null then
    raise exception 'HOTEL_GATEWAY_REFUND_FINANCE: customer deposit liability account is not configured';
  end if;

  select finance_account_id into v_bank_finance_account_id
  from public.bank_accounts
  where id = v_tx.bank_account_id
    and organization_id = v_tx.organization_id
    and entity_id = v_tx.entity_id
    and active = true;
  if v_bank_finance_account_id is null then raise exception 'HOTEL_GATEWAY_REFUND_FINANCE: settlement bank has no Finance ledger account'; end if;

  select account_type into v_deposit_account_type
  from public.chart_of_accounts
  where id = v_property.customer_deposit_account_id
    and organization_id = v_tx.organization_id
    and entity_id = v_tx.entity_id
    and is_active = true;
  if not found or upper(coalesce(v_deposit_account_type,'')) <> 'LIABILITY' then
    raise exception 'HOTEL_GATEWAY_REFUND_FINANCE: customer deposit account must be an active LIABILITY account';
  end if;

  v_lines := jsonb_build_array(
    jsonb_build_object(
      'account_id', v_property.customer_deposit_account_id,
      'debit', v_tx.amount,
      'credit', 0,
      'party_id', v_tx.party_id,
      'description', coalesce(v_tx.description, 'Hotel guest prepayment refund')
    ),
    jsonb_build_object(
      'account_id', v_bank_finance_account_id,
      'debit', 0,
      'credit', v_tx.amount,
      'party_id', v_tx.party_id,
      'description', coalesce(v_tx.description, 'Hotel guest refund cash outflow')
    )
  );

  select public.finance_refund_customer_unapplied_cash_party_idempotent(
    p_refund_id => v_tx.id,
    p_organization_id => v_tx.organization_id,
    p_entity_id => v_tx.entity_id,
    p_party_id => v_tx.party_id,
    p_payment_id => v_parent.finance_payment_id,
    p_refund_date => current_date,
    p_amount => v_tx.amount,
    p_bank_account_id => v_tx.bank_account_id,
    p_reference_number => coalesce(p_provider_refund_id, v_tx.external_reference, v_tx.id::text),
    p_refunded_by => v_tx.received_by,
    p_journal_lines => v_lines,
    p_idempotency_key => 'hotel-refund:' || v_tx.id::text
  ) into v_finance;

  update public.hotel_payment_transactions
  set finance_payment_id = v_parent.finance_payment_id,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'finance_posting_status', 'POSTED',
        'finance_refund_id', v_tx.id,
        'finance_parent_payment_id', v_parent.finance_payment_id
      ),
      updated_at = now()
  where id = v_tx.id;

  select public.hotel_finalize_gateway_transaction(
    p_transaction_id => v_tx.id,
    p_provider_event_id => p_provider_event_id,
    p_provider_payment_id => null,
    p_provider_refund_id => p_provider_refund_id
  ) into v_hotel;

  return jsonb_build_object(
    'transaction_id', v_tx.id,
    'finance_payment_id', v_parent.finance_payment_id,
    'finance_refund_id', v_tx.id,
    'finance', v_finance,
    'hotel', v_hotel
  );
end;
$$;

revoke all on function public.hotel_finalize_gateway_refund_with_finance(uuid,text,text) from public, anon, authenticated;
grant execute on function public.hotel_finalize_gateway_refund_with_finance(uuid,text,text) to service_role;
