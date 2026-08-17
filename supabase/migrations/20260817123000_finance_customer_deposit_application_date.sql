begin;

drop function if exists public.finance_apply_customer_unapplied_cash_party_idempotent(uuid,uuid,uuid,uuid,uuid,uuid,numeric,uuid,jsonb,text);

create or replace function public.finance_apply_customer_unapplied_cash_party_idempotent(
  p_application_id uuid,
  p_organization_id uuid,
  p_entity_id uuid,
  p_party_id uuid,
  p_payment_id uuid,
  p_customer_invoice_id uuid,
  p_application_date date,
  p_amount numeric,
  p_applied_by uuid,
  p_journal_lines jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing jsonb;
  v_result jsonb;
  v_request_hash text;
  v_payment public.customer_payments%rowtype;
  v_unapplied public.finance_customer_unapplied_cash%rowtype;
  v_invoice public.customer_invoices%rowtype;
  v_receivable public.accounts_receivable%rowtype;
  v_balance_before numeric;
  v_balance_after numeric;
  v_available_after numeric;
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
  if p_application_id is null then raise exception 'application_id required'; end if;
  if p_organization_id is null or p_entity_id is null then raise exception 'organization_id and entity_id required'; end if;
  if p_party_id is null then raise exception 'party_id required'; end if;
  if p_payment_id is null then raise exception 'payment_id required'; end if;
  if p_customer_invoice_id is null then raise exception 'customer_invoice_id required'; end if;
  if p_application_date is null then raise exception 'application_date required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be greater than zero'; end if;
  if p_journal_lines is null or jsonb_typeof(p_journal_lines) <> 'array' or jsonb_array_length(p_journal_lines) < 2 then
    raise exception 'balanced journal lines required';
  end if;
  if nullif(btrim(p_idempotency_key), '') is null then raise exception 'idempotency_key required'; end if;

  v_request_hash := md5(concat_ws(
    '|', p_party_id::text, p_payment_id::text, p_customer_invoice_id::text,
    p_application_date::text, round(p_amount, 2)::text, p_journal_lines::text
  ));

  v_existing := public.finance_claim_idempotency(
    p_organization_id, p_entity_id, 'CUSTOMER_UNAPPLIED_CASH_APPLICATION',
    btrim(p_idempotency_key), v_request_hash, p_application_id
  );
  if v_existing is not null then return v_existing; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_organization_id::text || ':' || p_entity_id::text || ':customer-unapplied-cash:' || p_payment_id::text || ':' || p_customer_invoice_id::text,
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
    raise exception 'Customer payment cannot be applied after reversal or refund';
  end if;

  select * into v_unapplied
  from public.finance_customer_unapplied_cash
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and party_id = p_party_id
    and customer_payment_id = p_payment_id
  for update;
  if not found then raise exception 'Unapplied customer cash not found'; end if;

  if upper(coalesce(v_unapplied.status, '')) in ('APPLIED', 'REFUNDED')
     or coalesce(v_unapplied.available_amount, 0) <= 0.005 then
    raise exception 'Customer payment has no unapplied cash available';
  end if;
  if p_amount > coalesce(v_unapplied.available_amount, 0) + 0.005 then
    raise exception 'Application amount exceeds available unapplied cash';
  end if;

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

  v_balance_before := greatest(coalesce(v_receivable.outstanding_balance, v_receivable.amount, 0), 0);
  if v_balance_before <= 0.005 then raise exception 'Customer invoice has no outstanding balance'; end if;
  if p_amount > v_balance_before + 0.005 then raise exception 'Application amount exceeds invoice outstanding balance'; end if;

  v_balance_after := greatest(v_balance_before - p_amount, 0);
  if abs(v_balance_after) <= 0.005 then v_balance_after := 0; end if;
  v_invoice_status := case when v_balance_after = 0 then 'PAID' else 'PARTIAL' end;

  v_available_after := greatest(coalesce(v_unapplied.available_amount, 0) - p_amount, 0);
  if abs(v_available_after) <= 0.005 then v_available_after := 0; end if;
  v_unapplied_status := case when v_available_after = 0 then 'APPLIED' else 'PARTIALLY_APPLIED' end;

  v_payment_allocated_after := coalesce(v_payment.allocated_amount, 0) + p_amount;
  v_payment_unapplied_after := greatest(coalesce(v_payment.unapplied_amount, 0) - p_amount, 0);
  if abs(v_payment_unapplied_after) <= 0.005 then v_payment_unapplied_after := 0; end if;
  v_payment_status := case when v_payment_unapplied_after = 0 then 'APPLIED' else 'PARTIALLY_APPLIED' end;

  insert into public.finance_customer_payment_allocations (
    organization_id, entity_id, customer_payment_id, customer_id, party_id,
    accounts_receivable_id, customer_invoice_id, allocated_amount,
    balance_before, balance_after, currency_code, exchange_rate,
    allocated_by, allocated_at, metadata, updated_at
  ) values (
    p_organization_id, p_entity_id, p_payment_id, p_party_id, p_party_id,
    v_receivable.id, p_customer_invoice_id, p_amount, v_balance_before,
    v_balance_after, upper(btrim(v_unapplied.currency_code)), v_unapplied.exchange_rate,
    p_applied_by, v_now,
    jsonb_build_object(
      'source', 'CUSTOMER_UNAPPLIED_CASH',
      'application_id', p_application_id,
      'application_date', p_application_date,
      'unapplied_cash_id', v_unapplied.id
    ), v_now
  )
  on conflict (customer_payment_id, customer_invoice_id)
  do update set
    allocated_amount = public.finance_customer_payment_allocations.allocated_amount + excluded.allocated_amount,
    balance_after = excluded.balance_after,
    allocated_by = excluded.allocated_by,
    metadata = coalesce(public.finance_customer_payment_allocations.metadata, '{}'::jsonb) || excluded.metadata,
    updated_at = excluded.updated_at;

  update public.accounts_receivable
  set outstanding_balance = v_balance_after, status = v_invoice_status, updated_at = v_now
  where id = v_receivable.id
    and organization_id = p_organization_id and entity_id = p_entity_id and party_id = p_party_id;

  update public.customer_invoices
  set outstanding_balance = v_balance_after, outstanding_amount = v_balance_after,
      status = v_invoice_status, updated_at = v_now
  where id = p_customer_invoice_id
    and organization_id = p_organization_id and entity_id = p_entity_id and party_id = p_party_id;
  if not found then raise exception 'Customer invoice balance update failed'; end if;

  update public.finance_customer_unapplied_cash
  set available_amount = v_available_after,
      status = v_unapplied_status,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'last_application_id', p_application_id,
        'last_applied_invoice_id', p_customer_invoice_id,
        'last_applied_date', p_application_date,
        'last_applied_at', v_now
      ),
      updated_at = v_now
  where id = v_unapplied.id
    and organization_id = p_organization_id and entity_id = p_entity_id and party_id = p_party_id;

  update public.customer_payments
  set customer_invoice_id = coalesce(customer_invoice_id, p_customer_invoice_id),
      allocated_amount = v_payment_allocated_after,
      unapplied_amount = v_payment_unapplied_after,
      status = v_payment_status,
      updated_at = v_now
  where id = p_payment_id
    and organization_id = p_organization_id and entity_id = p_entity_id and party_id = p_party_id;

  select public.finance_post_journal_atomic(
    p_organization_id => p_organization_id,
    p_entity_id => p_entity_id,
    p_posting_date => p_application_date,
    p_document_date => p_application_date,
    p_journal_type => 'SYSTEM',
    p_reference => 'accounts_receivable:unapplied-cash:' || p_application_id::text,
    p_source_module => 'accounts_receivable',
    p_source_document => 'CUSTOMER_UNAPPLIED_CASH_APPLIED',
    p_source_document_id => p_application_id,
    p_description => 'Customer unapplied cash applied to invoice ' || p_customer_invoice_id::text,
    p_currency_code => upper(btrim(v_unapplied.currency_code)),
    p_exchange_rate => v_unapplied.exchange_rate,
    p_lines => p_journal_lines,
    p_created_by => p_applied_by,
    p_idempotency_key => 'accounting-event:CUSTOMER_UNAPPLIED_CASH_APPLICATION:' || p_application_id::text
  ) into v_journal;

  v_journal_entry_id := nullif(v_journal->'journal'->>'id', '')::uuid;
  if v_journal_entry_id is null then raise exception 'Customer unapplied cash application did not return a journal entry'; end if;

  update public.finance_customer_payment_allocations
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'last_application_journal_entry_id', v_journal_entry_id
      ), updated_at = v_now
  where organization_id = p_organization_id and entity_id = p_entity_id
    and customer_payment_id = p_payment_id and customer_invoice_id = p_customer_invoice_id;

  v_reconciliation := public.commercial_reconcile_sales_order_payment_from_invoice(
    p_organization_id, p_entity_id, p_customer_invoice_id
  );

  v_result := jsonb_build_object(
    'success', true,
    'application_id', p_application_id,
    'application_date', p_application_date,
    'payment_id', p_payment_id,
    'customer_invoice_id', p_customer_invoice_id,
    'party_id', p_party_id,
    'applied_amount', round(p_amount, 2),
    'payment_allocated_amount', round(v_payment_allocated_after, 2),
    'payment_unapplied_amount', round(v_payment_unapplied_after, 2),
    'unapplied_cash_available_amount', round(v_available_after, 2),
    'invoice_outstanding_balance', round(v_balance_after, 2),
    'journal_entry_id', v_journal_entry_id,
    'journal', v_journal,
    'sales_order_reconciliation', v_reconciliation
  );

  perform public.finance_complete_idempotency(
    p_organization_id, p_entity_id, 'CUSTOMER_UNAPPLIED_CASH_APPLICATION',
    btrim(p_idempotency_key), v_result
  );
  return v_result;
end;
$$;

revoke all on function public.finance_apply_customer_unapplied_cash_party_idempotent(
  uuid,uuid,uuid,uuid,uuid,uuid,date,numeric,uuid,jsonb,text
) from public, anon, authenticated;
grant execute on function public.finance_apply_customer_unapplied_cash_party_idempotent(
  uuid,uuid,uuid,uuid,uuid,uuid,date,numeric,uuid,jsonb,text
) to service_role;

comment on function public.finance_apply_customer_unapplied_cash_party_idempotent(
  uuid,uuid,uuid,uuid,uuid,uuid,date,numeric,uuid,jsonb,text
) is 'Atomically applies existing customer unapplied cash/prepayment to an invoice on an explicit accounting date, updates AR and the payment, posts the configured liability release journal, and reconciles the source sales order. Service-role execution only; p_applied_by may be null for governed provider/system automation.';

commit;
