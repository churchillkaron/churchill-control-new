begin;

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
  v_entry_ids uuid[] := coalesce(p_time_entry_ids, '{}'::uuid[]);
  v_currency text := upper(trim(coalesce(p_currency_code, '')));
begin
  if trim(coalesce(p_idempotency_key, '')) = '' then
    raise exception 'PRACTICE_BILLING_IDEMPOTENCY_KEY_REQUIRED';
  end if;
  if trim(coalesce(p_billing_period_key, '')) = '' then
    raise exception 'PRACTICE_BILLING_PERIOD_KEY_REQUIRED';
  end if;
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'PRACTICE_BILLING_CURRENCY_INVALID';
  end if;
  if coalesce(p_subtotal, -1) < 0
     or coalesce(p_tax_amount, -1) < 0
     or coalesce(p_total_amount, -1) < 0 then
    raise exception 'PRACTICE_BILLING_AMOUNT_INVALID';
  end if;
  if round((coalesce(p_subtotal, 0) + coalesce(p_tax_amount, 0))::numeric, 4)
     <> round(coalesce(p_total_amount, 0)::numeric, 4) then
    raise exception 'PRACTICE_BILLING_TOTAL_MISMATCH';
  end if;

  perform 1
  from public.accounting_engagements e
  where e.id = p_engagement_id
    and e.accounting_firm_id = p_accounting_firm_id
    and e.organization_id = p_organization_id
    and e.status = 'ACTIVE';
  if not found then raise exception 'PRACTICE_BILLING_ENGAGEMENT_UNAVAILABLE'; end if;

  perform 1
  from public.accounting_practice_billing_profiles p
  where p.id = p_billing_profile_id
    and p.accounting_firm_id = p_accounting_firm_id
    and p.organization_id = p_organization_id
    and p.engagement_id = p_engagement_id
    and p.status = 'ACTIVE';
  if not found then raise exception 'PRACTICE_BILLING_PROFILE_UNAVAILABLE'; end if;

  insert into public.accounting_practice_billing_batches (
    accounting_firm_id,
    organization_id,
    engagement_id,
    billing_period_key,
    billing_profile_id,
    time_entry_ids,
    service_period_start,
    service_period_end,
    subtotal,
    tax_amount,
    total_amount,
    currency_code,
    status,
    idempotency_key,
    prepared_by,
    metadata
  ) values (
    p_accounting_firm_id,
    p_organization_id,
    p_engagement_id,
    p_billing_period_key,
    p_billing_profile_id,
    v_entry_ids,
    p_service_period_start,
    p_service_period_end,
    p_subtotal,
    p_tax_amount,
    p_total_amount,
    v_currency,
    'PREPARING',
    p_idempotency_key,
    p_prepared_by,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (accounting_firm_id, idempotency_key) do nothing
  returning * into v_batch;

  if v_batch.id is null then
    select * into v_batch
    from public.accounting_practice_billing_batches b
    where b.accounting_firm_id = p_accounting_firm_id
      and b.idempotency_key = p_idempotency_key
    for update;

    if not found then
      raise exception 'PRACTICE_BILLING_BATCH_CLAIM_LOST';
    end if;

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
  end if;

  return v_batch;
end;
$$;

revoke all on function public.claim_accounting_practice_billing_batch(
  uuid,uuid,uuid,text,uuid,uuid[],date,date,numeric,numeric,numeric,text,text,uuid,jsonb
) from public, anon, authenticated;
grant execute on function public.claim_accounting_practice_billing_batch(
  uuid,uuid,uuid,text,uuid,uuid[],date,date,numeric,numeric,numeric,text,text,uuid,jsonb
) to service_role;

commit;
