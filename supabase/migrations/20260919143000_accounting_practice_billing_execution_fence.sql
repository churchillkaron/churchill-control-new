begin;

create or replace function public.guard_accounting_practice_billing_profile_execution_fence()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.accounting_practice_billing_batches b
    where b.accounting_firm_id = old.accounting_firm_id
      and b.engagement_id = old.engagement_id
      and b.status in ('PREPARING','FAILED')
      and b.invoice_lease_token is not null
      and b.invoice_lease_expires_at is not null
      and b.invoice_lease_expires_at > now()
  ) then
    raise exception 'PRACTICE_BILLING_EXECUTION_IN_PROGRESS';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists accounting_practice_billing_profile_execution_fence
  on public.accounting_practice_billing_profiles;

create trigger accounting_practice_billing_profile_execution_fence
before update or delete on public.accounting_practice_billing_profiles
for each row
execute function public.guard_accounting_practice_billing_profile_execution_fence();

create or replace function public.guard_accounting_practice_time_entry_execution_fence()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_locked boolean := false;
begin
  select true into v_locked
  from public.accounting_practice_billing_batches b
  where b.accounting_firm_id = old.accounting_firm_id
    and b.engagement_id = old.engagement_id
    and old.id = any(b.time_entry_ids)
    and b.status in ('PREPARING','FAILED')
    and b.invoice_lease_token is not null
    and b.invoice_lease_expires_at is not null
    and b.invoice_lease_expires_at > now()
  limit 1;

  if coalesce(v_locked, false) = false then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'PRACTICE_BILLING_EXECUTION_IN_PROGRESS';
  end if;

  if old.status = 'APPROVED'
     and new.status = 'BILLED'
     and nullif(trim(coalesce(new.billing_reference, '')), '') is not null
     and new.billed_at is not null
     and new.accounting_firm_id is not distinct from old.accounting_firm_id
     and new.organization_id is not distinct from old.organization_id
     and new.entity_id is not distinct from old.entity_id
     and new.engagement_id is not distinct from old.engagement_id
     and new.run_id is not distinct from old.run_id
     and new.work_item_id is not distinct from old.work_item_id
     and new.staff_account_id is not distinct from old.staff_account_id
     and new.work_date is not distinct from old.work_date
     and new.minutes is not distinct from old.minutes
     and new.billable is not distinct from old.billable
     and new.billing_rate is not distinct from old.billing_rate
     and new.currency_code is not distinct from old.currency_code then
    return new;
  end if;

  if new.work_date is distinct from old.work_date
     or new.minutes is distinct from old.minutes
     or new.billable is distinct from old.billable
     or new.billing_rate is distinct from old.billing_rate
     or new.currency_code is distinct from old.currency_code
     or new.status is distinct from old.status
     or new.accounting_firm_id is distinct from old.accounting_firm_id
     or new.organization_id is distinct from old.organization_id
     or new.entity_id is distinct from old.entity_id
     or new.engagement_id is distinct from old.engagement_id
     or new.run_id is distinct from old.run_id
     or new.work_item_id is distinct from old.work_item_id
     or new.staff_account_id is distinct from old.staff_account_id then
    raise exception 'PRACTICE_BILLING_EXECUTION_IN_PROGRESS';
  end if;

  return new;
end;
$$;

drop trigger if exists accounting_practice_time_entry_execution_fence
  on public.accounting_practice_time_entries;

create trigger accounting_practice_time_entry_execution_fence
before update or delete on public.accounting_practice_time_entries
for each row
execute function public.guard_accounting_practice_time_entry_execution_fence();

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
  end if;

  update public.accounting_practice_billing_batches
  set invoice_lease_token = null,
      invoice_lease_expires_at = null,
      updated_at = v_now
  where id = v_batch.id
    and accounting_firm_id = p_accounting_firm_id;

  if v_cadence <> 'ON_DEMAND' then
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

revoke all on function public.guard_accounting_practice_billing_profile_execution_fence()
  from public, anon, authenticated;
grant execute on function public.guard_accounting_practice_billing_profile_execution_fence()
  to service_role;

revoke all on function public.guard_accounting_practice_time_entry_execution_fence()
  from public, anon, authenticated;
grant execute on function public.guard_accounting_practice_time_entry_execution_fence()
  to service_role;

revoke all on function public.finalize_accounting_practice_billing_batch(uuid,uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_accounting_practice_billing_batch(uuid,uuid,uuid,uuid)
  to service_role;

commit;
