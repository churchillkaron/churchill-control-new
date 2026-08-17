begin;

create or replace function public.finance_post_customer_prepayment_party_idempotent(
  p_payment_id uuid,
  p_organization_id uuid,
  p_entity_id uuid,
  p_party_id uuid,
  p_payment_date date,
  p_payment_amount numeric,
  p_bank_account_id uuid,
  p_payment_method text,
  p_reference_number text,
  p_received_by uuid,
  p_currency_code text,
  p_exchange_rate numeric,
  p_journal_lines jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
  v_payment public.customer_payments%rowtype;
begin
  select public.finance_post_customer_receipt_party_idempotent(
    p_payment_id => p_payment_id,
    p_organization_id => p_organization_id,
    p_entity_id => p_entity_id,
    p_party_id => p_party_id,
    p_payment_date => p_payment_date,
    p_payment_amount => p_payment_amount,
    p_bank_account_id => p_bank_account_id,
    p_payment_method => p_payment_method,
    p_reference_number => p_reference_number,
    p_paid_by => p_received_by,
    p_currency_code => p_currency_code,
    p_exchange_rate => p_exchange_rate,
    p_allocations => '[]'::jsonb,
    p_journal_lines => p_journal_lines,
    p_idempotency_key => p_idempotency_key
  ) into v_result;

  update public.customer_payments
  set status = 'UNAPPLIED',
      allocated_amount = 0,
      unapplied_amount = amount,
      updated_at = now()
  where id = p_payment_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
    and party_id = p_party_id
    and coalesce(allocated_amount, 0) = 0
    and upper(coalesce(status, '')) not in ('REVERSED', 'REFUNDED');

  select * into v_payment
  from public.customer_payments
  where id = p_payment_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
    and party_id = p_party_id;

  if not found then raise exception 'Customer prepayment receipt not found after posting'; end if;

  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
    'payment', to_jsonb(v_payment),
    'payment_id', p_payment_id,
    'status', v_payment.status,
    'prepayment', true
  );
end;
$$;

revoke all on function public.finance_post_customer_prepayment_party_idempotent(
  uuid,uuid,uuid,uuid,date,numeric,uuid,text,text,uuid,text,numeric,jsonb,text
) from public, anon, authenticated;
grant execute on function public.finance_post_customer_prepayment_party_idempotent(
  uuid,uuid,uuid,uuid,date,numeric,uuid,text,text,uuid,text,numeric,jsonb,text
) to service_role;

comment on function public.finance_post_customer_prepayment_party_idempotent(
  uuid,uuid,uuid,uuid,date,numeric,uuid,text,text,uuid,text,numeric,jsonb,text
) is 'Posts a customer prepayment through the canonical customer receipt lifecycle with zero invoice allocations and normalizes the payment state to UNAPPLIED. Service-role only; p_received_by may be null for governed automation.';

commit;
