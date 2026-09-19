begin;

create or replace function public.upsert_accounting_practice_billing_policy(
  p_accounting_firm_id uuid,
  p_engagement_id uuid,
  p_billing_method text,
  p_currency_code text,
  p_default_hourly_rate numeric,
  p_fixed_fee_amount numeric,
  p_billing_entity_id uuid,
  p_customer_party_id uuid,
  p_revenue_account_id uuid,
  p_tax_rule_id uuid,
  p_tax_treatment_confirmed boolean,
  p_payment_terms_days integer,
  p_billing_cadence text,
  p_next_billing_date date,
  p_apply_rate_to_unpriced boolean,
  p_updated_by uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_engagement public.accounting_engagements%rowtype;
  v_entity public.legal_entities%rowtype;
  v_party public.parties%rowtype;
  v_account public.chart_of_accounts%rowtype;
  v_tax public.tax_rules%rowtype;
  v_profile public.accounting_practice_billing_profiles%rowtype;
  v_method text := upper(trim(coalesce(p_billing_method, '')));
  v_currency text := upper(trim(coalesce(p_currency_code, '')));
  v_cadence text := upper(trim(coalesce(p_billing_cadence, '')));
  v_tax_rate_percent numeric := 0;
  v_repriced integer := 0;
  v_country text;
  v_regime text;
begin
  select * into v_engagement
  from public.accounting_engagements
  where id = p_engagement_id
    and accounting_firm_id = p_accounting_firm_id
    and status = 'ACTIVE'
  for update;
  if not found then raise exception 'PRACTICE_BILLING_ENGAGEMENT_UNAVAILABLE'; end if;

  if v_method not in ('TIME_AND_MATERIALS','FIXED_FEE','HYBRID','NON_BILLABLE') then
    raise exception 'PRACTICE_BILLING_METHOD_INVALID';
  end if;
  if v_currency !~ '^[A-Z]{3}$' then raise exception 'PRACTICE_BILLING_CURRENCY_INVALID'; end if;
  if p_default_hourly_rate is not null and p_default_hourly_rate < 0 then raise exception 'PRACTICE_BILLING_HOURLY_RATE_INVALID'; end if;
  if p_fixed_fee_amount is not null and p_fixed_fee_amount < 0 then raise exception 'PRACTICE_BILLING_FIXED_FEE_INVALID'; end if;
  if coalesce(p_payment_terms_days, 0) < 0 or coalesce(p_payment_terms_days, 0) > 3650 then raise exception 'PRACTICE_BILLING_PAYMENT_TERMS_INVALID'; end if;
  if v_cadence not in ('ON_DEMAND','MONTHLY','QUARTERLY','ANNUAL') then raise exception 'PRACTICE_BILLING_CADENCE_INVALID'; end if;

  if p_billing_entity_id is not null then
    select * into v_entity
    from public.legal_entities
    where id = p_billing_entity_id
      and organization_id = p_accounting_firm_id
      and coalesce(is_active, true) = true;
    if not found then raise exception 'PRACTICE_BILLING_ENTITY_INVALID'; end if;
  end if;

  if p_customer_party_id is not null then
    select * into v_party
    from public.parties
    where id = p_customer_party_id
      and organization_id = p_accounting_firm_id
      and upper(coalesce(status, '')) = 'ACTIVE';
    if not found then raise exception 'PRACTICE_BILLING_CUSTOMER_INVALID'; end if;
  end if;

  if p_revenue_account_id is not null then
    select * into v_account
    from public.chart_of_accounts
    where id = p_revenue_account_id
      and organization_id = p_accounting_firm_id
      and is_active = true;
    if not found then raise exception 'PRACTICE_BILLING_REVENUE_ACCOUNT_INVALID'; end if;
    if upper(coalesce(v_account.account_type, '')) not like '%REVENUE%'
       and upper(coalesce(v_account.account_type, '')) not like '%INCOME%' then
      raise exception 'PRACTICE_BILLING_REVENUE_ACCOUNT_INVALID';
    end if;
  end if;

  if p_tax_rule_id is not null then
    if p_billing_entity_id is null then raise exception 'PRACTICE_BILLING_TAX_ENTITY_REQUIRED'; end if;
    select * into v_tax
    from public.tax_rules
    where id = p_tax_rule_id
      and (organization_id = p_accounting_firm_id or organization_id is null)
      and is_active = true;
    if not found then raise exception 'PRACTICE_BILLING_TAX_RULE_INVALID'; end if;
    if upper(coalesce(v_tax.tax_type, '')) not in ('VAT','SALES_TAX','GST') then raise exception 'PRACTICE_BILLING_TAX_RULE_INVALID'; end if;
    if v_tax.effective_from is not null and v_tax.effective_from::date > current_date then raise exception 'PRACTICE_BILLING_TAX_RULE_INVALID'; end if;
    if v_tax.effective_to is not null and v_tax.effective_to::date < current_date then raise exception 'PRACTICE_BILLING_TAX_RULE_INVALID'; end if;

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
  end if;

  insert into public.accounting_practice_billing_profiles (
    accounting_firm_id, organization_id, engagement_id, billing_method, currency_code,
    default_hourly_rate, fixed_fee_amount, billing_entity_id, customer_party_id,
    revenue_account_id, tax_rule_id, tax_rate_percent, tax_treatment_confirmed,
    payment_terms_days, billing_cadence, next_billing_date, status, updated_by, updated_at
  ) values (
    p_accounting_firm_id, v_engagement.organization_id, v_engagement.id, v_method, v_currency,
    p_default_hourly_rate, p_fixed_fee_amount, p_billing_entity_id, p_customer_party_id,
    p_revenue_account_id, p_tax_rule_id, v_tax_rate_percent, coalesce(p_tax_treatment_confirmed, false),
    coalesce(p_payment_terms_days, 0), v_cadence, p_next_billing_date, 'ACTIVE', p_updated_by, now()
  )
  on conflict (accounting_firm_id, engagement_id) do update set
    organization_id = excluded.organization_id,
    billing_method = excluded.billing_method,
    currency_code = excluded.currency_code,
    default_hourly_rate = excluded.default_hourly_rate,
    fixed_fee_amount = excluded.fixed_fee_amount,
    billing_entity_id = excluded.billing_entity_id,
    customer_party_id = excluded.customer_party_id,
    revenue_account_id = excluded.revenue_account_id,
    tax_rule_id = excluded.tax_rule_id,
    tax_rate_percent = excluded.tax_rate_percent,
    tax_treatment_confirmed = excluded.tax_treatment_confirmed,
    payment_terms_days = excluded.payment_terms_days,
    billing_cadence = excluded.billing_cadence,
    next_billing_date = excluded.next_billing_date,
    status = 'ACTIVE',
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at
  returning * into v_profile;

  if coalesce(p_apply_rate_to_unpriced, false)
     and p_default_hourly_rate is not null
     and v_method <> 'NON_BILLABLE' then
    update public.accounting_practice_time_entries
    set billing_rate = p_default_hourly_rate,
        currency_code = v_currency,
        updated_at = now()
    where accounting_firm_id = p_accounting_firm_id
      and engagement_id = v_engagement.id
      and billable = true
      and status in ('DRAFT','SUBMITTED','APPROVED')
      and billing_rate is null;
    get diagnostics v_repriced = row_count;
  end if;

  return jsonb_build_object(
    'billing_profile', to_jsonb(v_profile),
    'repriced_entries', v_repriced
  );
end;
$$;

revoke all on function public.upsert_accounting_practice_billing_policy(
  uuid,uuid,text,text,numeric,numeric,uuid,uuid,uuid,uuid,boolean,integer,text,date,boolean,uuid
) from public, anon, authenticated;
grant execute on function public.upsert_accounting_practice_billing_policy(
  uuid,uuid,text,text,numeric,numeric,uuid,uuid,uuid,uuid,boolean,integer,text,date,boolean,uuid
) to service_role;

commit;
