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
  v_void_reason text;
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
    v_void_reason := case
      when v_batch.status = 'FAILED' then coalesce(v_batch.failure_reason, 'Voided during governed recovery before invoice creation')
      else 'Stale PREPARING batch voided during governed recovery before invoice creation'
    end;

    update public.accounting_practice_billing_batches
    set status = 'VOID',
        failure_reason = v_void_reason,
        invoice_lease_token = null,
        invoice_lease_expires_at = null,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'recovery_auto_void', true,
          'recovery_auto_voided_at', now(),
          'recovery_auto_void_reason', v_void_reason
        ),
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

create or replace function public.claim_accounting_practice_billing_batch(
  p_accounting_firm_id uuid,
  p_organization_id uuid,
  p_engagement_id uuid,
  p_billing_period_key text,
  p_billing_profile_id uuid,
  p_time_entry_ids uuid[],
  p_service_period_start date,
  p_service_period_end date,
  p_subtotal numeric,
  p_tax_amount numeric,
  p_total_amount numeric,
  p_currency_code text,
  p_idempotency_key text,
  p_prepared_by uuid,
  p_metadata jsonb
) returns public.accounting_practice_billing_batches
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_batch public.accounting_practice_billing_batches%rowtype;
  v_invoice public.customer_invoices%rowtype;
  v_entry_ids uuid[] := coalesce(p_time_entry_ids, '{}'::uuid[]);
  v_currency text := upper(trim(coalesce(p_currency_code, '')));
  v_reopen_count integer := 0;
begin
  if trim(coalesce(p_idempotency_key, '')) = '' then raise exception 'PRACTICE_BILLING_IDEMPOTENCY_KEY_REQUIRED'; end if;
  if trim(coalesce(p_billing_period_key, '')) = '' then raise exception 'PRACTICE_BILLING_PERIOD_KEY_REQUIRED'; end if;
  if v_currency !~ '^[A-Z]{3}$' then raise exception 'PRACTICE_BILLING_CURRENCY_INVALID'; end if;
  if coalesce(p_subtotal, -1) < 0 or coalesce(p_tax_amount, -1) < 0 or coalesce(p_total_amount, -1) < 0 then
    raise exception 'PRACTICE_BILLING_AMOUNT_INVALID';
  end if;
  if round((coalesce(p_subtotal, 0) + coalesce(p_tax_amount, 0))::numeric, 4)
     <> round(coalesce(p_total_amount, 0)::numeric, 4) then
    raise exception 'PRACTICE_BILLING_TOTAL_MISMATCH';
  end if;

  perform 1 from public.accounting_engagements e
  where e.id = p_engagement_id
    and e.accounting_firm_id = p_accounting_firm_id
    and e.organization_id = p_organization_id
    and e.status = 'ACTIVE';
  if not found then raise exception 'PRACTICE_BILLING_ENGAGEMENT_UNAVAILABLE'; end if;

  perform 1 from public.accounting_practice_billing_profiles p
  where p.id = p_billing_profile_id
    and p.accounting_firm_id = p_accounting_firm_id
    and p.organization_id = p_organization_id
    and p.engagement_id = p_engagement_id
    and p.status = 'ACTIVE';
  if not found then raise exception 'PRACTICE_BILLING_PROFILE_UNAVAILABLE'; end if;

  insert into public.accounting_practice_billing_batches (
    accounting_firm_id, organization_id, engagement_id, billing_period_key, billing_profile_id,
    time_entry_ids, service_period_start, service_period_end, subtotal, tax_amount, total_amount,
    currency_code, status, idempotency_key, prepared_by, metadata
  ) values (
    p_accounting_firm_id, p_organization_id, p_engagement_id, p_billing_period_key, p_billing_profile_id,
    v_entry_ids, p_service_period_start, p_service_period_end, p_subtotal, p_tax_amount, p_total_amount,
    v_currency, 'PREPARING', p_idempotency_key, p_prepared_by, coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (accounting_firm_id, idempotency_key) do nothing
  returning * into v_batch;

  if v_batch.id is null then
    select * into v_batch
    from public.accounting_practice_billing_batches b
    where b.accounting_firm_id = p_accounting_firm_id
      and b.idempotency_key = p_idempotency_key
    for update;

    if not found then raise exception 'PRACTICE_BILLING_BATCH_CLAIM_LOST'; end if;

    if v_batch.organization_id is distinct from p_organization_id
       or v_batch.engagement_id is distinct from p_engagement_id
       or v_batch.billing_period_key is distinct from p_billing_period_key
       or v_batch.billing_profile_id is distinct from p_billing_profile_id
       or v_batch.time_entry_ids is distinct from v_entry_ids
       or v_batch.service_period_start is distinct from p_service_period_start
       or v_batch.service_period_end is distinct from p_service_period_end
       or round(v_batch.subtotal::numeric, 4) is distinct from round(p_subtotal::numeric, 4)
       or round(v_batch.tax_amount::numeric, 4) is distinct from round(p_tax_amount::numeric, 4)
       or round(v_batch.total_amount::numeric, 4) is distinct from round(p_total_amount::numeric, 4)
       or upper(v_batch.currency_code) is distinct from v_currency then
      raise exception 'PRACTICE_BILLING_IDEMPOTENCY_SCOPE_CONFLICT';
    end if;

    if v_batch.status = 'VOID' then
      if coalesce(v_batch.metadata->>'recovery_auto_void', 'false') <> 'true' then
        raise exception 'PRACTICE_BILLING_VOID_BATCH_NOT_RETRYABLE';
      end if;

      select * into v_invoice
      from public.customer_invoices
      where organization_id = p_accounting_firm_id
        and upper(coalesce(source_document_type, '')) = 'ACCOUNTING_PRACTICE_WIP'
        and source_document_id = v_batch.id
      order by created_at asc
      limit 1
      for update;

      begin
        v_reopen_count := greatest(0, coalesce((v_batch.metadata->>'recovery_reopen_count')::integer, 0));
      exception when others then
        v_reopen_count := 0;
      end;

      update public.accounting_practice_billing_batches
      set status = 'PREPARING',
          failure_reason = null,
          prepared_by = coalesce(p_prepared_by, prepared_by),
          invoice_lease_token = null,
          invoice_lease_expires_at = null,
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'recovery_auto_void', false,
            'recovery_reopened_at', now(),
            'recovery_reopen_count', v_reopen_count + 1
          ),
          updated_at = now()
      where id = v_batch.id
        and accounting_firm_id = p_accounting_firm_id
      returning * into v_batch;

      if v_invoice.id is not null then
        perform public.finalize_accounting_practice_billing_batch(
          p_accounting_firm_id,
          v_batch.id,
          v_invoice.id,
          p_prepared_by
        );
        select * into v_batch
        from public.accounting_practice_billing_batches
        where id = v_batch.id
          and accounting_firm_id = p_accounting_firm_id;
      end if;
    end if;
  end if;

  return v_batch;
end;
$$;

revoke all on function public.recover_accounting_practice_billing_batch(uuid,uuid,uuid,interval)
  from public, anon, authenticated;
grant execute on function public.recover_accounting_practice_billing_batch(uuid,uuid,uuid,interval)
  to service_role;

revoke all on function public.claim_accounting_practice_billing_batch(
  uuid,uuid,uuid,text,uuid,uuid[],date,date,numeric,numeric,numeric,text,text,uuid,jsonb
) from public, anon, authenticated;
grant execute on function public.claim_accounting_practice_billing_batch(
  uuid,uuid,uuid,text,uuid,uuid[],date,date,numeric,numeric,numeric,text,text,uuid,jsonb
) to service_role;

commit;
