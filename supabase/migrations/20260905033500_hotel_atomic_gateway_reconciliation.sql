create or replace function public.hotel_finalize_gateway_transaction(
  p_transaction_id uuid,
  p_provider_event_id text default null,
  p_provider_payment_id text default null,
  p_provider_refund_id text default null
) returns jsonb
language plpgsql
set search_path to 'public','pg_temp'
as $$
declare
  v_tx public.hotel_payment_transactions%rowtype;
  v_folio public.hotel_folios%rowtype;
  v_line_id uuid;
  v_net_paid numeric := 0;
  v_total numeric := 0;
  v_payment_status text := 'UNPAID';
begin
  select * into v_tx
  from public.hotel_payment_transactions
  where id = p_transaction_id
  for update;

  if not found then raise exception 'HOTEL_GATEWAY: transaction not found'; end if;
  if v_tx.processor_mode <> 'AVANTIQO_GATEWAY' then raise exception 'HOTEL_GATEWAY: transaction is not gateway-managed'; end if;

  if v_tx.status = 'SETTLED' then
    return jsonb_build_object('transaction_id', v_tx.id, 'status', v_tx.status, 'unchanged', true, 'folio_line_id', v_tx.folio_line_id);
  end if;
  if v_tx.status = 'FAILED' then raise exception 'HOTEL_GATEWAY: failed transaction cannot settle'; end if;

  select * into v_folio from public.hotel_folios
  where id = v_tx.folio_id and organization_id = v_tx.organization_id
  for update;
  if not found then raise exception 'HOTEL_GATEWAY: folio not found'; end if;
  if v_folio.status <> 'OPEN' then raise exception 'HOTEL_GATEWAY: folio is closed'; end if;

  if v_tx.transaction_type in ('PAYMENT','DEPOSIT') then
    select id into v_line_id
    from public.hotel_folio_lines
    where organization_id = v_tx.organization_id
      and folio_id = v_folio.id
      and source_type = 'HOTEL_PAYMENT_TRANSACTION'
      and source_id = v_tx.id::text
      and voided_at is null
    limit 1;

    if v_line_id is null then
      insert into public.hotel_folio_lines (
        organization_id, folio_id, line_type, description, amount, tax_amount,
        source_type, source_id, finance_reference_id, metadata
      ) values (
        v_tx.organization_id,
        v_folio.id,
        case when v_tx.transaction_type = 'DEPOSIT' then 'DEPOSIT_REFERENCE' else 'PAYMENT_REFERENCE' end,
        coalesce(v_tx.description, case when v_tx.transaction_type = 'DEPOSIT' then 'Processed hotel deposit' else 'Processed hotel payment' end),
        -abs(v_tx.amount),
        0,
        'HOTEL_PAYMENT_TRANSACTION',
        v_tx.id::text,
        v_tx.finance_payment_id,
        jsonb_build_object('processor_mode', v_tx.processor_mode, 'provider', v_tx.provider, 'gateway_confirmed', true)
      ) returning id into v_line_id;
    end if;

    update public.hotel_payment_transactions
    set status = 'SETTLED',
        applied_amount = amount - refunded_amount,
        provider_event_id = coalesce(p_provider_event_id, provider_event_id),
        provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
        folio_line_id = coalesce(v_line_id, folio_line_id),
        settled_at = coalesce(settled_at, now()),
        updated_at = now(),
        failure_reason = null
    where id = v_tx.id;
  elsif v_tx.transaction_type = 'REFUND' then
    if v_tx.parent_transaction_id is null then raise exception 'HOTEL_GATEWAY: refund requires parent transaction'; end if;

    perform 1 from public.hotel_payment_transactions
    where id = v_tx.parent_transaction_id
      and organization_id = v_tx.organization_id
      and status = 'SETTLED'
      and transaction_type in ('PAYMENT','DEPOSIT')
    for update;
    if not found then raise exception 'HOTEL_GATEWAY: refundable parent not found'; end if;

    update public.hotel_payment_transactions
    set applied_amount = greatest(applied_amount - v_tx.amount, 0),
        refunded_amount = refunded_amount + v_tx.amount,
        updated_at = now()
    where id = v_tx.parent_transaction_id
      and refunded_amount + v_tx.amount <= amount + 0.005;
    if not found then raise exception 'HOTEL_GATEWAY: refund exceeds remaining refundable amount'; end if;

    select id into v_line_id
    from public.hotel_folio_lines
    where organization_id = v_tx.organization_id
      and folio_id = v_folio.id
      and source_type = 'HOTEL_PAYMENT_TRANSACTION'
      and source_id = v_tx.id::text
      and voided_at is null
    limit 1;

    if v_line_id is null then
      insert into public.hotel_folio_lines (
        organization_id, folio_id, line_type, description, amount, tax_amount,
        source_type, source_id, finance_reference_id, metadata
      ) values (
        v_tx.organization_id, v_folio.id, 'REFUND_REFERENCE',
        coalesce(v_tx.description, 'Processed hotel refund'), abs(v_tx.amount), 0,
        'HOTEL_PAYMENT_TRANSACTION', v_tx.id::text, v_tx.finance_payment_id,
        jsonb_build_object('processor_mode', v_tx.processor_mode, 'provider', v_tx.provider, 'gateway_confirmed', true, 'parent_transaction_id', v_tx.parent_transaction_id)
      ) returning id into v_line_id;
    end if;

    update public.hotel_payment_transactions
    set status = 'SETTLED',
        provider_event_id = coalesce(p_provider_event_id, provider_event_id),
        provider_refund_id = coalesce(p_provider_refund_id, provider_refund_id),
        folio_line_id = coalesce(v_line_id, folio_line_id),
        settled_at = coalesce(settled_at, now()),
        updated_at = now(),
        failure_reason = null
    where id = v_tx.id;
  else
    raise exception 'HOTEL_GATEWAY: unsupported transaction type';
  end if;

  select coalesce(sum(applied_amount),0) into v_net_paid
  from public.hotel_payment_transactions
  where organization_id = v_tx.organization_id
    and booking_id = v_tx.booking_id
    and transaction_type in ('PAYMENT','DEPOSIT')
    and status = 'SETTLED';

  select coalesce(total_amount,0) into v_total from public.hotel_bookings
  where id = v_tx.booking_id and organization_id = v_tx.organization_id;

  v_payment_status := case
    when v_net_paid <= 0.005 then 'UNPAID'
    when v_total > 0 and v_net_paid + 0.005 >= v_total then 'PAID'
    else 'PARTIAL'
  end;

  update public.hotel_bookings
  set paid_amount = v_net_paid,
      payment_status = v_payment_status,
      updated_at = now()
  where id = v_tx.booking_id and organization_id = v_tx.organization_id;

  update public.hotel_folios set updated_at = now() where id = v_folio.id;

  return jsonb_build_object('transaction_id', v_tx.id, 'status', 'SETTLED', 'folio_line_id', v_line_id, 'booking_paid_amount', v_net_paid, 'booking_payment_status', v_payment_status);
end;
$$;

revoke all on function public.hotel_finalize_gateway_transaction(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.hotel_finalize_gateway_transaction(uuid,text,text,text) to service_role;
