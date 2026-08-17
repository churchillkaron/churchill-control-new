create or replace function public.finance_refund_customer_prepayment_against_invoice_idempotent(
  p_operation_id uuid,
  p_reversal_id uuid,
  p_credit_note_id uuid,
  p_refund_id uuid,
  p_organization_id uuid,
  p_entity_id uuid,
  p_party_id uuid,
  p_payment_id uuid,
  p_customer_invoice_id uuid,
  p_refund_date date,
  p_amount numeric,
  p_expected_applied_amount numeric,
  p_bank_account_id uuid,
  p_reference_number text,
  p_reason text,
  p_actor_id uuid,
  p_reversal_journal_lines jsonb,
  p_refund_journal_lines jsonb,
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
  v_unapplied public.finance_customer_unapplied_cash%rowtype;
  v_allocation public.finance_customer_payment_allocations%rowtype;
  v_available_component numeric := 0;
  v_applied_component numeric := 0;
  v_reversible_amount numeric := 0;
  v_reversal jsonb := null;
  v_credit jsonb := null;
  v_refund jsonb := null;
begin
  if p_operation_id is null then raise exception 'operation_id required'; end if;
  if p_reversal_id is null then raise exception 'reversal_id required'; end if;
  if p_credit_note_id is null then raise exception 'credit_note_id required'; end if;
  if p_refund_id is null then raise exception 'refund_id required'; end if;
  if p_organization_id is null or p_entity_id is null then raise exception 'organization_id and entity_id required'; end if;
  if p_party_id is null then raise exception 'party_id required'; end if;
  if p_payment_id is null then raise exception 'payment_id required'; end if;
  if p_customer_invoice_id is null then raise exception 'customer_invoice_id required'; end if;
  if p_refund_date is null then raise exception 'refund_date required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be greater than zero'; end if;
  if p_expected_applied_amount is null or p_expected_applied_amount < 0 then raise exception 'expected_applied_amount must not be negative'; end if;
  if p_bank_account_id is null then raise exception 'bank_account_id required'; end if;
  if p_refund_journal_lines is null or jsonb_typeof(p_refund_journal_lines) <> 'array' or jsonb_array_length(p_refund_journal_lines) < 2 then
    raise exception 'refund journal lines required';
  end if;
  if nullif(btrim(p_idempotency_key), '') is null then raise exception 'idempotency_key required'; end if;

  v_request_hash := md5(concat_ws(
    '|', p_payment_id::text, p_customer_invoice_id::text, p_refund_date::text,
    round(p_amount, 2)::text, p_bank_account_id::text, coalesce(btrim(p_reference_number), '')
  ));

  v_existing := public.finance_claim_idempotency(
    p_organization_id,
    p_entity_id,
    'CUSTOMER_PREPAYMENT_INVOICE_REFUND',
    btrim(p_idempotency_key),
    v_request_hash,
    p_operation_id
  );
  if v_existing is not null then return v_existing; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_organization_id::text || ':' || p_entity_id::text || ':customer-prepayment-invoice-refund:' || p_payment_id::text || ':' || p_customer_invoice_id::text,
      0
    )
  );

  select * into v_unapplied
  from public.finance_customer_unapplied_cash
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and party_id = p_party_id
    and customer_payment_id = p_payment_id
  for update;
  if not found then raise exception 'Unapplied customer cash not found'; end if;

  select * into v_allocation
  from public.finance_customer_payment_allocations
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and party_id = p_party_id
    and customer_payment_id = p_payment_id
    and customer_invoice_id = p_customer_invoice_id
  for update;

  v_available_component := least(greatest(coalesce(v_unapplied.available_amount, 0), 0), p_amount);
  v_applied_component := greatest(p_amount - v_available_component, 0);

  if found then
    v_reversible_amount := greatest(coalesce(v_allocation.allocated_amount, 0) - coalesce(v_allocation.reversed_amount, 0), 0);
  else
    v_reversible_amount := 0;
  end if;

  if v_applied_component > v_reversible_amount + 0.005 then
    raise exception 'Refund amount exceeds available and applied customer prepayment balance';
  end if;

  if abs(v_applied_component - p_expected_applied_amount) > 0.005 then
    raise exception 'Customer prepayment refund allocation changed; retry with fresh accounting state';
  end if;

  if v_applied_component > 0.005 then
    if p_reversal_journal_lines is null
       or jsonb_typeof(p_reversal_journal_lines) <> 'array'
       or jsonb_array_length(p_reversal_journal_lines) < 2 then
      raise exception 'reversal journal lines required for applied customer prepayment refund';
    end if;

    v_reversal := public.finance_reverse_customer_unapplied_cash_application_party_idempotent(
      p_reversal_id,
      p_organization_id,
      p_entity_id,
      p_party_id,
      p_payment_id,
      p_customer_invoice_id,
      p_refund_date,
      v_applied_component,
      p_actor_id,
      p_reversal_journal_lines,
      btrim(p_idempotency_key) || ':allocation-reversal'
    );

    v_credit := public.finance_issue_customer_credit_note_idempotent(
      p_credit_note_id,
      p_organization_id,
      p_entity_id,
      p_party_id,
      p_customer_invoice_id,
      p_refund_date,
      v_applied_component,
      coalesce(nullif(btrim(p_reason), ''), 'Customer prepayment refund'),
      p_actor_id,
      btrim(p_idempotency_key) || ':credit-note',
      'CN'
    );
  end if;

  v_refund := public.finance_refund_customer_unapplied_cash_party_idempotent(
    p_refund_id,
    p_organization_id,
    p_entity_id,
    p_party_id,
    p_payment_id,
    p_refund_date,
    p_amount,
    p_bank_account_id,
    p_reference_number,
    p_actor_id,
    p_refund_journal_lines,
    btrim(p_idempotency_key) || ':cash-refund'
  );

  v_result := jsonb_build_object(
    'success', true,
    'operation_id', p_operation_id,
    'payment_id', p_payment_id,
    'customer_invoice_id', p_customer_invoice_id,
    'refunded_amount', round(p_amount, 2),
    'available_component', round(v_available_component, 2),
    'applied_component', round(v_applied_component, 2),
    'allocation_reversal', v_reversal,
    'credit_note', v_credit,
    'cash_refund', v_refund
  );

  perform public.finance_complete_idempotency(
    p_organization_id,
    p_entity_id,
    'CUSTOMER_PREPAYMENT_INVOICE_REFUND',
    btrim(p_idempotency_key),
    v_result
  );

  return v_result;
end;
$function$;

revoke all on function public.finance_refund_customer_prepayment_against_invoice_idempotent(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, date, numeric, numeric, uuid, text, text, uuid, jsonb, jsonb, text
) from public, anon, authenticated;

grant execute on function public.finance_refund_customer_prepayment_against_invoice_idempotent(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, date, numeric, numeric, uuid, text, text, uuid, jsonb, jsonb, text
) to service_role;