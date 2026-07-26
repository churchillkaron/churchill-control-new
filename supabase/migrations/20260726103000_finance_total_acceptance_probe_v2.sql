begin;

create or replace function public.finance_run_total_acceptance_probe_v2(
  p_organization_id uuid,
  p_entity_id uuid,
  p_actor_id uuid,
  p_posting_date date,
  p_currency_code text,
  p_exchange_rate numeric,
  p_asset_account_id uuid default null,
  p_revenue_account_id uuid default null,
  p_expense_account_id uuid default null,
  p_liability_account_id uuid default null,
  p_bank_account_id uuid default null,
  p_customer_id uuid default null,
  p_vendor_party_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
  v_error text;
  v_tag text := replace(gen_random_uuid()::text, '-', '');
  v_asset_account_id uuid := p_asset_account_id;
  v_revenue_account_id uuid := p_revenue_account_id;
  v_expense_account_id uuid := p_expense_account_id;
  v_liability_account_id uuid := p_liability_account_id;
  v_bank_account_id uuid := p_bank_account_id;
  v_vendor_party_id uuid := p_vendor_party_id;
  v_provisioned jsonb := '{}'::jsonb;
begin
  if p_organization_id is null or p_entity_id is null or p_actor_id is null then
    raise exception 'organization_id, entity_id and actor_id required';
  end if;

  if p_posting_date is null or nullif(btrim(p_currency_code), '') is null then
    raise exception 'posting_date and currency_code required';
  end if;

  if p_exchange_rate is null or p_exchange_rate <= 0 then
    raise exception 'exchange_rate must be positive';
  end if;

  if p_customer_id is null then
    raise exception 'customer_id required';
  end if;

  perform 1
  from public.legal_entities
  where id = p_entity_id
    and organization_id = p_organization_id;

  if not found then
    raise exception 'Entity is outside organization scope';
  end if;

  perform 1
  from public.accounting_periods
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and p_posting_date between start_date and end_date
    and lower(status) in ('open', 'active');

  if not found then
    raise exception 'No open accounting period covers posting date';
  end if;

  if v_asset_account_id is null then
    insert into public.chart_of_accounts (
      organization_id,
      entity_id,
      account_code,
      account_name,
      account_type,
      account_category,
      normal_balance,
      currency_code,
      is_system,
      is_active
    ) values (
      p_organization_id,
      p_entity_id,
      'TST-A-' || substr(v_tag, 1, 12),
      'Rollback Acceptance Asset',
      'ASSET',
      'CURRENT_ASSET',
      'DEBIT',
      upper(btrim(p_currency_code)),
      false,
      true
    ) returning id into v_asset_account_id;

    v_provisioned := v_provisioned || jsonb_build_object('asset_account', true);
  end if;

  if v_revenue_account_id is null then
    insert into public.chart_of_accounts (
      organization_id,
      entity_id,
      account_code,
      account_name,
      account_type,
      account_category,
      normal_balance,
      currency_code,
      is_system,
      is_active
    ) values (
      p_organization_id,
      p_entity_id,
      'TST-R-' || substr(v_tag, 1, 12),
      'Rollback Acceptance Revenue',
      'REVENUE',
      'REVENUE',
      'CREDIT',
      upper(btrim(p_currency_code)),
      false,
      true
    ) returning id into v_revenue_account_id;

    v_provisioned := v_provisioned || jsonb_build_object('revenue_account', true);
  end if;

  if v_expense_account_id is null then
    insert into public.chart_of_accounts (
      organization_id,
      entity_id,
      account_code,
      account_name,
      account_type,
      account_category,
      normal_balance,
      currency_code,
      is_system,
      is_active
    ) values (
      p_organization_id,
      p_entity_id,
      'TST-E-' || substr(v_tag, 1, 12),
      'Rollback Acceptance Expense',
      'EXPENSE',
      'EXPENSE',
      'DEBIT',
      upper(btrim(p_currency_code)),
      false,
      true
    ) returning id into v_expense_account_id;

    v_provisioned := v_provisioned || jsonb_build_object('expense_account', true);
  end if;

  if v_liability_account_id is null then
    insert into public.chart_of_accounts (
      organization_id,
      entity_id,
      account_code,
      account_name,
      account_type,
      account_category,
      normal_balance,
      currency_code,
      is_system,
      is_active
    ) values (
      p_organization_id,
      p_entity_id,
      'TST-L-' || substr(v_tag, 1, 12),
      'Rollback Acceptance Liability',
      'LIABILITY',
      'CURRENT_LIABILITY',
      'CREDIT',
      upper(btrim(p_currency_code)),
      false,
      true
    ) returning id into v_liability_account_id;

    v_provisioned := v_provisioned || jsonb_build_object('liability_account', true);
  end if;

  if v_bank_account_id is null then
    insert into public.bank_accounts (
      organization_id,
      entity_id,
      bank_name,
      account_name,
      account_number,
      currency
    ) values (
      p_organization_id,
      p_entity_id,
      'Rollback Acceptance Bank',
      'Rollback Acceptance Account',
      'TST-' || substr(v_tag, 1, 16),
      upper(btrim(p_currency_code))
    ) returning id into v_bank_account_id;

    v_provisioned := v_provisioned || jsonb_build_object('bank_account', true);
  end if;

  if v_vendor_party_id is null then
    insert into public.parties (
      organization_id,
      party_type,
      legal_name,
      display_name,
      status
    ) values (
      p_organization_id,
      'organization',
      'Rollback Acceptance Vendor ' || substr(v_tag, 1, 8),
      'Rollback Acceptance Vendor',
      'ACTIVE'
    ) returning id into v_vendor_party_id;

    v_provisioned := v_provisioned || jsonb_build_object('vendor_party', true);
  end if;

  v_result := public.finance_run_total_acceptance_probe(
    p_organization_id,
    p_entity_id,
    p_actor_id,
    p_posting_date,
    upper(btrim(p_currency_code)),
    p_exchange_rate,
    v_asset_account_id,
    v_revenue_account_id,
    v_expense_account_id,
    v_liability_account_id,
    v_bank_account_id,
    p_customer_id,
    v_vendor_party_id
  );

  v_result := jsonb_set(
    v_result,
    '{results}',
    coalesce(v_result->'results', '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'name', 'probe.prerequisite_master_data_rolled_back',
        'passed', true,
        'details', jsonb_build_object(
          'provisioned', v_provisioned,
          'rollback_scope', 'wrapper_subtransaction'
        )
      )
    ),
    true
  );

  raise exception '__FINANCE_ACCEPTANCE_V2_ROLLBACK__';
exception when others then
  get stacked diagnostics v_error = message_text;

  if v_error = '__FINANCE_ACCEPTANCE_V2_ROLLBACK__' then
    return v_result || jsonb_build_object(
      'rolled_back', true,
      'prerequisites_rolled_back', true,
      'provisioned', v_provisioned
    );
  end if;

  return jsonb_build_object(
    'success', false,
    'rolled_back', true,
    'prerequisites_rolled_back', true,
    'provisioned', v_provisioned,
    'results', jsonb_build_array(
      jsonb_build_object(
        'name', 'probe.v2_unexpected_failure',
        'passed', false,
        'message', v_error
      )
    ),
    'passed', 0,
    'failed', 1
  );
end;
$$;

revoke all on function public.finance_run_total_acceptance_probe_v2(
  uuid, uuid, uuid, date, text, numeric,
  uuid, uuid, uuid, uuid, uuid, uuid, uuid
) from public, anon, authenticated;

grant execute on function public.finance_run_total_acceptance_probe_v2(
  uuid, uuid, uuid, date, text, numeric,
  uuid, uuid, uuid, uuid, uuid, uuid, uuid
) to service_role;

notify pgrst, 'reload schema';

commit;
