-- Post-checkout Hotel refunds are current financial adjustments, not rewrites of certified stay history.
-- A closed folio may only be refunded once the stay is CHECKED_OUT. The provider request is rejected
-- before money moves if that invariant is not true. Settlement records current Hotel business-day
-- evidence when available, posts Finance through the existing atomic refund wrapper, and leaves the
-- certified booking and closed folio untouched.

alter table public.hotel_payment_transactions
  add column if not exists settlement_business_date date;

comment on column public.hotel_payment_transactions.settlement_business_date is
  'Governed Hotel property business date on which gateway settlement was recorded. This is operational evidence and does not replace the Finance posting/refund date.';

create index if not exists hotel_payment_transactions_settlement_business_date_idx
  on public.hotel_payment_transactions(organization_id, property_id, settlement_business_date)
  where status = 'SETTLED';

create or replace function public.hotel_refund_request_guard()
returns trigger
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_folio public.hotel_folios%rowtype;
  v_booking public.hotel_bookings%rowtype;
  v_folio_status text;
  v_booking_status text;
begin
  if upper(coalesce(new.transaction_type, '')) <> 'REFUND' then
    return new;
  end if;

  if new.organization_id is null or new.booking_id is null or new.folio_id is null then
    raise exception 'HOTEL_REFUND: organization, booking and folio are required before provider refund';
  end if;

  select * into v_folio
  from public.hotel_folios f
  where f.organization_id = new.organization_id
    and f.id = new.folio_id;
  if not found then
    raise exception 'HOTEL_REFUND: folio not found before provider refund';
  end if;

  if v_folio.booking_id is distinct from new.booking_id then
    raise exception 'HOTEL_REFUND: refund folio does not belong to the booking';
  end if;

  select * into v_booking
  from public.hotel_bookings b
  where b.organization_id = new.organization_id
    and b.id = new.booking_id;
  if not found then
    raise exception 'HOTEL_REFUND: booking not found before provider refund';
  end if;

  if v_booking.property_id is distinct from new.property_id
     or v_folio.property_id is distinct from new.property_id then
    raise exception 'HOTEL_REFUND: refund scope does not match booking and folio property';
  end if;

  v_folio_status := upper(coalesce(v_folio.status, ''));
  v_booking_status := upper(coalesce(v_booking.status, ''));

  if v_folio_status = 'CLOSED' then
    if v_booking_status <> 'CHECKED_OUT' then
      raise exception 'HOTEL_REFUND: a closed folio can only be refunded after checkout; use a governed stay correction before provider refund';
    end if;

    new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
      'post_checkout_adjustment', true,
      'closed_folio_immutable', true,
      'certified_booking_immutable', true
    );
  elsif v_folio_status <> 'OPEN' then
    raise exception 'HOTEL_REFUND: folio is not in a refundable state';
  end if;

  return new;
end;
$function$;

drop trigger if exists hotel_payment_transactions_refund_request_guard on public.hotel_payment_transactions;
create trigger hotel_payment_transactions_refund_request_guard
before insert on public.hotel_payment_transactions
for each row execute function public.hotel_refund_request_guard();

create or replace function public.hotel_finalize_gateway_transaction(
  p_transaction_id uuid,
  p_provider_event_id text default null,
  p_provider_payment_id text default null,
  p_provider_refund_id text default null
) returns jsonb
language plpgsql
security invoker
set search_path to 'public','pg_temp'
as $function$
declare
  v_tx public.hotel_payment_transactions%rowtype;
  v_parent public.hotel_payment_transactions%rowtype;
  v_folio public.hotel_folios%rowtype;
  v_booking public.hotel_bookings%rowtype;
  v_line_id uuid;
  v_net_paid numeric := 0;
  v_total numeric := 0;
  v_payment_status text := 'UNPAID';
  v_folio_status text;
  v_booking_status text;
  v_post_checkout_adjustment boolean := false;
  v_settlement_business_date date;
begin
  select * into v_tx
  from public.hotel_payment_transactions
  where id = p_transaction_id
  for update;

  if not found then raise exception 'HOTEL_GATEWAY: transaction not found'; end if;
  if v_tx.processor_mode <> 'AVANTIQO_GATEWAY' then raise exception 'HOTEL_GATEWAY: transaction is not gateway-managed'; end if;

  if v_tx.status = 'SETTLED' then
    return jsonb_build_object(
      'transaction_id', v_tx.id,
      'status', v_tx.status,
      'unchanged', true,
      'folio_line_id', v_tx.folio_line_id,
      'settlement_business_date', v_tx.settlement_business_date,
      'post_checkout_adjustment', coalesce((v_tx.metadata->>'post_checkout_adjustment')::boolean, false)
    );
  end if;
  if v_tx.status = 'FAILED' then raise exception 'HOTEL_GATEWAY: failed transaction cannot settle'; end if;

  select * into v_folio
  from public.hotel_folios
  where id = v_tx.folio_id
    and organization_id = v_tx.organization_id
  for update;
  if not found then raise exception 'HOTEL_GATEWAY: folio not found'; end if;

  select * into v_booking
  from public.hotel_bookings
  where id = v_tx.booking_id
    and organization_id = v_tx.organization_id
  for update;
  if not found then raise exception 'HOTEL_GATEWAY: booking not found'; end if;

  if v_folio.booking_id is distinct from v_booking.id
     or v_folio.property_id is distinct from v_booking.property_id
     or v_tx.property_id is distinct from v_booking.property_id then
    raise exception 'HOTEL_GATEWAY: booking, folio and transaction scope differ';
  end if;

  v_folio_status := upper(coalesce(v_folio.status, ''));
  v_booking_status := upper(coalesce(v_booking.status, ''));
  v_post_checkout_adjustment :=
    v_tx.transaction_type = 'REFUND'
    and v_folio_status = 'CLOSED'
    and v_booking_status = 'CHECKED_OUT';

  if v_folio_status <> 'OPEN' and not v_post_checkout_adjustment then
    raise exception 'HOTEL_GATEWAY: folio is closed and this is not a governed post-checkout refund adjustment';
  end if;

  if v_tx.property_id is not null then
    select public.hotel_business_date_from_settings(
      p.time_zone,
      p.business_day_cutoff_minutes,
      p.operational_day_configured_at,
      now()
    ) into v_settlement_business_date
    from public.hotel_properties p
    where p.organization_id = v_tx.organization_id
      and p.id = v_tx.property_id;
  end if;

  if v_tx.transaction_type in ('PAYMENT','DEPOSIT') then
    if v_folio_status <> 'OPEN' then
      raise exception 'HOTEL_GATEWAY: payments and deposits require an open folio';
    end if;

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
        settlement_business_date = coalesce(settlement_business_date, v_settlement_business_date),
        settled_at = coalesce(settled_at, now()),
        updated_at = now(),
        failure_reason = null
    where id = v_tx.id;

  elsif v_tx.transaction_type = 'REFUND' then
    if v_tx.parent_transaction_id is null then raise exception 'HOTEL_GATEWAY: refund requires parent transaction'; end if;

    select * into v_parent
    from public.hotel_payment_transactions
    where id = v_tx.parent_transaction_id
      and organization_id = v_tx.organization_id
      and status = 'SETTLED'
      and transaction_type in ('PAYMENT','DEPOSIT')
    for update;
    if not found then raise exception 'HOTEL_GATEWAY: refundable parent not found'; end if;

    if v_parent.booking_id is distinct from v_tx.booking_id
       or v_parent.folio_id is distinct from v_tx.folio_id
       or v_parent.property_id is distinct from v_tx.property_id then
      raise exception 'HOTEL_GATEWAY: refund scope differs from refundable parent';
    end if;

    update public.hotel_payment_transactions
    set applied_amount = greatest(applied_amount - v_tx.amount, 0),
        refunded_amount = refunded_amount + v_tx.amount,
        updated_at = now()
    where id = v_tx.parent_transaction_id
      and refunded_amount + v_tx.amount <= amount + 0.005;
    if not found then raise exception 'HOTEL_GATEWAY: refund exceeds remaining refundable amount'; end if;

    if not v_post_checkout_adjustment then
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
    end if;

    update public.hotel_payment_transactions
    set status = 'SETTLED',
        provider_event_id = coalesce(p_provider_event_id, provider_event_id),
        provider_refund_id = coalesce(p_provider_refund_id, provider_refund_id),
        folio_line_id = case when v_post_checkout_adjustment then null else coalesce(v_line_id, folio_line_id) end,
        settlement_business_date = coalesce(settlement_business_date, v_settlement_business_date),
        metadata = coalesce(metadata, '{}'::jsonb) || case
          when v_post_checkout_adjustment then jsonb_build_object(
            'post_checkout_adjustment', true,
            'closed_folio_immutable', true,
            'certified_booking_immutable', true,
            'original_checkout_business_date', v_booking.actual_check_out_business_date,
            'adjustment_settlement_business_date', v_settlement_business_date
          )
          else '{}'::jsonb
        end,
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

  v_total := coalesce(v_booking.total_amount, 0);
  v_payment_status := case
    when v_net_paid <= 0.005 then 'UNPAID'
    when v_total > 0 and v_net_paid + 0.005 >= v_total then 'PAID'
    else 'PARTIAL'
  end;

  if not v_post_checkout_adjustment then
    update public.hotel_bookings
    set paid_amount = v_net_paid,
        payment_status = v_payment_status,
        updated_at = now()
    where id = v_tx.booking_id
      and organization_id = v_tx.organization_id;

    update public.hotel_folios
    set updated_at = now()
    where id = v_folio.id;
  end if;

  return jsonb_build_object(
    'transaction_id', v_tx.id,
    'status', 'SETTLED',
    'folio_line_id', v_line_id,
    'settlement_business_date', v_settlement_business_date,
    'post_checkout_adjustment', v_post_checkout_adjustment,
    'current_net_paid_amount', v_net_paid,
    'booking_paid_amount', case when v_post_checkout_adjustment then v_booking.paid_amount else v_net_paid end,
    'booking_payment_status', case when v_post_checkout_adjustment then v_booking.payment_status else v_payment_status end,
    'certified_history_unchanged', v_post_checkout_adjustment
  );
end;
$function$;

revoke all on function public.hotel_refund_request_guard() from public;
revoke all on function public.hotel_refund_request_guard() from anon;
revoke all on function public.hotel_refund_request_guard() from authenticated;

revoke all on function public.hotel_finalize_gateway_transaction(uuid,text,text,text) from public;
revoke all on function public.hotel_finalize_gateway_transaction(uuid,text,text,text) from anon;
revoke all on function public.hotel_finalize_gateway_transaction(uuid,text,text,text) from authenticated;
grant execute on function public.hotel_finalize_gateway_transaction(uuid,text,text,text) to service_role;
