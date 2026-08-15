begin;

alter table public.pos_shifts add column if not exists transfer_total numeric default 0;

update public.payments p
set entity_id = s.entity_id,
    application_id = coalesce(p.application_id, 'restaurant'),
    updated_at = now()
from public.table_sessions s
where p.organization_id = s.organization_id
  and p.session_id = s.id
  and p.entity_id is null
  and s.entity_id is not null;

insert into public.finance_posting_mappings (
  organization_id, entity_id, event_type, debit_account_id, credit_account_id,
  tax_account_id, status, description, priority, auto_post, conditions,
  tax_posting_side, created_at, updated_at
)
select source.organization_id, source.entity_id, 'POS_SALE_RECOGNIZED',
  source.debit_account_id, source.credit_account_id, source.tax_account_id,
  'ACTIVE', 'POS sale recognition', source.priority, true,
  coalesce(source.conditions, '{}'::jsonb), coalesce(source.tax_posting_side, 'CREDIT'), now(), now()
from public.finance_posting_mappings source
where source.event_type = 'CUSTOMER_INVOICE_CREATED' and source.status = 'ACTIVE'
on conflict (organization_id, entity_id, event_type) do nothing;

insert into public.finance_posting_mappings (
  organization_id, entity_id, event_type, debit_account_id, credit_account_id,
  tax_account_id, status, description, priority, auto_post, conditions,
  tax_posting_side, created_at, updated_at
)
select source.organization_id, source.entity_id, event_type.event_type,
  source.debit_account_id, source.credit_account_id, null,
  'ACTIVE', 'POS non-cash payment receipt', source.priority, true,
  coalesce(source.conditions, '{}'::jsonb), null, now(), now()
from public.finance_posting_mappings source
cross join (values
  ('POS_CARD_PAYMENT_RECEIVED'::text),
  ('POS_QR_PAYMENT_RECEIVED'::text),
  ('POS_TRANSFER_PAYMENT_RECEIVED'::text)
) as event_type(event_type)
where source.event_type = 'CUSTOMER_PAYMENT_RECEIVED' and source.status = 'ACTIVE'
on conflict (organization_id, entity_id, event_type) do nothing;

insert into public.finance_posting_mappings (
  organization_id, entity_id, event_type, debit_account_id, credit_account_id,
  tax_account_id, status, description, priority, auto_post, conditions,
  tax_posting_side, created_at, updated_at
)
select source.organization_id, source.entity_id, 'POS_CASH_PAYMENT_RECEIVED',
  cash.id, source.credit_account_id, null,
  'ACTIVE', 'POS cash payment receipt', source.priority, true,
  coalesce(source.conditions, '{}'::jsonb), null, now(), now()
from public.finance_posting_mappings source
join public.chart_of_accounts cash
  on cash.organization_id = source.organization_id
 and cash.entity_id = source.entity_id
 and cash.is_active = true
 and lower(btrim(coalesce(cash.account_name, ''))) = 'cash'
 and 1 = (
   select count(*) from public.chart_of_accounts sibling
   where sibling.organization_id = cash.organization_id
     and sibling.entity_id = cash.entity_id
     and sibling.is_active = true
     and lower(btrim(coalesce(sibling.account_name, ''))) = 'cash'
 )
where source.event_type = 'CUSTOMER_PAYMENT_RECEIVED' and source.status = 'ACTIVE'
on conflict (organization_id, entity_id, event_type) do nothing;

create or replace function public.restaurant_settle_table_atomic(
  p_organization_id uuid,
  p_table_number text,
  p_amount numeric,
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
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_table public.restaurant_tables%rowtype;
  v_effective_table_id uuid;
  v_table_ids uuid[];
  v_order_ids uuid[];
  v_result jsonb;
  v_payment_id uuid;
  v_existing_payment public.payments%rowtype;
  v_payment_method text := upper(trim(coalesce(p_payment_method, '')));
  v_application_id text := lower(trim(coalesce(p_application_id, '')));
  v_currency_code text := upper(trim(coalesce(p_currency_code, '')));
  v_finance_event_ids jsonb := '[]'::jsonb;
  v_event_result jsonb;
  v_event_id text;
  v_order record;
  v_payment record;
  v_payment_event_type text;
begin
  if p_organization_id is null then raise exception 'organizationId required'; end if;
  if p_entity_id is null then raise exception 'entityId required'; end if;
  if nullif(v_application_id, '') is null then raise exception 'applicationId required'; end if;
  if nullif(v_currency_code, '') is null then raise exception 'currencyCode required'; end if;
  if v_payment_method not in ('CASH', 'CARD', 'QR', 'TRANSFER') then raise exception 'Unsupported restaurant payment method'; end if;

  perform 1 from public.legal_entities
  where id = p_entity_id and organization_id = p_organization_id and is_active = true
    and upper(coalesce(currency, '')) = v_currency_code;
  if not found then raise exception 'Selected legal entity is outside the organization, inactive, or currency-mismatched'; end if;

  select * into v_existing_payment
  from public.payments
  where organization_id = p_organization_id and payment_reference = p_idempotency_key
  order by created_at desc limit 1;

  if found then
    if v_existing_payment.entity_id is not null and v_existing_payment.entity_id <> p_entity_id then
      raise exception 'Idempotent payment belongs to a different legal entity';
    end if;
    v_result := public.restaurant_settle_table_atomic(
      p_organization_id, p_table_number, p_amount, v_payment_method, p_partial,
      p_item_ids, p_idempotency_key, p_actor_id
    );
    v_payment_id := nullif(v_result->>'paymentId', '')::uuid;
    select array_agg(distinct order_id) into v_order_ids
    from public.restaurant_payment_allocations
    where organization_id = p_organization_id and payment_id = v_payment_id and order_id is not null;
    select table_id into v_effective_table_id
    from public.orders
    where organization_id = p_organization_id and id = any(coalesce(v_order_ids, array[]::uuid[]))
    order by created_at limit 1;
  else
    select * into v_table
    from public.restaurant_tables
    where organization_id = p_organization_id and table_number::text = p_table_number
    limit 1;
    if not found then raise exception 'Restaurant table not found'; end if;

    select coalesce((
      select master_table_id from public.restaurant_table_merges
      where organization_id = p_organization_id and merged_table_id = v_table.id limit 1
    ), v_table.id) into v_effective_table_id;

    select array_agg(id order by id) into v_table_ids
    from (
      select v_effective_table_id as id
      union
      select merged_table_id from public.restaurant_table_merges
      where organization_id = p_organization_id and master_table_id = v_effective_table_id
    ) scoped_tables;

    select array_agg(id order by created_at, id) into v_order_ids
    from public.orders
    where organization_id = p_organization_id
      and table_id = any(v_table_ids)
      and status not in ('CANCELLED', 'VOID', 'COMPLETED');

    if coalesce(array_length(v_order_ids, 1), 0) = 0 then raise exception 'No payable orders found for table'; end if;
    if exists (
      select 1 from public.orders
      where organization_id = p_organization_id and id = any(v_order_ids)
        and entity_id is distinct from p_entity_id
    ) then raise exception 'Restaurant payable orders are outside the selected legal entity'; end if;

    if p_cash_session_id is null then raise exception 'Open a POS cash session before settlement'; end if;
    perform 1 from public.pos_shifts
    where id = p_cash_session_id
      and organization_id = p_organization_id
      and entity_id = p_entity_id
      and application_id = v_application_id
      and upper(coalesce(status, '')) in ('OPEN', 'ACTIVE')
      and coalesce(locked, false) = false;
    if not found then raise exception 'Selected POS cash session is not active in this organization, entity, and application'; end if;

    v_result := public.restaurant_settle_table_atomic(
      p_organization_id, p_table_number, p_amount, v_payment_method, p_partial,
      p_item_ids, p_idempotency_key, p_actor_id
    );
    v_payment_id := nullif(v_result->>'paymentId', '')::uuid;
  end if;

  if v_payment_id is null then raise exception 'Atomic restaurant settlement returned no payment identity'; end if;

  update public.payments
  set entity_id = p_entity_id,
      application_id = coalesce(application_id, v_application_id),
      cash_session_id = coalesce(cash_session_id, p_cash_session_id),
      currency = coalesce(currency, v_currency_code),
      actor_id = coalesce(actor_id, p_actor_id),
      tendered_amount = coalesce(tendered_amount, p_amount),
      source_document = coalesce(source_document, 'restaurant_table_settlement'),
      source_document_id = coalesce(source_document_id, v_effective_table_id),
      updated_at = v_now
  where id = v_payment_id and organization_id = p_organization_id;

  if coalesce((v_result->>'duplicate')::boolean, false) = false then
    update public.pos_shifts
    set cash_total = coalesce(cash_total, 0) + case when v_payment_method = 'CASH' then p_amount else 0 end,
        card_total = coalesce(card_total, 0) + case when v_payment_method = 'CARD' then p_amount else 0 end,
        qr_total = coalesce(qr_total, 0) + case when v_payment_method = 'QR' then p_amount else 0 end,
        transfer_total = coalesce(transfer_total, 0) + case when v_payment_method = 'TRANSFER' then p_amount else 0 end,
        net_sales = coalesce(net_sales, 0) + p_amount,
        updated_at = v_now
    where id = p_cash_session_id and organization_id = p_organization_id
      and entity_id = p_entity_id and application_id = v_application_id;
  end if;

  if coalesce((v_result->>'fullyPaid')::boolean, false) then
    for v_order in
      select o.id, o.session_id, o.total_amount, o.total, o.vat_amount, s.party_id
      from public.orders o
      left join public.table_sessions s on s.id = o.session_id and s.organization_id = o.organization_id
      where o.organization_id = p_organization_id and o.entity_id = p_entity_id and o.id = any(v_order_ids)
      order by o.created_at, o.id
    loop
      v_event_result := public.record_system_event_atomic(
        p_organization_id,
        'POS_SALE_RECOGNIZED',
        jsonb_strip_nulls(jsonb_build_object(
          'organization_id', p_organization_id,
          'entity_id', p_entity_id,
          'party_id', v_order.party_id,
          'source_module', 'pos',
          'source_id', v_order.id,
          'source_document', 'restaurant_order',
          'source_document_id', v_order.id,
          'order_id', v_order.id,
          'session_id', v_order.session_id,
          'amount', coalesce(v_order.total_amount, v_order.total, 0),
          'tax_amount', coalesce(v_order.vat_amount, 0),
          'currency_code', v_currency_code,
          'exchange_rate', 1,
          'entry_date', v_now::date::text,
          'description', 'Restaurant POS sale'
        )),
        'pos-finance:sale:' || v_order.id::text
      );
      v_event_id := v_event_result->'event'->>'id';
      if nullif(v_event_id, '') is not null then v_finance_event_ids := v_finance_event_ids || jsonb_build_array(v_event_id); end if;
    end loop;

    for v_payment in
      select distinct p.*
      from public.payments p
      join public.restaurant_payment_allocations a on a.payment_id = p.id and a.organization_id = p.organization_id
      where p.organization_id = p_organization_id and p.entity_id = p_entity_id
        and p.status = 'PAID' and a.order_id = any(v_order_ids)
      order by p.created_at, p.id
    loop
      v_payment_event_type := case upper(trim(coalesce(v_payment.payment_method, '')))
        when 'CASH' then 'POS_CASH_PAYMENT_RECEIVED'
        when 'CARD' then 'POS_CARD_PAYMENT_RECEIVED'
        when 'CREDIT_CARD' then 'POS_CARD_PAYMENT_RECEIVED'
        when 'QR' then 'POS_QR_PAYMENT_RECEIVED'
        when 'QR_PAYMENT' then 'POS_QR_PAYMENT_RECEIVED'
        when 'TRANSFER' then 'POS_TRANSFER_PAYMENT_RECEIVED'
        when 'BANK_TRANSFER' then 'POS_TRANSFER_PAYMENT_RECEIVED'
        else null
      end;
      if v_payment_event_type is null then raise exception 'Unsupported settled payment method for Finance posting: %', v_payment.payment_method; end if;
      v_event_result := public.record_system_event_atomic(
        p_organization_id,
        v_payment_event_type,
        jsonb_strip_nulls(jsonb_build_object(
          'organization_id', p_organization_id,
          'entity_id', p_entity_id,
          'party_id', v_payment.party_id,
          'source_module', 'pos',
          'source_id', v_payment.id,
          'source_document', 'restaurant_payment',
          'source_document_id', v_payment.id,
          'payment_id', v_payment.id,
          'session_id', v_payment.session_id,
          'cash_session_id', v_payment.cash_session_id,
          'amount', coalesce(v_payment.amount, 0),
          'tax_amount', 0,
          'currency_code', coalesce(nullif(upper(trim(v_payment.currency)), ''), v_currency_code),
          'exchange_rate', 1,
          'entry_date', coalesce(v_payment.paid_at, v_now)::date::text,
          'description', 'Restaurant POS payment'
        )),
        'pos-finance:payment:' || v_payment.id::text
      );
      v_event_id := v_event_result->'event'->>'id';
      if nullif(v_event_id, '') is not null then v_finance_event_ids := v_finance_event_ids || jsonb_build_array(v_event_id); end if;
    end loop;
  end if;

  return v_result || jsonb_build_object(
    'entityId', p_entity_id,
    'cashSessionId', p_cash_session_id,
    'financeEventIds', v_finance_event_ids
  );
end;
$$;

revoke all on function public.restaurant_settle_table_atomic(uuid,text,numeric,text,boolean,uuid[],text,uuid,uuid,text,uuid,text) from public;
revoke all on function public.restaurant_settle_table_atomic(uuid,text,numeric,text,boolean,uuid[],text,uuid,uuid,text,uuid,text) from anon;
revoke all on function public.restaurant_settle_table_atomic(uuid,text,numeric,text,boolean,uuid[],text,uuid,uuid,text,uuid,text) from authenticated;
grant execute on function public.restaurant_settle_table_atomic(uuid,text,numeric,text,boolean,uuid[],text,uuid,uuid,text,uuid,text) to service_role;

commit;
