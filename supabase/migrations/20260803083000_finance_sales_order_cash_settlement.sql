begin;

alter table public.payments
  add column if not exists entity_id uuid,
  add column if not exists party_id uuid,
  add column if not exists application_id text,
  add column if not exists source_document text,
  add column if not exists source_document_id uuid,
  add column if not exists cash_session_id uuid,
  add column if not exists document_number text,
  add column if not exists currency text,
  add column if not exists tendered_amount numeric(18,2),
  add column if not exists change_amount numeric(18,2),
  add column if not exists journal_entry_id uuid,
  add column if not exists actor_id uuid,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.pos_shifts
  add column if not exists entity_id uuid,
  add column if not exists application_id text;

create index if not exists payments_sales_order_scope_idx
  on public.payments (
    organization_id,
    entity_id,
    source_document,
    source_document_id,
    status
  );

create unique index if not exists payments_document_number_scope_uidx
  on public.payments (organization_id, entity_id, document_number)
  where document_number is not null;

create unique index if not exists payments_paid_sales_order_uidx
  on public.payments (organization_id, entity_id, source_document, source_document_id)
  where source_document = 'sales_order'
    and upper(coalesce(status, '')) = 'PAID';

create index if not exists pos_shifts_scope_created_idx
  on public.pos_shifts (
    organization_id,
    entity_id,
    application_id,
    created_at desc
  );

create unique index if not exists pos_shifts_one_active_scope_uidx
  on public.pos_shifts (organization_id, entity_id, lower(btrim(application_id)))
  where entity_id is not null
    and nullif(btrim(application_id), '') is not null
    and upper(coalesce(status, '')) in ('OPEN', 'ACTIVE');

create or replace function public.finance_settle_sales_order_cash_idempotent(
  p_payment_id uuid,
  p_organization_id uuid,
  p_entity_id uuid,
  p_sales_order_id uuid,
  p_cash_session_id uuid,
  p_application_id text,
  p_tendered_amount numeric,
  p_actor_id uuid,
  p_currency_code text,
  p_exchange_rate numeric,
  p_posting_date date,
  p_journal_type text,
  p_journal_reference text,
  p_journal_description text,
  p_journal_lines jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing jsonb;
  v_request_hash text;
  v_order public.sales_orders%rowtype;
  v_shift public.pos_shifts%rowtype;
  v_payment public.payments%rowtype;
  v_amount numeric(18,2);
  v_tendered numeric(18,2);
  v_change numeric(18,2);
  v_document_number text;
  v_journal jsonb;
  v_journal_entry_id uuid;
  v_event_id text;
  v_result jsonb;
begin
  if p_payment_id is null then
    raise exception 'payment_id required';
  end if;

  if p_organization_id is null or p_entity_id is null then
    raise exception 'organization_id and entity_id required';
  end if;

  if p_sales_order_id is null then
    raise exception 'sales_order_id required';
  end if;

  if p_cash_session_id is null then
    raise exception 'cash_session_id required';
  end if;

  if nullif(btrim(p_application_id), '') is null then
    raise exception 'application_id required';
  end if;

  if p_actor_id is null then
    raise exception 'authenticated actor required';
  end if;

  if nullif(btrim(p_currency_code), '') is null then
    raise exception 'currency_code required';
  end if;

  if p_exchange_rate is null or p_exchange_rate <= 0 then
    raise exception 'exchange_rate must be positive';
  end if;

  if p_posting_date is null then
    raise exception 'posting_date required';
  end if;

  if nullif(btrim(p_journal_type), '') is null then
    raise exception 'journal_type required';
  end if;

  if nullif(btrim(p_journal_reference), '') is null then
    raise exception 'journal_reference required';
  end if;

  if nullif(btrim(p_journal_description), '') is null then
    raise exception 'journal_description required';
  end if;

  if p_journal_lines is null
     or jsonb_typeof(p_journal_lines) <> 'array'
     or jsonb_array_length(p_journal_lines) < 2 then
    raise exception 'balanced journal lines required';
  end if;

  if nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'idempotency_key required';
  end if;

  v_tendered := round(coalesce(p_tendered_amount, 0)::numeric, 2);
  if v_tendered <= 0 then
    raise exception 'tendered amount must be greater than zero';
  end if;

  v_request_hash := md5(concat_ws(
    '|',
    p_sales_order_id::text,
    p_cash_session_id::text,
    lower(btrim(p_application_id)),
    v_tendered::text,
    upper(btrim(p_currency_code)),
    p_exchange_rate::text,
    p_posting_date::text,
    upper(btrim(p_journal_type)),
    btrim(p_journal_reference),
    p_journal_lines::text
  ));

  v_existing := public.finance_claim_idempotency(
    p_organization_id,
    p_entity_id,
    'SALES_ORDER_CASH_SETTLEMENT',
    btrim(p_idempotency_key),
    v_request_hash,
    p_payment_id
  );

  if v_existing is not null then
    return v_existing;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':' ||
      p_entity_id::text || ':sales-order-payment:' ||
      p_sales_order_id::text,
      0
    )
  );

  perform 1
  from public.legal_entities
  where id = p_entity_id
    and organization_id = p_organization_id
    and coalesce(is_active, true) = true;

  if not found then
    raise exception 'Entity is outside organization scope or inactive';
  end if;

  select *
  into v_order
  from public.sales_orders
  where id = p_sales_order_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
  for update;

  if not found then
    raise exception 'Sales order not found in organization and entity scope';
  end if;

  if upper(coalesce(v_order.status, '')) <> 'CONFIRMED' then
    raise exception 'Only confirmed sales orders can be settled';
  end if;

  if upper(coalesce(v_order.fulfillment_status, '')) <> 'RESERVED' then
    raise exception 'Sales order inventory must be reserved before settlement';
  end if;

  if upper(coalesce(v_order.payment_status, '')) <> 'UNPAID' then
    raise exception 'Sales order is not available for full settlement';
  end if;

  if lower(coalesce(v_order.application_id, '')) <> lower(btrim(p_application_id)) then
    raise exception 'Sales order application does not match settlement application';
  end if;

  if upper(btrim(v_order.currency_code)) <> upper(btrim(p_currency_code)) then
    raise exception 'Sales order currency does not match settlement currency';
  end if;

  if exists (
    select 1
    from public.sales_order_lines line
    where line.sales_order_id = v_order.id
      and line.organization_id = p_organization_id
      and line.entity_id = p_entity_id
      and not exists (
        select 1
        from public.inventory_reservations reservation
        where reservation.organization_id = p_organization_id
          and reservation.entity_id = p_entity_id
          and reservation.source_document = 'sales_order'
          and reservation.source_document_id = v_order.id
          and reservation.source_line_id = line.id
          and reservation.status = 'ACTIVE'
          and reservation.quantity >= line.quantity
      )
  ) then
    raise exception 'Sales order inventory reservation is incomplete';
  end if;

  select *
  into v_shift
  from public.pos_shifts
  where id = p_cash_session_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
    and lower(btrim(application_id)) = lower(btrim(p_application_id))
    and upper(coalesce(status, '')) in ('OPEN', 'ACTIVE')
  for update;

  if not found then
    raise exception 'Active cash session not found in organization, entity and application scope';
  end if;

  v_amount := round(
    greatest(
      0,
      coalesce(
        v_order.remaining_balance,
        v_order.total_amount - coalesce(v_order.paid_amount, 0)
      )
    )::numeric,
    2
  );

  if v_amount <= 0 then
    raise exception 'Sales order has no remaining balance';
  end if;

  if v_tendered < v_amount then
    raise exception 'Tendered cash is less than the remaining balance';
  end if;

  v_change := round((v_tendered - v_amount)::numeric, 2);

  v_document_number := public.finance_next_document_number(
    p_organization_id,
    p_entity_id,
    'PAYMENT_RECEIPT',
    null,
    p_posting_date
  );

  insert into public.payments (
    id,
    organization_id,
    entity_id,
    party_id,
    application_id,
    source_document,
    source_document_id,
    cash_session_id,
    document_number,
    amount,
    tendered_amount,
    change_amount,
    payment_method,
    payment_reference,
    currency,
    status,
    paid_at,
    actor_id,
    metadata,
    created_at,
    updated_at
  ) values (
    p_payment_id,
    p_organization_id,
    p_entity_id,
    v_order.customer_id,
    lower(btrim(p_application_id)),
    'sales_order',
    v_order.id,
    p_cash_session_id,
    v_document_number,
    v_amount,
    v_tendered,
    v_change,
    'CASH',
    btrim(p_idempotency_key),
    upper(btrim(p_currency_code)),
    'PAID',
    now(),
    p_actor_id,
    jsonb_build_object(
      'order_number', v_order.order_number,
      'channel', v_order.channel,
      'tax_amount', v_order.tax_amount,
      'cash_session_id', p_cash_session_id
    ),
    now(),
    now()
  )
  returning * into v_payment;

  select public.finance_post_journal_atomic(
    p_organization_id => p_organization_id,
    p_entity_id => p_entity_id,
    p_posting_date => p_posting_date,
    p_document_date => p_posting_date,
    p_journal_type => upper(btrim(p_journal_type)),
    p_reference => btrim(p_journal_reference),
    p_source_module => 'commercial',
    p_source_document => 'PAYMENT_RECEIVED',
    p_source_document_id => p_payment_id,
    p_description => btrim(p_journal_description),
    p_currency_code => upper(btrim(p_currency_code)),
    p_exchange_rate => p_exchange_rate,
    p_lines => p_journal_lines,
    p_created_by => p_actor_id,
    p_idempotency_key => 'accounting-event:PAYMENT_RECEIVED:commercial:' || p_payment_id::text
  ) into v_journal;

  v_journal_entry_id := nullif(v_journal->'journal'->>'id', '')::uuid;

  if v_journal_entry_id is null then
    raise exception 'Sales order payment posting did not return a journal entry';
  end if;

  update public.payments
  set journal_entry_id = v_journal_entry_id,
      updated_at = now()
  where id = p_payment_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
  returning * into v_payment;

  update public.sales_orders
  set paid_amount = total_amount,
      remaining_balance = 0,
      payment_status = 'PAID',
      updated_at = now()
  where id = v_order.id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
    and payment_status = 'UNPAID'
  returning * into v_order;

  if not found then
    raise exception 'Sales order payment status update failed';
  end if;

  insert into public.system_events (
    organization_id,
    type,
    payload,
    idempotency_key
  ) values (
    p_organization_id,
    'SALES_ORDER_PAYMENT_RECEIVED',
    jsonb_build_object(
      'sales_order_id', v_order.id,
      'order_number', v_order.order_number,
      'payment_id', v_payment.id,
      'payment_document_number', v_payment.document_number,
      'organization_id', p_organization_id,
      'entity_id', p_entity_id,
      'application_id', lower(btrim(p_application_id)),
      'cash_session_id', p_cash_session_id,
      'amount', v_amount,
      'tendered_amount', v_tendered,
      'change_amount', v_change,
      'currency_code', upper(btrim(p_currency_code)),
      'journal_entry_id', v_journal_entry_id,
      'payment_status', v_order.payment_status,
      'fulfillment_status', v_order.fulfillment_status
    ),
    'sales-order-payment:' || btrim(p_idempotency_key)
  )
  returning id::text into v_event_id;

  v_result := jsonb_build_object(
    'success', true,
    'duplicate', false,
    'payment', to_jsonb(v_payment),
    'paymentId', v_payment.id,
    'paymentDocumentNumber', v_payment.document_number,
    'salesOrderId', v_order.id,
    'orderId', v_order.id,
    'orderNumber', v_order.order_number,
    'amount', v_amount,
    'tenderedAmount', v_tendered,
    'changeAmount', v_change,
    'remainingBalance', v_order.remaining_balance,
    'fullyPaid', true,
    'paymentStatus', v_order.payment_status,
    'fulfillmentStatus', v_order.fulfillment_status,
    'journalEntryId', v_journal_entry_id,
    'eventId', v_event_id,
    'nextView', 'orders'
  );

  perform public.finance_complete_idempotency(
    p_organization_id,
    p_entity_id,
    'SALES_ORDER_CASH_SETTLEMENT',
    btrim(p_idempotency_key),
    v_result
  );

  return v_result;
end;
$$;

revoke all on function public.finance_settle_sales_order_cash_idempotent(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  numeric,
  uuid,
  text,
  numeric,
  date,
  text,
  text,
  text,
  jsonb,
  text
) from public;

grant execute on function public.finance_settle_sales_order_cash_idempotent(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  numeric,
  uuid,
  text,
  numeric,
  date,
  text,
  text,
  text,
  jsonb,
  text
) to service_role;

comment on function public.finance_settle_sales_order_cash_idempotent(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  numeric,
  uuid,
  text,
  numeric,
  date,
  text,
  text,
  text,
  jsonb,
  text
) is
  'Atomically records a full cash settlement for one confirmed, inventory-reserved sales order, posts its configured Finance journal, and preserves fulfillment as a separate transition.';

notify pgrst, 'reload schema';

commit;