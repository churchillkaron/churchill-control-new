begin;

create or replace function public.finance_apply_customer_credit_portal_idempotent(
  p_organization_id uuid,
  p_entity_id uuid,
  p_party_id uuid,
  p_customer_credit_id uuid,
  p_target_invoice_id uuid,
  p_amount numeric,
  p_portal_session_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credit public.finance_customer_credits%rowtype;
  v_invoice public.customer_invoices%rowtype;
  v_ar public.accounts_receivable%rowtype;
  v_existing jsonb;
  v_request_hash text;
  v_before numeric;
  v_after numeric;
  v_credit_after numeric;
  v_result jsonb;
begin
  if p_organization_id is null or p_entity_id is null or p_party_id is null then
    raise exception 'organization_id, entity_id and party_id required';
  end if;
  if p_customer_credit_id is null or p_target_invoice_id is null then
    raise exception 'customer_credit_id and target_invoice_id required';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be greater than zero'; end if;
  if p_portal_session_id is null then raise exception 'portal_session_id required'; end if;
  if nullif(btrim(p_idempotency_key), '') is null then raise exception 'idempotency_key required'; end if;

  perform 1
  from public.customer_portal_sessions session
  where session.id = p_portal_session_id
    and session.organization_id = p_organization_id
    and session.party_id = p_party_id
    and session.revoked_at is null
    and session.expires_at > now();
  if not found then raise exception 'Active customer portal session required'; end if;

  v_request_hash := md5(concat_ws('|',
    p_customer_credit_id::text,
    p_target_invoice_id::text,
    p_amount::text,
    p_party_id::text,
    p_portal_session_id::text
  ));
  v_existing := public.finance_claim_idempotency(
    p_organization_id,
    p_entity_id,
    'CUSTOMER_CREDIT_APPLY_PORTAL',
    btrim(p_idempotency_key),
    v_request_hash,
    p_customer_credit_id
  );
  if v_existing is not null then return v_existing; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_organization_id::text || ':' || p_entity_id::text || ':customer-credit:' || p_party_id::text,
      0
    )
  );

  select * into v_credit
  from public.finance_customer_credits
  where id = p_customer_credit_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
    and party_id = p_party_id
  for update;
  if not found then raise exception 'Customer credit not found in scope'; end if;
  if v_credit.available_amount < p_amount - 0.005 then
    raise exception 'Customer credit amount exceeds available balance';
  end if;

  select * into v_invoice
  from public.customer_invoices
  where id = p_target_invoice_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
    and party_id = p_party_id
    and upper(coalesce(document_type, 'INVOICE')) = 'INVOICE'
  for update;
  if not found then raise exception 'Target customer invoice not found in scope'; end if;
  if upper(coalesce(v_invoice.currency_code, '')) <> upper(coalesce(v_credit.currency_code, '')) then
    raise exception 'Customer credit currency does not match target invoice';
  end if;

  select * into v_ar
  from public.accounts_receivable
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and party_id = p_party_id
    and customer_invoice_id = p_target_invoice_id
  for update;
  if not found then raise exception 'Accounts receivable entry not found for target invoice'; end if;

  v_before := greatest(coalesce(v_ar.outstanding_balance, v_ar.amount, 0), 0);
  if p_amount > v_before + 0.005 then
    raise exception 'Customer credit application exceeds target invoice outstanding balance';
  end if;
  v_after := greatest(v_before - p_amount, 0);
  v_credit_after := greatest(v_credit.available_amount - p_amount, 0);

  insert into public.finance_customer_credit_applications(
    organization_id,
    entity_id,
    party_id,
    customer_credit_id,
    target_invoice_id,
    amount,
    balance_before,
    balance_after,
    applied_by,
    idempotency_key,
    metadata
  ) values (
    p_organization_id,
    p_entity_id,
    p_party_id,
    p_customer_credit_id,
    p_target_invoice_id,
    p_amount,
    v_before,
    v_after,
    null,
    btrim(p_idempotency_key),
    jsonb_build_object(
      'kind', 'customer_credit_application',
      'actor_type', 'customer_portal',
      'customer_attributed', true,
      'customer_portal_session_id', p_portal_session_id
    )
  );

  update public.finance_customer_credits
  set available_amount = v_credit_after,
      applied_amount = applied_amount + p_amount,
      status = case when v_credit_after <= 0.005 then 'USED' else 'PARTIALLY_USED' end,
      updated_at = now()
  where id = p_customer_credit_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id;

  update public.accounts_receivable
  set outstanding_balance = v_after,
      status = case when v_after <= 0.005 then 'PAID' else 'PARTIAL' end,
      updated_at = now()
  where id = v_ar.id;

  update public.customer_invoices
  set outstanding_balance = v_after,
      outstanding_amount = v_after,
      status = case when v_after <= 0.005 then 'PAID' else 'PARTIAL' end,
      updated_at = now()
  where id = p_target_invoice_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id;

  v_result := jsonb_build_object(
    'success', true,
    'customer_credit_id', p_customer_credit_id,
    'target_invoice_id', p_target_invoice_id,
    'applied_amount', p_amount,
    'credit_available_amount', v_credit_after,
    'invoice_outstanding_balance', v_after,
    'actor_type', 'customer_portal',
    'customer_portal_session_id', p_portal_session_id,
    'sales_order_reconciliation', public.commercial_reconcile_sales_order_payment_from_invoice(
      p_organization_id,
      p_entity_id,
      p_target_invoice_id
    )
  );

  perform public.finance_complete_idempotency(
    p_organization_id,
    p_entity_id,
    'CUSTOMER_CREDIT_APPLY_PORTAL',
    btrim(p_idempotency_key),
    v_result
  );
  return v_result;
end;
$$;

revoke all on function public.finance_apply_customer_credit_portal_idempotent(
  uuid, uuid, uuid, uuid, uuid, numeric, uuid, text
) from public, anon, authenticated;
grant execute on function public.finance_apply_customer_credit_portal_idempotent(
  uuid, uuid, uuid, uuid, uuid, numeric, uuid, text
) to service_role;

comment on function public.finance_apply_customer_credit_portal_idempotent(
  uuid, uuid, uuid, uuid, uuid, numeric, uuid, text
) is 'Customer-attributed, party-scoped, active-portal-session-gated application of customer credit to an invoice. Service-role only.';

commit;
