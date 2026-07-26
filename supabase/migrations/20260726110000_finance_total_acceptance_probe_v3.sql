begin;

create or replace function public.finance_run_total_acceptance_probe_v3(
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
  v_vendor_party_id uuid := p_vendor_party_id;
  v_customer_party_id uuid;
  v_party_type text;
  v_vendor_provisioned boolean := false;
begin
  if p_organization_id is null or p_entity_id is null or p_actor_id is null then
    raise exception 'organization_id, entity_id and actor_id required';
  end if;

  if p_customer_id is null then
    raise exception 'customer_id required';
  end if;

  if v_vendor_party_id is null then
    select
      customer.party_id,
      party.party_type
    into
      v_customer_party_id,
      v_party_type
    from public.customer_loyalty_accounts as customer
    join public.parties as party
      on party.id = customer.party_id
     and party.organization_id = customer.organization_id
    where customer.id = p_customer_id
      and customer.organization_id = p_organization_id
      and customer.entity_id = p_entity_id
    limit 1;

    if v_customer_party_id is null or nullif(btrim(v_party_type), '') is null then
      raise exception 'A scoped customer party with a valid party_type is required for rollback-safe vendor provisioning';
    end if;

    insert into public.parties (
      organization_id,
      party_type,
      display_name
    ) values (
      p_organization_id,
      v_party_type,
      'Rollback Acceptance Vendor ' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)
    )
    returning id into v_vendor_party_id;

    v_vendor_provisioned := true;
  end if;

  v_result := public.finance_run_total_acceptance_probe_v2(
    p_organization_id,
    p_entity_id,
    p_actor_id,
    p_posting_date,
    p_currency_code,
    p_exchange_rate,
    p_asset_account_id,
    p_revenue_account_id,
    p_expense_account_id,
    p_liability_account_id,
    p_bank_account_id,
    p_customer_id,
    v_vendor_party_id
  );

  v_result := jsonb_set(
    v_result,
    '{results}',
    coalesce(v_result->'results', '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'name', 'probe.vendor_party_rolled_back',
        'passed', true,
        'details', jsonb_build_object(
          'provisioned', v_vendor_provisioned,
          'party_type_source', case
            when v_vendor_provisioned then 'scoped_customer_party'
            else 'existing_vendor_party'
          end,
          'rollback_scope', 'v3_wrapper_subtransaction'
        )
      )
    ),
    true
  );

  raise exception '__FINANCE_ACCEPTANCE_V3_ROLLBACK__';
exception when others then
  get stacked diagnostics v_error = message_text;

  if v_error = '__FINANCE_ACCEPTANCE_V3_ROLLBACK__' then
    return v_result || jsonb_build_object(
      'rolled_back', true,
      'prerequisites_rolled_back', true,
      'vendor_party_rolled_back', true,
      'vendor_party_provisioned', v_vendor_provisioned
    );
  end if;

  return jsonb_build_object(
    'success', false,
    'rolled_back', true,
    'prerequisites_rolled_back', true,
    'vendor_party_rolled_back', true,
    'vendor_party_provisioned', v_vendor_provisioned,
    'results', jsonb_build_array(
      jsonb_build_object(
        'name', 'probe.v3_unexpected_failure',
        'passed', false,
        'message', v_error
      )
    ),
    'passed', 0,
    'failed', 1
  );
end;
$$;

revoke all on function public.finance_run_total_acceptance_probe_v3(
  uuid, uuid, uuid, date, text, numeric,
  uuid, uuid, uuid, uuid, uuid, uuid, uuid
) from public, anon, authenticated;

grant execute on function public.finance_run_total_acceptance_probe_v3(
  uuid, uuid, uuid, date, text, numeric,
  uuid, uuid, uuid, uuid, uuid, uuid, uuid
) to service_role;

notify pgrst, 'reload schema';

commit;
