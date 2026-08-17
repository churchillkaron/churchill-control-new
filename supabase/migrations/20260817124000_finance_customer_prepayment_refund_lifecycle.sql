begin;

alter table public.finance_customer_unapplied_cash
  add column if not exists refunded_amount numeric not null default 0;

alter table public.finance_customer_unapplied_cash
  drop constraint if exists finance_customer_unapplied_cash_status_check;

alter table public.finance_customer_unapplied_cash
  add constraint finance_customer_unapplied_cash_status_check
  check (upper(status) = any (array[
    'OPEN'::text,
    'PARTIALLY_APPLIED'::text,
    'PARTIALLY_REFUNDED'::text,
    'APPLIED'::text,
    'REFUNDED'::text,
    'APPLIED_AND_REFUNDED'::text
  ]));

alter table public.finance_customer_unapplied_cash
  drop constraint if exists finance_customer_unapplied_cash_refunded_amount_check;

alter table public.finance_customer_unapplied_cash
  add constraint finance_customer_unapplied_cash_refunded_amount_check
  check (refunded_amount >= 0 and refunded_amount <= original_amount);

alter table public.finance_customer_unapplied_cash
  drop constraint if exists finance_customer_unapplied_cash_balance_components_check;

alter table public.finance_customer_unapplied_cash
  add constraint finance_customer_unapplied_cash_balance_components_check
  check (available_amount + refunded_amount <= original_amount + 0.005);

create or replace function public.finance_refund_customer_unapplied_cash_party_idempotent(
  p_refund_id uuid,
  p_organization_id uuid,
  p_entity_id uuid,
  p_party_id uuid,
  p_payment_id uuid,
  p_refund_date date,
  p_amount numeric,
  p_bank_account_id uuid,
  p_reference_number text,
  p_refunded_by uuid,
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
  v_bank record;
  v_available_after numeric;
  v_refunded_after numeric;
  v_applied_amount numeric;
  v_unapplied_status text;
  v_payment_unapplied_after numeric;
  v_payment_status text;
  v_journal jsonb;
  v_journal_entry_id uuid;
  v_bank_ledger_id uuid;
  v_now timestamptz := now();
begin
  if p_refund_id is null then raise exception 'refund_id required'; end if;
  if p_organization_id is null or p_entity_id is null then raise exception 'organization_id and entity_id required'; end if;
  if p_party_id is null then raise exception 'party_id required'; end if;
  if p_payment_id is null then raise exception 'payment_id required'; end if;
  if p_refund_date is null then raise exception 'refund_date required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be greater than zero'; end if;
  if p_bank_account_id is null then raise exception 'bank_account_id required'; end if;
  if p_journal_lines is null or jsonb_typeof(p_journal_lines) <> 'array' or jsonb_array_length(p_journal_lines) < 2 then
    raise exception 'balanced journal lines required';
  end if;
  if nullif(btrim(p_idempotency_key), '') is null then raise exception 'idempotency_key required'; end if;

  v_request_hash := md5(concat_ws(
    '|', p_party_id::text, p_payment_id::text, p_refund_date::text,
    round(p_amount, 2)::text, p_bank_account_id::text,
    coalesce(btrim(p_reference_number), ''), p_journal_lines::text
  ));

  v_existing := public.finance_claim_idempotency(
    p_organization_id, p_entity_id, 'CUSTOMER_UNAPPLIED_CASH_REFUND',
    btrim(p_idempotency_key), v_request_hash, p_refund_id
  );
  if v_existing is not null then return v_existing; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_organization_id::text || ':' || p_entity_id::text || ':customer-unapplied-cash-refund:' || p_payment_id::text,
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
    raise exception 'Customer payment is already reversed or fully refunded';
  end if;

  select * into v_unapplied
  from public.finance_customer_unapplied_cash
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and party_id = p_party_id
    and customer_payment_id = p_payment_id
  for update;
  if not found then raise exception 'Unapplied customer cash not found'; end if;

  if coalesce(v_unapplied.available_amount, 0) <= 0.005 then
    raise exception 'Customer payment has no unapplied cash available for refund';
  end if;
  if p_amount > coalesce(v_unapplied.available_amount, 0) + 0.005 then
    raise exception 'Refund amount exceeds available unapplied cash';
  end if;

  select id, coalesce(nullif(currency_code, ''), nullif(currency, '')) as currency, active
  into v_bank
  from public.bank_accounts
  where id = p_bank_account_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id;
  if not found or v_bank.active = false then raise exception 'Bank account not found or inactive in organization and entity scope'; end if;
  if nullif(btrim(v_bank.currency), '') is not null
     and upper(btrim(v_bank.currency)) <> upper(btrim(v_unapplied.currency_code)) then
    raise exception 'Bank account currency does not match prepayment currency';
  end if;

  v_available_after := greatest(coalesce(v_unapplied.available_amount, 0) - p_amount, 0);
  if abs(v_available_after) <= 0.005 then v_available_after := 0; end if;
  v_refunded_after := coalesce(v_unapplied.refunded_amount, 0) + p_amount;
  v_applied_amount := greatest(v_unapplied.original_amount - v_available_after - v_refunded_after, 0);

  v_unapplied_status := case
    when v_available_after > 0.005 and v_applied_amount > 0.005 then 'PARTIALLY_APPLIED'
    when v_available_after > 0.005 and v_refunded_after > 0.005 then 'PARTIALLY_REFUNDED'
    when v_available_after > 0.005 then 'OPEN'
    when v_applied_amount > 0.005 and v_refunded_after > 0.005 then 'APPLIED_AND_REFUNDED'
    when v_refunded_after + 0.005 >= v_unapplied.original_amount then 'REFUNDED'
    else 'APPLIED'
  end;

  v_payment_unapplied_after := greatest(coalesce(v_payment.unapplied_amount, 0) - p_amount, 0);
  if abs(v_payment_unapplied_after) <= 0.005 then v_payment_unapplied_after := 0; end if;
  v_payment_status := case
    when v_payment_unapplied_after > 0.005 and coalesce(v_payment.allocated_amount, 0) > 0.005 then 'PARTIALLY_APPLIED'
    when v_payment_unapplied_after > 0.005 then 'UNAPPLIED'
    when coalesce(v_payment.allocated_amount, 0) > 0.005 then 'APPLIED'
    when v_refunded_after + 0.005 >= v_payment.amount then 'REFUNDED'
    else 'PARTIALLY_REFUNDED'
  end;

  update public.finance_customer_unapplied_cash
  set available_amount = v_available_after,
      refunded_amount = v_refunded_after,
      status = v_unapplied_status,
      refunded_at = case when v_available_after = 0 then v_now else refunded_at end,
      refunded_by = p_refunded_by,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'last_refund_id', p_refund_id,
        'last_refund_date', p_refund_date,
        'last_refund_amount', p_amount,
        'last_refunded_at', v_now
      ),
      updated_at = v_now
  where id = v_unapplied.id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
    and party_id = p_party_id;

  update public.customer_payments
  set unapplied_amount = v_payment_unapplied_after,
      status = v_payment_status,
      refunded_at = case when v_payment_status = 'REFUNDED' then v_now else refunded_at end,
      updated_at = v_now
  where id = p_payment_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
    and party_id = p_party_id;

  insert into public.bank_ledger (
    organization_id, entity_id, bank_account_id, transaction_type, reference_id,
    source_document, source_document_id, reference_number, amount, currency_code,
    exchange_rate, direction, created_at, updated_at
  ) values (
    p_organization_id, p_entity_id, p_bank_account_id, 'CUSTOMER_PREPAYMENT_REFUND', p_refund_id,
    'customer_prepayment_refund', p_refund_id, nullif(btrim(p_reference_number), ''),
    p_amount, upper(btrim(v_unapplied.currency_code)), v_unapplied.exchange_rate,
    'OUTFLOW', v_now, v_now
  ) returning id into v_bank_ledger_id;

  select public.finance_post_journal_atomic(
    p_organization_id => p_organization_id,
    p_entity_id => p_entity_id,
    p_posting_date => p_refund_date,
    p_document_date => p_refund_date,
    p_journal_type => 'SYSTEM',
    p_reference => 'accounts_receivable:prepayment-refund:' || p_refund_id::text,
    p_source_module => 'accounts_receivable',
    p_source_document => 'CUSTOMER_UNAPPLIED_CASH_REFUNDED',
    p_source_document_id => p_refund_id,
    p_description => 'Customer prepayment refund ' || coalesce(nullif(btrim(p_reference_number), ''), p_refund_id::text),
    p_currency_code => upper(btrim(v_unapplied.currency_code)),
    p_exchange_rate => v_unapplied.exchange_rate,
    p_lines => p_journal_lines,
    p_created_by => p_refunded_by,
    p_idempotency_key => 'accounting-event:CUSTOMER_UNAPPLIED_CASH_REFUND:' || p_refund_id::text
  ) into v_journal;

  v_journal_entry_id := nullif(v_journal->'journal'->>'id', '')::uuid;
  if v_journal_entry_id is null then raise exception 'Customer prepayment refund did not return a journal entry'; end if;

  update public.bank_ledger
  set journal_entry_id = v_journal_entry_id, updated_at = v_now
  where id = v_bank_ledger_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id;

  v_result := jsonb_build_object(
    'success', true,
    'refund_id', p_refund_id,
    'refund_date', p_refund_date,
    'payment_id', p_payment_id,
    'party_id', p_party_id,
    'refunded_amount', round(p_amount, 2),
    'total_refunded_amount', round(v_refunded_after, 2),
    'unapplied_cash_available_amount', round(v_available_after, 2),
    'unapplied_cash_status', v_unapplied_status,
    'payment_status', v_payment_status,
    'bank_account_id', p_bank_account_id,
    'bank_ledger_id', v_bank_ledger_id,
    'journal_entry_id', v_journal_entry_id,
    'journal', v_journal
  );

  perform public.finance_complete_idempotency(
    p_organization_id, p_entity_id, 'CUSTOMER_UNAPPLIED_CASH_REFUND',
    btrim(p_idempotency_key), v_result
  );
  return v_result;
end;
$$;

revoke all on function public.finance_refund_customer_unapplied_cash_party_idempotent(
  uuid,uuid,uuid,uuid,uuid,date,numeric,uuid,text,uuid,jsonb,text
) from public, anon, authenticated;
grant execute on function public.finance_refund_customer_unapplied_cash_party_idempotent(
  uuid,uuid,uuid,uuid,uuid,date,numeric,uuid,text,uuid,jsonb,text
) to service_role;

comment on function public.finance_refund_customer_unapplied_cash_party_idempotent(
  uuid,uuid,uuid,uuid,uuid,date,numeric,uuid,text,uuid,jsonb,text
) is 'Refunds only the available portion of a customer prepayment/unapplied-cash balance without reversing previously applied invoice allocations. Posts a bank outflow and configured liability-release journal. Service-role only; p_refunded_by may be null for governed automation.';

commit;
