begin;

create or replace function public.finalize_accounting_practice_billing_batch(
  p_accounting_firm_id uuid,
  p_batch_id uuid,
  p_invoice_id uuid,
  p_actor_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_batch public.accounting_practice_billing_batches%rowtype;
  v_profile public.accounting_practice_billing_profiles%rowtype;
  v_invoice public.customer_invoices%rowtype;
  v_expected_count integer := 0;
  v_valid_count integer := 0;
  v_billed_count integer := 0;
  v_now timestamptz := now();
  v_cadence text;
  v_billing_date date;
  v_next_billing_date date;
begin
  select * into v_batch
  from public.accounting_practice_billing_batches
  where id = p_batch_id
    and accounting_firm_id = p_accounting_firm_id
  for update;

  if not found then raise exception 'PRACTICE_BILLING_BATCH_NOT_FOUND'; end if;

  if v_batch.status = 'INVOICED' then
    if v_batch.invoice_id is distinct from p_invoice_id then
      raise exception 'PRACTICE_BILLING_BATCH_INVOICE_CONFLICT';
    end if;
    return jsonb_build_object(
      'billing_batch', to_jsonb(v_batch),
      'invoice_id', v_batch.invoice_id,
      'idempotent', true,
      'billed_entries', cardinality(v_batch.time_entry_ids)
    );
  end if;

  if v_batch.status not in ('PREPARING','FAILED') then
    raise exception 'PRACTICE_BILLING_BATCH_NOT_FINALIZABLE';
  end if;

  select * into v_invoice
  from public.customer_invoices
  where id = p_invoice_id
    and organization_id = p_accounting_firm_id
    and upper(coalesce(source_document_type, '')) = 'ACCOUNTING_PRACTICE_WIP'
    and source_document_id = v_batch.id
  for update;

  if not found then raise exception 'PRACTICE_BILLING_INVOICE_SOURCE_MISMATCH'; end if;

  select * into v_profile
  from public.accounting_practice_billing_profiles
  where id = v_batch.billing_profile_id
    and accounting_firm_id = p_accounting_firm_id
    and engagement_id = v_batch.engagement_id
    and status = 'ACTIVE'
  for update;

  if not found then raise exception 'PRACTICE_BILLING_PROFILE_UNAVAILABLE'; end if;

  v_expected_count := cardinality(v_batch.time_entry_ids);

  if v_expected_count > 0 then
    select count(*) into v_valid_count
    from public.accounting_practice_time_entries e
    where e.id = any(v_batch.time_entry_ids)
      and e.accounting_firm_id = p_accounting_firm_id
      and e.engagement_id = v_batch.engagement_id
      and e.billable = true
      and (
        e.status = 'APPROVED'
        or (
          e.status = 'BILLED'
          and e.billing_reference = p_invoice_id::text
          and e.billed_at is not null
        )
      );

    if v_valid_count <> v_expected_count then
      raise exception 'PRACTICE_BILLING_WIP_SCOPE_CHANGED';
    end if;

    update public.accounting_practice_time_entries
    set status = 'BILLED',
        billing_reference = p_invoice_id::text,
        billed_at = coalesce(billed_at, v_now),
        updated_at = v_now
    where id = any(v_batch.time_entry_ids)
      and accounting_firm_id = p_accounting_firm_id
      and engagement_id = v_batch.engagement_id
      and billable = true
      and status = 'APPROVED';

    select count(*) into v_billed_count
    from public.accounting_practice_time_entries e
    where e.id = any(v_batch.time_entry_ids)
      and e.accounting_firm_id = p_accounting_firm_id
      and e.engagement_id = v_batch.engagement_id
      and e.status = 'BILLED'
      and e.billing_reference = p_invoice_id::text
      and e.billed_at is not null;

    if v_billed_count <> v_expected_count then
      raise exception 'PRACTICE_BILLING_WIP_FINALIZATION_INCOMPLETE';
    end if;
  end if;

  v_cadence := upper(coalesce(v_batch.metadata->>'billing_cadence', v_profile.billing_cadence, 'ON_DEMAND'));
  if v_cadence <> upper(coalesce(v_profile.billing_cadence, 'ON_DEMAND')) then
    raise exception 'PRACTICE_BILLING_CADENCE_CHANGED_DURING_INVOICE';
  end if;

  if v_cadence <> 'ON_DEMAND' then
    v_billing_date := nullif(v_batch.metadata->>'billing_date', '')::date;
    if v_billing_date is null then raise exception 'PRACTICE_BILLING_DATE_SNAPSHOT_REQUIRED'; end if;
    if v_profile.next_billing_date is distinct from v_billing_date then
      raise exception 'PRACTICE_BILLING_DATE_CHANGED_DURING_INVOICE';
    end if;

    if v_cadence = 'MONTHLY' then
      v_next_billing_date := (v_billing_date + interval '1 month')::date;
    elsif v_cadence = 'QUARTERLY' then
      v_next_billing_date := (v_billing_date + interval '3 months')::date;
    elsif v_cadence = 'ANNUAL' then
      v_next_billing_date := (v_billing_date + interval '1 year')::date;
    else
      raise exception 'PRACTICE_BILLING_CADENCE_INVALID';
    end if;

    update public.accounting_practice_billing_profiles
    set next_billing_date = v_next_billing_date,
        updated_at = v_now,
        updated_by = p_actor_id
    where id = v_profile.id
      and accounting_firm_id = p_accounting_firm_id;
  end if;

  update public.accounting_practice_billing_batches
  set status = 'INVOICED',
      invoice_id = p_invoice_id,
      invoiced_at = coalesce(invoiced_at, v_now),
      failure_reason = null,
      updated_at = v_now
  where id = v_batch.id
    and accounting_firm_id = p_accounting_firm_id
  returning * into v_batch;

  return jsonb_build_object(
    'billing_batch', to_jsonb(v_batch),
    'invoice_id', p_invoice_id,
    'idempotent', false,
    'billed_entries', v_billed_count,
    'next_billing_date', v_next_billing_date
  );
end;
$$;

revoke all on function public.finalize_accounting_practice_billing_batch(uuid,uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_accounting_practice_billing_batch(uuid,uuid,uuid,uuid)
  to service_role;

commit;
