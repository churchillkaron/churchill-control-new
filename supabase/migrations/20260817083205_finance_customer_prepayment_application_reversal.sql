alter table public.finance_customer_payment_allocations
  add column if not exists reversed_amount numeric not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.finance_customer_payment_allocations'::regclass
      and conname = 'finance_customer_payment_allocations_reversed_amount_check'
  ) then
    alter table public.finance_customer_payment_allocations
      add constraint finance_customer_payment_allocations_reversed_amount_check
      check (
        reversed_amount >= 0
        and reversed_amount <= allocated_amount
      );
  end if;
end
$$;

create or replace function public.commercial_reconcile_sales_order_payment_from_invoice(
  p_organization_id uuid,
  p_entity_id uuid,
  p_customer_invoice_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_invoice public.customer_invoices%rowtype;
  v_order public.sales_orders%rowtype;
  v_cash_paid numeric := 0;
  v_credited numeric := 0;
  v_settled numeric := 0;
  v_remaining numeric := 0;
  v_status text := 'UNPAID';
begin
  select * into v_invoice
  from public.customer_invoices
  where id = p_customer_invoice_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id;

  if not found then
    raise exception 'Customer invoice not found for reconciliation';
  end if;

  if upper(coalesce(v_invoice.source_document_type, '')) <> 'SALES_ORDER'
     or v_invoice.source_document_id is null then
    return jsonb_build_object(
      'reconciled', false,
      'reason', 'invoice_not_sourced_from_sales_order',
      'customer_invoice_id', p_customer_invoice_id
    );
  end if;

  select * into v_order
  from public.sales_orders
  where id = v_invoice.source_document_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
  for update;

  if not found then
    raise exception 'Source Sales Order not found in invoice scope';
  end if;

  if v_order.party_id is not null
     and v_invoice.party_id is distinct from v_order.party_id then
    raise exception 'Sales Order and invoice party mismatch';
  end if;

  select coalesce(sum(greatest(a.allocated_amount - coalesce(a.reversed_amount, 0), 0)),0)
  into v_cash_paid
  from public.finance_customer_payment_allocations a
  join public.customer_payments p
    on p.id = a.customer_payment_id
   and p.organization_id = a.organization_id
   and p.entity_id = a.entity_id
  where a.organization_id = p_organization_id
    and a.entity_id = p_entity_id
    and a.customer_invoice_id = p_customer_invoice_id
    and upper(coalesce(p.status,'')) not in ('REVERSED','REFUNDED');

  select coalesce(sum(a.amount),0)
  into v_credited
  from public.finance_customer_credit_applications a
  where a.organization_id = p_organization_id
    and a.entity_id = p_entity_id
    and a.target_invoice_id = p_customer_invoice_id
    and a.reversed_at is null;

  v_cash_paid := greatest(0, least(coalesce(v_order.total_amount,0), v_cash_paid));
  v_credited := greatest(0, least(greatest(coalesce(v_order.total_amount,0)-v_cash_paid,0), v_credited));
  v_settled := least(coalesce(v_order.total_amount,0), v_cash_paid + v_credited);
  v_remaining := greatest(coalesce(v_order.total_amount,0) - v_settled, 0);

  v_status := case
    when abs(v_remaining) <= 0.005 then 'PAID'
    when v_settled > 0 then 'PARTIALLY_PAID'
    else 'UNPAID'
  end;

  update public.sales_orders
  set paid_amount = round(v_cash_paid,2),
      credited_amount = round(v_credited,2),
      remaining_balance = round(v_remaining,2),
      payment_status = v_status,
      updated_at = now()
  where id = v_order.id
    and organization_id = p_organization_id
    and entity_id = p_entity_id;

  return jsonb_build_object(
    'reconciled', true,
    'sales_order_id', v_order.id,
    'customer_invoice_id', p_customer_invoice_id,
    'paid_amount', round(v_cash_paid,2),
    'credited_amount', round(v_credited,2),
    'remaining_balance', round(v_remaining,2),
    'payment_status', v_status
  );
end;
$function$;

create or replace function public.finance_reverse_customer_unapplied_cash_application_party_idempotent(
  p_reversal_id uuid,
  p_organization_id uuid,
  p_entity_id uuid,
  p_party_id uuid,
  p_payment_id uuid,
  p_customer_invoice_id uuid,
  p_reversal_date date,
  p_amount numeric,
  p_reversed_by uuid,
  p_journal_lines jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  v_existing jsonb;
  v_result jsonb;
  v_request_hash text;
  v_payment public.customer_payments%rowtype;
  v_unapplied public.finance_customer_unapplied_cash%rowtype;
  v_invoice public.customer_invoices%rowtype;
  v_receivable public.accounts_receivable%rowtype;
  v_allocation public.finance_customer_payment_allocations%rowtype;
  v_reversible_amount numeric;
  v_reversed_after numeric;
  v_balance_before numeric;
  v_balance_after numeric;
  v_available_after numeric;
  v_applied_after numeric;
  v_payment_allocated_after numeric;
  v_payment_unapplied_after numeric;
  v_invoice_status text;
  v_unapplied_status text;
  v_payment_status text;
  v_journal jsonb;
  v_journal_entry_id uuid;
  v_reconciliation jsonb;
  v_now timestamptz := now();
begin
  if p_reversal_id is null then raise exception 'reversal_id required'; end if;
  if p_organization_id is null or p_entity_id is null then raise exception 'organization_id and entity_id required'; end if;
  if p_party_id is null then raise exception 'party_id required'; end if;
  if p_payment_id is null then raise exception 'payment_id required'; end if;
  if p_customer_invoice_id is null then raise exception 'customer_invoice_id required'; end if;
  if p_reversal_date is null then raise exception 'reversal_date required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be greater than zero'; end if;
  if p_journal_lines is null or jsonb_typeof(p_journal_lines) <> 'array' or jsonb_array_length(p_journal_lines) < 2 then
    raise exception 'balanced journal lines required';
  end if;
  if nullif(btrim(p_idempotency_key), '') is null then raise exception 'idempotency_key required'; end if;

  v_request_hash := md5(concat_ws(
    '|', p_party_id::text, p_payment_id::text, p_customer_invoice_id::text,
    p_reversal_date::text, round(p_amount, 2)::text, p_journal_lines::text
  ));

  v_existing := public.finance_claim_idempotency(
    p_organization_id, p_entity_id, 'CUSTOMER_UNAPPLIED_CASH_APPLICATION_REVERSAL',
    btrim(p_idempotency_key), v_request_hash, p_reversal_id
  );
  if v_existing is not null then return v_existing; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_organization_id::text || ':' || p_entity_id::text || ':customer-unapplied-cash-application-reversal:' || p_payment_id::text || ':' || p_customer_invoice_id::text,
      0
    )
  );

  perform 1 from public.legal_entities
  where id = p_entity_id and organization_id = p_organization_id;
  if not found then raise exception 'Entity is outside organization scope'; end if;

  perform 1 from public.parties
  where id = p_party_id and organization_id = p_organization_id;
  if not found then raise exception 'Party is outside organization scope'; end if;

  select * into v_payment
  from public.customer_payments
  where id = p_payment_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
    and party_id = p_party_id
  for update;
  if not found then raise exception 'Customer payment not found in party scope'; end if;
  if upper(coalesce(v_payment.status, '')) in ('REVERSED', 'REFUNDED') then
    raise exception 'Customer payment cannot be allocation-reversed after full reversal or refund';
  end if;

  select * into v_unapplied
  from public.finance_customer_unapplied_cash
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and party_id = p_party_id
    and customer_payment_id = p_payment_id
  for update;
  if not found then raise exception 'Unapplied customer cash not found'; end if;

  select * into v_invoice
  from public.customer_invoices
  where id = p_customer_invoice_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
    and party_id = p_party_id
    and upper(coalesce(document_type, 'INVOICE')) = 'INVOICE'
  for update;
  if not found then raise exception 'Customer invoice not found in party scope'; end if;

  if nullif(btrim(v_invoice.currency_code), '') is not null
     and upper(btrim(v_invoice.currency_code)) <> upper(btrim(v_unapplied.currency_code)) then
    raise exception 'Unapplied cash currency does not match invoice currency';
  end if;

  select * into v_receivable
  from public.accounts_receivable
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and party_id = p_party_id
    and customer_invoice_id = p_customer_invoice_id
  for update;
  if not found then raise exception 'Accounts receivable entry not found for invoice'; end if;

  select * into v_allocation
  from public.finance_customer_payment_allocations
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and party_id = p_party_id
    and customer_payment_id = p_payment_id
    and customer_invoice_id = p_customer_invoice_id
  for update;
  if not found then raise exception 'Customer prepayment allocation not found for invoice'; end if;

  v_reversible_amount := greatest(coalesce(v_allocation.allocated_amount, 0) - coalesce(v_allocation.reversed_amount, 0), 0);
  if v_reversible_amount <= 0.005 then raise exception 'Customer prepayment allocation has no reversible amount'; end if;
  if p_amount > v_reversible_amount + 0.005 then raise exception 'Reversal amount exceeds reversible customer prepayment allocation'; end if;

  v_balance_before := greatest(coalesce(v_receivable.outstanding_balance, v_receivable.amount, 0), 0);
  v_balance_after := v_balance_before + p_amount;
  v_invoice_status := case when v_balance_after <= 0.005 then 'PAID' else 'PARTIAL' end;

  v_available_after := coalesce(v_unapplied.available_amount, 0) + p_amount;
  v_applied_after := greatest(
    coalesce(v_unapplied.original_amount, 0) - v_available_after - coalesce(v_unapplied.refunded_amount, 0),
    0
  );
  v_unapplied_status := case
    when v_available_after > 0.005 and v_applied_after > 0.005 then 'PARTIALLY_APPLIED'
    when v_available_after > 0.005 and coalesce(v_unapplied.refunded_amount, 0) > 0.005 then 'PARTIALLY_REFUNDED'
    when v_available_after > 0.005 then 'OPEN'
    when v_applied_after > 0.005 and coalesce(v_unapplied.refunded_amount, 0) > 0.005 then 'APPLIED_AND_REFUNDED'
    when coalesce(v_unapplied.refunded_amount, 0) + 0.005 >= coalesce(v_unapplied.original_amount, 0) then 'REFUNDED'
    else 'APPLIED'
  end;

  v_payment_allocated_after := greatest(coalesce(v_payment.allocated_amount, 0) - p_amount, 0);
  v_payment_unapplied_after := coalesce(v_payment.unapplied_amount, 0) + p_amount;
  v_payment_status := case
    when v_payment_allocated_after > 0.005 and v_payment_unapplied_after > 0.005 then 'PARTIALLY_APPLIED'
    when v_payment_allocated_after > 0.005 then 'APPLIED'
    else 'UNAPPLIED'
  end;

  v_reversed_after := coalesce(v_allocation.reversed_amount, 0) + p_amount;
  if abs(v_reversed_after - coalesce(v_allocation.allocated_amount, 0)) <= 0.005 then
    v_reversed_after := coalesce(v_allocation.allocated_amount, 0);
  end if;

  update public.finance_customer_payment_allocations
  set reversed_amount = v_reversed_after,
      reversed_at = case when v_reversed_after + 0.005 >= allocated_amount then v_now else null end,
      reversed_by = p_reversed_by,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'last_application_reversal_id', p_reversal_id,
        'last_application_reversal_date', p_reversal_date,
        'last_application_reversal_amount', p_amount,
        'last_application_reversed_at', v_now
      ),
      updated_at = v_now
  where id = v_allocation.id
    and organization_id = p_organization_id
    and entity_id = p_entity_id;

  update public.accounts_receivable
  set outstanding_balance = v_balance_after,
      status = v_invoice_status,
      updated_at = v_now
  where id = v_receivable.id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
    and party_id = p_party_id;

  update public.customer_invoices
  set outstanding_balance = v_balance_after,
      outstanding_amount = v_balance_after,
      status = v_invoice_status,
      updated_at = v_now
  where id = p_customer_invoice_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
    and party_id = p_party_id;
  if not found then raise exception 'Customer invoice balance update failed'; end if;

  update public.finance_customer_unapplied_cash
  set available_amount = v_available_after,
      status = v_unapplied_status,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'last_application_reversal_id', p_reversal_id,
        'last_application_reversal_date', p_reversal_date,
        'last_application_reversal_amount', p_amount,
        'last_application_reversed_at', v_now
      ),
      updated_at = v_now
  where id = v_unapplied.id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
    and party_id = p_party_id;

  update public.customer_payments
  set allocated_amount = v_payment_allocated_after,
      unapplied_amount = v_payment_unapplied_after,
      status = v_payment_status,
      updated_at = v_now
  where id = p_payment_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
    and party_id = p_party_id;

  select public.finance_post_journal_atomic(
    p_organization_id => p_organization_id,
    p_entity_id => p_entity_id,
    p_posting_date => p_reversal_date,
    p_document_date => p_reversal_date,
    p_journal_type => 'SYSTEM',
    p_reference => 'accounts_receivable:unapplied-cash-application-reversal:' || p_reversal_id::text,
    p_source_module => 'accounts_receivable',
    p_source_document => 'CUSTOMER_UNAPPLIED_CASH_APPLICATION_REVERSED',
    p_source_document_id => p_reversal_id,
    p_description => 'Customer prepayment application reversed from invoice ' || p_customer_invoice_id::text,
    p_currency_code => upper(btrim(v_unapplied.currency_code)),
    p_exchange_rate => v_unapplied.exchange_rate,
    p_lines => p_journal_lines,
    p_created_by => p_reversed_by,
    p_idempotency_key => 'accounting-event:CUSTOMER_UNAPPLIED_CASH_APPLICATION_REVERSAL:' || p_reversal_id::text
  ) into v_journal;

  v_journal_entry_id := nullif(v_journal->'journal'->>'id', '')::uuid;
  if v_journal_entry_id is null then raise exception 'Customer prepayment application reversal did not return a journal entry'; end if;

  update public.finance_customer_payment_allocations
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'last_application_reversal_journal_entry_id', v_journal_entry_id
      ),
      updated_at = v_now
  where id = v_allocation.id
    and organization_id = p_organization_id
    and entity_id = p_entity_id;

  v_reconciliation := public.commercial_reconcile_sales_order_payment_from_invoice(
    p_organization_id, p_entity_id, p_customer_invoice_id
  );

  v_result := jsonb_build_object(
    'success', true,
    'reversal_id', p_reversal_id,
    'reversal_date', p_reversal_date,
    'payment_id', p_payment_id,
    'customer_invoice_id', p_customer_invoice_id,
    'party_id', p_party_id,
    'reversed_amount', round(p_amount, 2),
    'total_reversed_amount', round(v_reversed_after, 2),
    'payment_allocated_amount', round(v_payment_allocated_after, 2),
    'payment_unapplied_amount', round(v_payment_unapplied_after, 2),
    'unapplied_cash_available_amount', round(v_available_after, 2),
    'invoice_outstanding_balance', round(v_balance_after, 2),
    'journal_entry_id', v_journal_entry_id,
    'journal', v_journal,
    'sales_order_reconciliation', v_reconciliation
  );

  perform public.finance_complete_idempotency(
    p_organization_id, p_entity_id, 'CUSTOMER_UNAPPLIED_CASH_APPLICATION_REVERSAL',
    btrim(p_idempotency_key), v_result
  );

  return v_result;
end;
$function$;

revoke all on function public.finance_reverse_customer_unapplied_cash_application_party_idempotent(
  uuid, uuid, uuid, uuid, uuid, uuid, date, numeric, uuid, jsonb, text
) from public, anon, authenticated;

grant execute on function public.finance_reverse_customer_unapplied_cash_application_party_idempotent(
  uuid, uuid, uuid, uuid, uuid, uuid, date, numeric, uuid, jsonb, text
) to service_role;