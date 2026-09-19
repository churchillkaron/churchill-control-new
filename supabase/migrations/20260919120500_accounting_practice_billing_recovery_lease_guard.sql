begin;

create or replace function public.recover_accounting_practice_billing_batch(
  p_accounting_firm_id uuid,
  p_batch_id uuid,
  p_actor_id uuid,
  p_stale_after interval default interval '15 minutes'
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_batch public.accounting_practice_billing_batches%rowtype;
  v_invoice public.customer_invoices%rowtype;
  v_finalization jsonb;
begin
  select * into v_batch
  from public.accounting_practice_billing_batches
  where id = p_batch_id
    and accounting_firm_id = p_accounting_firm_id
  for update;

  if not found then raise exception 'PRACTICE_BILLING_BATCH_NOT_FOUND'; end if;

  if v_batch.status = 'INVOICED' then
    return jsonb_build_object(
      'state', 'INVOICED',
      'billing_batch', to_jsonb(v_batch) - 'invoice_lease_token',
      'invoice_id', v_batch.invoice_id
    );
  end if;

  if v_batch.status = 'VOID' then
    return jsonb_build_object(
      'state', 'VOID',
      'billing_batch', to_jsonb(v_batch) - 'invoice_lease_token'
    );
  end if;

  if v_batch.status not in ('PREPARING','FAILED') then
    raise exception 'PRACTICE_BILLING_BATCH_NOT_RECOVERABLE';
  end if;

  select * into v_invoice
  from public.customer_invoices
  where organization_id = p_accounting_firm_id
    and upper(coalesce(source_document_type, '')) = 'ACCOUNTING_PRACTICE_WIP'
    and source_document_id = v_batch.id
  order by created_at asc
  limit 1
  for update;

  if found then
    v_finalization := public.finalize_accounting_practice_billing_batch(
      p_accounting_firm_id,
      v_batch.id,
      v_invoice.id,
      p_actor_id
    );
    return jsonb_build_object(
      'state', 'RECOVERED_INVOICE',
      'billing_batch', v_finalization->'billing_batch',
      'invoice_id', v_invoice.id,
      'finalization', v_finalization
    );
  end if;

  if v_batch.invoice_lease_token is not null
     and v_batch.invoice_lease_expires_at is not null
     and v_batch.invoice_lease_expires_at > now() then
    return jsonb_build_object(
      'state', 'WAITING',
      'billing_batch', to_jsonb(v_batch) - 'invoice_lease_token',
      'retry_after', v_batch.invoice_lease_expires_at,
      'reason', 'ACTIVE_INVOICE_LEASE'
    );
  end if;

  if v_batch.status = 'FAILED'
     or v_batch.created_at <= now() - greatest(coalesce(p_stale_after, interval '15 minutes'), interval '1 minute') then
    update public.accounting_practice_billing_batches
    set status = 'VOID',
        failure_reason = case
          when v_batch.status = 'FAILED' then coalesce(v_batch.failure_reason, 'Voided during governed recovery before invoice creation')
          else 'Stale PREPARING batch voided during governed recovery before invoice creation'
        end,
        invoice_lease_token = null,
        invoice_lease_expires_at = null,
        updated_at = now()
    where id = v_batch.id
      and accounting_firm_id = p_accounting_firm_id
      and status in ('PREPARING','FAILED')
      and (
        invoice_lease_token is null
        or invoice_lease_expires_at is null
        or invoice_lease_expires_at <= now()
      )
    returning * into v_batch;

    if v_batch.id is null then
      select * into v_batch
      from public.accounting_practice_billing_batches
      where id = p_batch_id
        and accounting_firm_id = p_accounting_firm_id;

      return jsonb_build_object(
        'state', 'WAITING',
        'billing_batch', to_jsonb(v_batch) - 'invoice_lease_token',
        'retry_after', v_batch.invoice_lease_expires_at,
        'reason', 'LEASE_ACQUIRED_DURING_RECOVERY'
      );
    end if;

    return jsonb_build_object(
      'state', 'VOIDED_UNINVOICED',
      'billing_batch', to_jsonb(v_batch) - 'invoice_lease_token'
    );
  end if;

  return jsonb_build_object(
    'state', 'WAITING',
    'billing_batch', to_jsonb(v_batch) - 'invoice_lease_token',
    'retry_after', v_batch.created_at + greatest(coalesce(p_stale_after, interval '15 minutes'), interval '1 minute'),
    'reason', 'BATCH_NOT_STALE'
  );
end;
$$;

revoke all on function public.recover_accounting_practice_billing_batch(uuid,uuid,uuid,interval)
  from public, anon, authenticated;
grant execute on function public.recover_accounting_practice_billing_batch(uuid,uuid,uuid,interval)
  to service_role;

commit;
