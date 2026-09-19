begin;

create or replace function public.preflight_accounting_practice_billing_execution(
  p_accounting_firm_id uuid,
  p_batch_id uuid,
  p_lease_token uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_batch public.accounting_practice_billing_batches%rowtype;
  v_profile public.accounting_practice_billing_profiles%rowtype;
  v_engagement public.accounting_engagements%rowtype;
  v_entity public.legal_entities%rowtype;
  v_party public.parties%rowtype;
  v_account public.chart_of_accounts%rowtype;
  v_tax public.tax_rules%rowtype;
  v_expected_count integer := 0;
  v_valid_count integer := 0;
  v_invalid_pricing_count integer := 0;
  v_time_value numeric := 0;
  v_fixed_value numeric := 0;
  v_expected_subtotal numeric := 0;
  v_expected_tax numeric := 0;
  v_method text;
  v_cadence text;
  v_currency text;
  v_country text;
  v_regime text;
  v_tax_rate_percent numeric := 0;
  v_snapshot_tax_rate numeric := 0;
  v_snapshot_time_value numeric := 0;
  v_snapshot_fixed_value numeric := 0;
  v_snapshot_payment_terms integer := 0;
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
  if v_batch.status not in ('PREPARING','FAILED') then
    raise exception 'PRACTICE_BILLING_BATCH_NOT_EXECUTABLE';
  end if;
  if v_batch.invoice_lease_token is distinct from p_lease_token then
    raise exception 'PRACTICE_BILLING_INVOICE_LEASE_MISMATCH';
  end if;
  if v_batch.invoice_lease_expires_at is null or v_batch.invoice_lease_expires_at <= now() then
    raise exception 'PRACTICE_BILLING_INVOICE_LEASE_EXPIRED';
  end if;

  select * into v_engagement
  from public.accounting_engagements
  where id = v_batch.engagement_id
    and accounting_firm_id = p_accounting_firm_id
    and organization_id = v_batch.organization_id
    and status = 'ACTIVE'
  for update;
  if not found then raise exception 'PRACTICE_BILLING_ENGAGEMENT_UNAVAILABLE'; end if;

  select * into v_profile
  from public.accounting_practice_billing_profiles
  where id = v_batch.billing_profile_id
    and accounting_firm_id = p_accounting_firm_id
    and organization_id = v_batch.organization_id
    and engagement_id = v_batch.engagement_id
    and status = 'ACTIVE'
  for update;
  if not found then raise exception 'PRACTICE_BILLING_PROFILE_UNAVAILABLE'; end if;

  v_method := upper(coalesce(v_profile.billing_method, ''));
  v_cadence := upper(coalesce(v_profile.billing_cadence, 'ON_DEMAND'));
  v_currency := upper(coalesce(v_profile.currency_code, ''));

  if v_method = 'NON_BILLABLE' then raise exception 'PRACTICE_BILLING_METHOD_CHANGED'; end if;
  if v_method is distinct from upper(coalesce(v_batch.metadata->>'billing_method', '')) then
    raise exception 'PRACTICE_BILLING_METHOD_CHANGED';
  end if;
  if v_currency is distinct from upper(coalesce(v_batch.currency_code, '')) then
    raise exception 'PRACTICE_BILLING_CURRENCY_CHANGED';
  end if;
  if v_cadence is distinct from upper(coalesce(v_batch.metadata->>'billing_cadence', 'ON_DEMAND')) then
    raise exception 'PRACTICE_BILLING_CADENCE_CHANGED_DURING_INVOICE';
  end if;
  if v_profile.billing_entity_id::text is distinct from nullif(v_batch.metadata->>'billing_entity_id', '') then
    raise exception 'PRACTICE_BILLING_ENTITY_CHANGED';
  end if;
  if v_profile.customer_party_id::text is distinct from nullif(v_batch.metadata->>'customer_party_id', '') then
    raise exception 'PRACTICE_BILLING_CUSTOMER_CHANGED';
  end if;
  if v_profile.revenue_account_id::text is distinct from nullif(v_batch.metadata->>'revenue_account_id', '') then
    raise exception 'PRACTICE_BILLING_REVENUE_ACCOUNT_CHANGED';
  end if;
  if v_profile.tax_rule_id::text is distinct from nullif(v_batch.metadata->>'tax_rule_id', '') then
    raise exception 'PRACTICE_BILLING_TAX_RULE_CHANGED';
  end if;

  begin
    v_snapshot_tax_rate := coalesce((v_batch.metadata->>'tax_rate_percent')::numeric, 0);
    v_snapshot_time_value := coalesce((v_batch.metadata->>'time_value')::numeric, 0);
    v_snapshot_fixed_value := coalesce((v_batch.metadata->>'fixed_fee_value')::numeric, 0);
    v_snapshot_payment_terms := coalesce((v_batch.metadata->>'payment_terms_days')::integer, 0);
  exception when others then
    raise exception 'PRACTICE_BILLING_SNAPSHOT_INVALID';
  end;

  if coalesce(v_profile.payment_terms_days, 0) is distinct from v_snapshot_payment_terms then
    raise exception 'PRACTICE_BILLING_PAYMENT_TERMS_CHANGED';
  end if;
  if v_cadence <> 'ON_DEMAND'
     and v_profile.next_billing_date is distinct from nullif(v_batch.metadata->>'billing_date', '')::date then
    raise exception 'PRACTICE_BILLING_DATE_CHANGED_DURING_INVOICE';
  end if;

  select * into v_entity
  from public.legal_entities
  where id = v_profile.billing_entity_id
    and organization_id = p_accounting_firm_id
    and coalesce(is_active, true) = true
  for update;
  if not found then raise exception 'PRACTICE_BILLING_ENTITY_INVALID'; end if;
  if coalesce(v_entity.timezone, '') is distinct from coalesce(v_batch.billing_timezone, '') then
    raise exception 'PRACTICE_BILLING_TIMEZONE_CHANGED';
  end if;

  select * into v_party
  from public.parties
  where id = v_profile.customer_party_id
    and organization_id = p_accounting_firm_id
    and upper(coalesce(status, '')) = 'ACTIVE'
  for update;
  if not found then raise exception 'PRACTICE_BILLING_CUSTOMER_INVALID'; end if;

  select * into v_account
  from public.chart_of_accounts
  where id = v_profile.revenue_account_id
    and organization_id = p_accounting_firm_id
    and is_active = true
  for update;
  if not found then
    raise exception 'PRACTICE_BILLING_REVENUE_ACCOUNT_INVALID';
  end if;
  if upper(coalesce(v_account.account_type, '')) not like '%REVENUE%'
     and upper(coalesce(v_account.account_type, '')) not like '%INCOME%' then
    raise exception 'PRACTICE_BILLING_REVENUE_ACCOUNT_INVALID';
  end if;

  select * into v_tax
  from public.tax_rules
  where id = v_profile.tax_rule_id
    and (organization_id = p_accounting_firm_id or organization_id is null)
    and is_active = true
  for update;
  if not found then raise exception 'PRACTICE_BILLING_TAX_RULE_INVALID'; end if;
  if upper(coalesce(v_tax.tax_type, '')) not in ('VAT','SALES_TAX','GST') then
    raise exception 'PRACTICE_BILLING_TAX_RULE_INVALID';
  end if;
  if v_tax.effective_from is not null and v_tax.effective_from::date > v_batch.invoice_date then
    raise exception 'PRACTICE_BILLING_TAX_RULE_INVALID';
  end if;
  if v_tax.effective_to is not null and v_tax.effective_to::date < v_batch.invoice_date then
    raise exception 'PRACTICE_BILLING_TAX_RULE_INVALID';
  end if;

  v_country := upper(coalesce(v_entity.country, ''));
  v_regime := upper(coalesce(v_tax.tax_regime, ''));
  if v_country = 'TH' then
    if v_regime not in ('TH','THA','THAILAND') then raise exception 'PRACTICE_BILLING_TAX_RULE_INVALID'; end if;
  elsif v_country = any(array['AT','BE','BG','HR','CY','CZ','DE','DK','EE','ES','FI','FR','GR','HU','IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK']) then
    if v_regime <> 'EU' and v_regime <> v_country then raise exception 'PRACTICE_BILLING_TAX_RULE_INVALID'; end if;
  elsif v_regime <> v_country then
    raise exception 'PRACTICE_BILLING_TAX_RULE_INVALID';
  end if;

  v_tax_rate_percent := greatest(0, least(100, coalesce(v_tax.tax_rate, 0) * 100));
  if round(v_tax_rate_percent::numeric, 6) is distinct from round(v_snapshot_tax_rate::numeric, 6)
     or round(coalesce(v_profile.tax_rate_percent, 0)::numeric, 6) is distinct from round(v_snapshot_tax_rate::numeric, 6) then
    raise exception 'PRACTICE_BILLING_TAX_RATE_CHANGED';
  end if;
  if v_profile.tax_treatment_confirmed is distinct from true then
    raise exception 'PRACTICE_BILLING_TAX_TREATMENT_UNCONFIRMED';
  end if;

  v_expected_count := cardinality(v_batch.time_entry_ids);
  if v_expected_count > 0 then
    select count(*),
           count(*) filter (
             where e.billing_rate is null
                or upper(coalesce(e.currency_code, '')) <> upper(coalesce(v_batch.currency_code, ''))
           ),
           coalesce(sum(case when e.billing_rate is not null then (e.billing_rate * e.minutes::numeric) / 60 else 0 end), 0)
    into v_valid_count, v_invalid_pricing_count, v_time_value
    from public.accounting_practice_time_entries e
    where e.id = any(v_batch.time_entry_ids)
      and e.accounting_firm_id = p_accounting_firm_id
      and e.organization_id = v_batch.organization_id
      and e.engagement_id = v_batch.engagement_id
      and e.status = 'APPROVED'
      and e.billable = true;

    if v_valid_count <> v_expected_count then
      raise exception 'PRACTICE_BILLING_WIP_SCOPE_CHANGED';
    end if;
    if v_method in ('TIME_AND_MATERIALS','HYBRID') and v_invalid_pricing_count > 0 then
      raise exception 'PRACTICE_BILLING_WIP_PRICING_CHANGED';
    end if;
  end if;

  if v_method = 'TIME_AND_MATERIALS' and v_expected_count = 0 then
    raise exception 'PRACTICE_BILLING_WIP_SCOPE_CHANGED';
  end if;

  if v_method in ('TIME_AND_MATERIALS','HYBRID')
     and round(v_time_value::numeric, 4) is distinct from round(v_snapshot_time_value::numeric, 4) then
    raise exception 'PRACTICE_BILLING_WIP_VALUE_CHANGED';
  end if;

  if v_method in ('FIXED_FEE','HYBRID') then
    v_fixed_value := coalesce(v_profile.fixed_fee_amount, 0);
    if round(v_fixed_value::numeric, 4) is distinct from round(v_snapshot_fixed_value::numeric, 4) then
      raise exception 'PRACTICE_BILLING_FIXED_FEE_CHANGED';
    end if;
  end if;

  if v_method = 'TIME_AND_MATERIALS' then
    v_expected_subtotal := v_time_value;
  elsif v_method = 'FIXED_FEE' then
    v_expected_subtotal := v_fixed_value;
  elsif v_method = 'HYBRID' then
    v_expected_subtotal := v_time_value + v_fixed_value;
  else
    raise exception 'PRACTICE_BILLING_METHOD_CHANGED';
  end if;

  if round(v_expected_subtotal::numeric, 2) is distinct from round(v_batch.subtotal::numeric, 2) then
    raise exception 'PRACTICE_BILLING_SUBTOTAL_CHANGED';
  end if;

  v_expected_tax := round(v_expected_subtotal * v_snapshot_tax_rate) / 100;
  if round(v_expected_tax::numeric, 2) is distinct from round(v_batch.tax_amount::numeric, 2)
     or round((v_expected_subtotal + v_expected_tax)::numeric, 2) is distinct from round(v_batch.total_amount::numeric, 2) then
    raise exception 'PRACTICE_BILLING_TOTAL_CHANGED';
  end if;

  return jsonb_build_object(
    'state', 'READY',
    'billing_batch', to_jsonb(v_batch) - 'invoice_lease_token',
    'verified_at', now()
  );
end;
$$;

revoke all on function public.preflight_accounting_practice_billing_execution(uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.preflight_accounting_practice_billing_execution(uuid,uuid,uuid)
  to service_role;

commit;
