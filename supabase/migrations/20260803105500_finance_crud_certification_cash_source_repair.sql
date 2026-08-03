begin;

-- Forward-only repair for the Finance workspace certification probe.
-- Cash-management reads use the canonical public.bank_ledger relation.

create or replace function public.finance_run_workspace_crud_certification_probe(
  p_organization_id uuid,
  p_entity_id uuid,
  p_actor_id uuid,
  p_posting_date date,
  p_currency_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_results jsonb := '[]'::jsonb;
  v_error text;
  v_tag text := 'FIN-CRUD-' || replace(gen_random_uuid()::text, '-', '');
  v_period_id uuid;
  v_customer_id uuid;
  v_bank_account_id uuid;
  v_asset_account_id uuid;
  v_revenue_account_id uuid;
  v_expense_account_id uuid;
  v_liability_account_id uuid;
  v_report_template_id uuid;
  v_bank_statement_id uuid;
  v_timezone text := 'UTC';
  v_quote_currency text;
  v_cases jsonb;
  v_case jsonb;
  v_payload jsonb;
  v_workspace text;
  v_table text;
  v_scope text;
  v_update_column text;
  v_update_value text;
  v_archive boolean;
  v_id uuid;
  v_columns text;
  v_values text;
  v_row jsonb;
  v_status text;
  v_existing_profile jsonb;
  v_profile_id uuid;
  v_read_count bigint;
  v_provisioned jsonb := '{}'::jsonb;
begin
  if p_organization_id is null or p_entity_id is null or p_actor_id is null then
    raise exception 'organization_id, entity_id and actor_id required';
  end if;

  if p_posting_date is null or nullif(btrim(p_currency_code), '') is null then
    raise exception 'posting_date and currency_code required';
  end if;

  perform 1
  from public.legal_entities
  where id = p_entity_id
    and organization_id = p_organization_id;

  if not found then
    raise exception 'Entity is outside organization scope';
  end if;

  select period.id
  into v_period_id
  from public.accounting_periods period
  where period.organization_id = p_organization_id
    and period.entity_id = p_entity_id
    and p_posting_date between period.start_date and period.end_date
    and lower(period.status) in ('open', 'active')
  order by period.start_date desc
  limit 1;

  if v_period_id is null then
    raise exception 'No open accounting period covers posting date';
  end if;

  select customer.id
  into v_customer_id
  from public.customer_loyalty_accounts customer
  where customer.organization_id = p_organization_id
    and customer.entity_id = p_entity_id
  order by customer.created_at nulls last, customer.id
  limit 1;

  if v_customer_id is null then
    raise exception 'A scoped customer is required for CRUD certification';
  end if;

  select account.id
  into v_asset_account_id
  from public.chart_of_accounts account
  where account.organization_id = p_organization_id
    and account.entity_id = p_entity_id
    and (
      upper(coalesce(account.account_type, '')) in ('ASSET', 'CURRENT_ASSET', 'BANK', 'CASH', 'RECEIVABLE')
      or upper(coalesce(account.account_category, '')) in ('ASSET', 'CURRENT_ASSET')
    )
  order by account.created_at nulls last, account.id
  limit 1;

  if v_asset_account_id is null then
    insert into public.chart_of_accounts (
      organization_id, entity_id, account_code, account_name,
      account_type, account_category, normal_balance,
      currency_code, is_system, is_active
    ) values (
      p_organization_id, p_entity_id, 'TST-A-' || substr(v_tag, 10, 10),
      'CRUD Certification Asset', 'ASSET', 'CURRENT_ASSET', 'DEBIT',
      upper(btrim(p_currency_code)), false, true
    ) returning id into v_asset_account_id;
    v_provisioned := v_provisioned || jsonb_build_object('asset_account', true);
  end if;

  select account.id
  into v_revenue_account_id
  from public.chart_of_accounts account
  where account.organization_id = p_organization_id
    and account.entity_id = p_entity_id
    and (
      upper(coalesce(account.account_type, '')) in ('REVENUE', 'INCOME', 'SALES')
      or upper(coalesce(account.account_category, '')) in ('REVENUE', 'INCOME')
    )
  order by account.created_at nulls last, account.id
  limit 1;

  if v_revenue_account_id is null then
    insert into public.chart_of_accounts (
      organization_id, entity_id, account_code, account_name,
      account_type, account_category, normal_balance,
      currency_code, is_system, is_active
    ) values (
      p_organization_id, p_entity_id, 'TST-R-' || substr(v_tag, 10, 10),
      'CRUD Certification Revenue', 'REVENUE', 'REVENUE', 'CREDIT',
      upper(btrim(p_currency_code)), false, true
    ) returning id into v_revenue_account_id;
    v_provisioned := v_provisioned || jsonb_build_object('revenue_account', true);
  end if;

  select account.id
  into v_expense_account_id
  from public.chart_of_accounts account
  where account.organization_id = p_organization_id
    and account.entity_id = p_entity_id
    and (
      upper(coalesce(account.account_type, '')) in ('EXPENSE', 'COST', 'COGS')
      or upper(coalesce(account.account_category, '')) in ('EXPENSE', 'COST_OF_SALES')
    )
  order by account.created_at nulls last, account.id
  limit 1;

  if v_expense_account_id is null then
    insert into public.chart_of_accounts (
      organization_id, entity_id, account_code, account_name,
      account_type, account_category, normal_balance,
      currency_code, is_system, is_active
    ) values (
      p_organization_id, p_entity_id, 'TST-E-' || substr(v_tag, 10, 10),
      'CRUD Certification Expense', 'EXPENSE', 'EXPENSE', 'DEBIT',
      upper(btrim(p_currency_code)), false, true
    ) returning id into v_expense_account_id;
    v_provisioned := v_provisioned || jsonb_build_object('expense_account', true);
  end if;

  select account.id
  into v_liability_account_id
  from public.chart_of_accounts account
  where account.organization_id = p_organization_id
    and account.entity_id = p_entity_id
    and (
      upper(coalesce(account.account_type, '')) in ('LIABILITY', 'CURRENT_LIABILITY', 'PAYABLE')
      or upper(coalesce(account.account_category, '')) in ('LIABILITY', 'CURRENT_LIABILITY')
    )
  order by account.created_at nulls last, account.id
  limit 1;

  if v_liability_account_id is null then
    insert into public.chart_of_accounts (
      organization_id, entity_id, account_code, account_name,
      account_type, account_category, normal_balance,
      currency_code, is_system, is_active
    ) values (
      p_organization_id, p_entity_id, 'TST-L-' || substr(v_tag, 10, 10),
      'CRUD Certification Liability', 'LIABILITY', 'CURRENT_LIABILITY', 'CREDIT',
      upper(btrim(p_currency_code)), false, true
    ) returning id into v_liability_account_id;
    v_provisioned := v_provisioned || jsonb_build_object('liability_account', true);
  end if;

  select bank.id
  into v_bank_account_id
  from public.bank_accounts bank
  where bank.organization_id = p_organization_id
    and bank.entity_id = p_entity_id
  order by bank.created_at nulls last, bank.id
  limit 1;

  if v_bank_account_id is null then
    insert into public.bank_accounts (
      organization_id, entity_id, bank_name, account_name,
      account_number, currency
    ) values (
      p_organization_id, p_entity_id, 'CRUD Certification Bank',
      'CRUD Certification Account', 'TST-' || substr(v_tag, 10, 14),
      upper(btrim(p_currency_code))
    ) returning id into v_bank_account_id;
    v_provisioned := v_provisioned || jsonb_build_object('bank_account', true);
  end if;

  select profile.timezone
  into v_timezone
  from public.finance_organization_profiles profile
  where profile.organization_id = p_organization_id
  limit 1;

  v_timezone := coalesce(nullif(btrim(v_timezone), ''), 'UTC');
  v_quote_currency := case
    when upper(btrim(p_currency_code)) = 'XTS' then 'XXX'
    else 'XTS'
  end;

  v_cases := jsonb_build_array(
    jsonb_build_object(
      'workspace', 'opening_balances', 'table', 'finance_opening_balance_batches', 'scope', 'entity',
      'update_column', 'description', 'update_value', v_tag || ':UPDATED', 'archive', true,
      'payload', jsonb_build_object(
        'id', gen_random_uuid(), 'organization_id', p_organization_id, 'entity_id', p_entity_id,
        'period_id', v_period_id, 'reference', v_tag || ':OB', 'posting_date', p_posting_date,
        'currency_code', upper(btrim(p_currency_code)), 'description', v_tag,
        'lines', jsonb_build_array(
          jsonb_build_object('account_id', v_asset_account_id, 'debit', 10, 'credit', 0),
          jsonb_build_object('account_id', v_liability_account_id, 'debit', 0, 'credit', 10)
        ),
        'status', 'DRAFT', 'idempotency_key', v_tag || ':OB', 'created_by', p_actor_id
      )
    ),
    jsonb_build_object(
      'workspace', 'recurring_journals', 'table', 'finance_recurring_journal_templates', 'scope', 'entity',
      'update_column', 'description', 'update_value', v_tag || ':UPDATED', 'archive', true,
      'payload', jsonb_build_object(
        'id', gen_random_uuid(), 'organization_id', p_organization_id, 'entity_id', p_entity_id,
        'name', v_tag || ':RJ', 'reference', v_tag, 'frequency', 'MONTHLY',
        'next_run_date', p_posting_date, 'currency_code', upper(btrim(p_currency_code)),
        'description', v_tag,
        'lines', jsonb_build_array(
          jsonb_build_object('account_id', v_expense_account_id, 'debit', 10, 'credit', 0),
          jsonb_build_object('account_id', v_liability_account_id, 'debit', 0, 'credit', 10)
        ),
        'status', 'ACTIVE', 'idempotency_key', v_tag || ':RJ', 'created_by', p_actor_id
      )
    ),
    jsonb_build_object(
      'workspace', 'collections', 'table', 'finance_collection_cases', 'scope', 'entity',
      'update_column', 'notes', 'update_value', v_tag || ':UPDATED', 'archive', true,
      'payload', jsonb_build_object(
        'id', gen_random_uuid(), 'organization_id', p_organization_id, 'entity_id', p_entity_id,
        'customer_id', v_customer_id, 'case_reference', v_tag || ':COL',
        'opened_date', p_posting_date, 'priority', 'NORMAL', 'notes', v_tag,
        'status', 'OPEN', 'created_by', p_actor_id
      )
    ),
    jsonb_build_object(
      'workspace', 'revenue_recognition', 'table', 'finance_revenue_recognition_schedules', 'scope', 'entity',
      'update_column', 'notes', 'update_value', v_tag || ':UPDATED', 'archive', true,
      'payload', jsonb_build_object(
        'id', gen_random_uuid(), 'organization_id', p_organization_id, 'entity_id', p_entity_id,
        'customer_id', v_customer_id, 'source_document_type', 'MANUAL',
        'contract_reference', v_tag || ':REV', 'recognition_method', 'STRAIGHT_LINE',
        'start_date', p_posting_date, 'end_date', p_posting_date + 30,
        'total_amount', 10, 'currency_code', upper(btrim(p_currency_code)),
        'revenue_account_id', v_revenue_account_id, 'notes', v_tag,
        'status', 'DRAFT', 'created_by', p_actor_id
      )
    ),
    jsonb_build_object(
      'workspace', 'bank_statements', 'table', 'finance_bank_statement_imports', 'scope', 'entity',
      'update_column', 'import_reference', 'update_value', v_tag || ':UPDATED', 'archive', true,
      'payload', jsonb_build_object(
        'id', gen_random_uuid(), 'organization_id', p_organization_id, 'entity_id', p_entity_id,
        'bank_account_id', v_bank_account_id, 'statement_number', v_tag || ':BS',
        'statement_start_date', p_posting_date, 'statement_end_date', p_posting_date,
        'opening_balance', 0, 'closing_balance', 0,
        'currency_code', upper(btrim(p_currency_code)), 'import_reference', v_tag,
        'status', 'IMPORTED', 'created_by', p_actor_id
      )
    ),
    jsonb_build_object(
      'workspace', 'bank_reconciliation', 'table', 'finance_bank_reconciliation_runs', 'scope', 'entity',
      'update_column', 'notes', 'update_value', v_tag || ':UPDATED', 'archive', true,
      'payload', jsonb_build_object(
        'id', gen_random_uuid(), 'organization_id', p_organization_id, 'entity_id', p_entity_id,
        'bank_account_id', v_bank_account_id, 'reconciliation_date', p_posting_date,
        'book_closing_balance', 0, 'statement_closing_balance', 0,
        'difference_amount', 0, 'notes', v_tag, 'status', 'OPEN', 'created_by', p_actor_id
      )
    ),
    jsonb_build_object(
      'workspace', 'fx_revaluation', 'table', 'finance_fx_revaluation_runs', 'scope', 'entity',
      'update_column', 'notes', 'update_value', v_tag || ':UPDATED', 'archive', true,
      'payload', jsonb_build_object(
        'id', gen_random_uuid(), 'organization_id', p_organization_id, 'entity_id', p_entity_id,
        'period_id', v_period_id, 'revaluation_date', p_posting_date,
        'currency_code', upper(btrim(p_currency_code)), 'rate_source', v_tag,
        'unrealized_gain_account_id', v_revenue_account_id,
        'unrealized_loss_account_id', v_expense_account_id,
        'notes', v_tag, 'status', 'DRAFT', 'created_by', p_actor_id
      )
    ),
    jsonb_build_object(
      'workspace', 'vat_returns', 'table', 'finance_vat_returns', 'scope', 'entity',
      'update_column', 'notes', 'update_value', v_tag || ':UPDATED', 'archive', true,
      'payload', jsonb_build_object(
        'id', gen_random_uuid(), 'organization_id', p_organization_id, 'entity_id', p_entity_id,
        'registration_reference', v_tag || ':VAT', 'jurisdiction_code', 'TEST',
        'period_start', p_posting_date, 'period_end', p_posting_date,
        'filing_due_date', p_posting_date + 30,
        'currency_code', upper(btrim(p_currency_code)), 'notes', v_tag,
        'status', 'DRAFT', 'created_by', p_actor_id
      )
    ),
    jsonb_build_object(
      'workspace', 'depreciation', 'table', 'finance_depreciation_runs', 'scope', 'entity',
      'update_column', 'notes', 'update_value', v_tag || ':UPDATED', 'archive', true,
      'payload', jsonb_build_object(
        'id', gen_random_uuid(), 'organization_id', p_organization_id, 'entity_id', p_entity_id,
        'period_id', v_period_id, 'book_reference', v_tag || ':DEP',
        'period_start', p_posting_date, 'period_end', p_posting_date,
        'posting_date', p_posting_date, 'notes', v_tag,
        'status', 'DRAFT', 'created_by', p_actor_id
      )
    ),
    jsonb_build_object(
      'workspace', 'statutory_filings', 'table', 'finance_statutory_filings', 'scope', 'entity',
      'update_column', 'notes', 'update_value', v_tag || ':UPDATED', 'archive', true,
      'payload', jsonb_build_object(
        'id', gen_random_uuid(), 'organization_id', p_organization_id, 'entity_id', p_entity_id,
        'filing_type', 'TEST', 'jurisdiction_code', 'TEST',
        'authority_name', v_tag, 'period_start', p_posting_date,
        'period_end', p_posting_date, 'due_date', p_posting_date + 30,
        'submission_reference', v_tag, 'notes', v_tag,
        'status', 'DRAFT', 'created_by', p_actor_id
      )
    ),
    jsonb_build_object(
      'workspace', 'report_builder', 'table', 'finance_report_templates', 'scope', 'organization',
      'update_column', 'description', 'update_value', v_tag || ':UPDATED', 'archive', true,
      'payload', jsonb_build_object(
        'id', gen_random_uuid(), 'organization_id', p_organization_id,
        'name', v_tag || ':REPORT', 'report_type', 'CUSTOM',
        'description', v_tag, 'definition_json', jsonb_build_object('acceptance', true),
        'status', 'ACTIVE', 'created_by', p_actor_id
      )
    ),
    jsonb_build_object(
      'workspace', 'scheduled_reports', 'table', 'finance_scheduled_reports', 'scope', 'organization',
      'update_column', 'recipient_list', 'update_value', 'updated@example.invalid', 'archive', true,
      'payload', jsonb_build_object(
        'id', gen_random_uuid(), 'organization_id', p_organization_id,
        'name', v_tag || ':SCHEDULE', 'frequency', 'MONTHLY',
        'next_run_at', (p_posting_date::timestamp + interval '1 day'),
        'recipient_list', 'acceptance@example.invalid', 'delivery_format', 'PDF',
        'timezone', v_timezone, 'status', 'ACTIVE', 'created_by', p_actor_id
      )
    ),
    jsonb_build_object(
      'workspace', 'accounting_settings', 'table', 'finance_accounting_settings', 'scope', 'organization',
      'update_column', 'name', 'update_value', v_tag || ':UPDATED', 'archive', true,
      'payload', jsonb_build_object(
        'id', gen_random_uuid(), 'organization_id', p_organization_id,
        'setting_key', v_tag || ':SETTING', 'name', v_tag,
        'value_json', jsonb_build_object('acceptance', true),
        'effective_from', p_posting_date, 'status', 'ACTIVE', 'created_by', p_actor_id
      )
    ),
    jsonb_build_object(
      'workspace', 'number_sequences', 'table', 'finance_number_sequences', 'scope', 'organization',
      'update_column', 'prefix', 'update_value', 'UPD', 'archive', true,
      'payload', jsonb_build_object(
        'id', gen_random_uuid(), 'organization_id', p_organization_id, 'entity_id', p_entity_id,
        'document_type', v_tag || ':DOC', 'prefix', 'TST', 'next_number', 1,
        'padding', 6, 'reset_policy', 'NEVER', 'status', 'ACTIVE', 'created_by', p_actor_id
      )
    ),
    jsonb_build_object(
      'workspace', 'posting_rules', 'table', 'finance_posting_rules', 'scope', 'organization',
      'update_column', 'name', 'update_value', v_tag || ':UPDATED', 'archive', true,
      'payload', jsonb_build_object(
        'id', gen_random_uuid(), 'organization_id', p_organization_id, 'entity_id', p_entity_id,
        'name', v_tag || ':RULE', 'event_type', v_tag || ':EVENT',
        'source_module', 'finance_acceptance',
        'debit_account_id', v_asset_account_id, 'credit_account_id', v_revenue_account_id,
        'effective_from', p_posting_date, 'priority', 1,
        'status', 'ACTIVE', 'created_by', p_actor_id
      )
    ),
    jsonb_build_object(
      'workspace', 'approval_workflows', 'table', 'finance_approval_workflows', 'scope', 'organization',
      'update_column', 'name', 'update_value', v_tag || ':UPDATED', 'archive', true,
      'payload', jsonb_build_object(
        'id', gen_random_uuid(), 'organization_id', p_organization_id, 'entity_id', p_entity_id,
        'name', v_tag || ':APPROVAL', 'document_type', v_tag || ':DOC',
        'threshold_amount', 0, 'currency_code', upper(btrim(p_currency_code)),
        'approver_role', 'finance_acceptance', 'required_approvals', 1,
        'effective_from', p_posting_date, 'status', 'ACTIVE', 'created_by', p_actor_id
      )
    ),
    jsonb_build_object(
      'workspace', 'government_connections', 'table', 'finance_government_connections', 'scope', 'organization',
      'update_column', 'authority_name', 'update_value', v_tag || ':UPDATED', 'archive', true,
      'payload', jsonb_build_object(
        'id', gen_random_uuid(), 'organization_id', p_organization_id,
        'authority_name', v_tag || ':AUTHORITY', 'jurisdiction_code', 'TEST',
        'connection_type', 'API', 'credential_reference', v_tag,
        'status', 'DISCONNECTED', 'created_by', p_actor_id
      )
    ),
    jsonb_build_object(
      'workspace', 'banking_integrations', 'table', 'finance_banking_integrations', 'scope', 'organization',
      'update_column', 'provider_name', 'update_value', v_tag || ':UPDATED', 'archive', true,
      'payload', jsonb_build_object(
        'id', gen_random_uuid(), 'organization_id', p_organization_id,
        'provider_name', v_tag || ':BANK', 'connection_type', 'API',
        'bank_account_id', v_bank_account_id, 'credential_reference', v_tag,
        'status', 'DISCONNECTED', 'created_by', p_actor_id
      )
    ),
    jsonb_build_object(
      'workspace', 'exchange_rates', 'table', 'finance_exchange_rates', 'scope', 'organization',
      'update_column', 'source', 'update_value', v_tag || ':UPDATED', 'archive', false,
      'payload', jsonb_build_object(
        'id', gen_random_uuid(), 'organization_id', p_organization_id,
        'base_currency', upper(btrim(p_currency_code)), 'quote_currency', v_quote_currency,
        'effective_date', p_posting_date, 'rate', 1,
        'source', v_tag, 'rate_type', 'HISTORICAL', 'created_by', p_actor_id
      )
    ),
    jsonb_build_object(
      'workspace', 'e_invoicing', 'table', 'finance_e_invoicing_settings', 'scope', 'organization',
      'update_column', 'sender_identifier', 'update_value', v_tag || ':UPDATED', 'archive', true,
      'payload', jsonb_build_object(
        'id', gen_random_uuid(), 'organization_id', p_organization_id,
        'network', 'TEST', 'jurisdiction_code', 'TEST', 'document_type', 'INVOICE',
        'sender_identifier', v_tag, 'credential_reference', v_tag,
        'status', 'INACTIVE', 'created_by', p_actor_id
      )
    ),
    jsonb_build_object(
      'workspace', 'document_templates', 'table', 'finance_document_templates', 'scope', 'organization',
      'update_column', 'template_source_url', 'update_value', 'https://example.invalid/updated', 'archive', true,
      'payload', jsonb_build_object(
        'id', gen_random_uuid(), 'organization_id', p_organization_id,
        'name', v_tag || ':TEMPLATE', 'document_type', 'INVOICE',
        'locale', 'en-GB', 'version', 1,
        'template_source_url', 'https://example.invalid/template',
        'status', 'ACTIVE', 'created_by', p_actor_id
      )
    )
  );

  for v_case in
    select value from jsonb_array_elements(v_cases)
  loop
    begin
      v_workspace := v_case->>'workspace';
      v_table := v_case->>'table';
      v_scope := v_case->>'scope';
      v_update_column := v_case->>'update_column';
      v_update_value := v_case->>'update_value';
      v_archive := coalesce((v_case->>'archive')::boolean, false);
      v_payload := v_case->'payload';

      if v_workspace = 'bank_reconciliation' then
        if v_bank_statement_id is null then
          raise exception 'Bank statement prerequisite failed';
        end if;
        v_payload := v_payload || jsonb_build_object('bank_statement_id', v_bank_statement_id);
      end if;

      if v_workspace = 'scheduled_reports' then
        if v_report_template_id is null then
          raise exception 'Report template prerequisite failed';
        end if;
        v_payload := v_payload || jsonb_build_object('report_template_id', v_report_template_id);
      end if;

      v_id := (v_payload->>'id')::uuid;

      select
        string_agg(format('%I', key), ', ' order by key),
        string_agg(
          case
            when value = 'null'::jsonb then 'null'
            else quote_literal(value #>> '{}')
          end,
          ', ' order by key
        )
      into v_columns, v_values
      from jsonb_each(v_payload);

      execute format(
        'insert into public.%I (%s) values (%s)',
        v_table,
        v_columns,
        v_values
      );

      execute format(
        'select to_jsonb(row_value) from public.%I row_value where id = $1',
        v_table
      ) into v_row using v_id;

      if v_row is null then
        raise exception 'Inserted row could not be read back';
      end if;

      if nullif(v_row->>'organization_id', '')::uuid is distinct from p_organization_id then
        raise exception 'Read-back organization scope mismatch';
      end if;

      if v_scope = 'entity'
         and nullif(v_row->>'entity_id', '')::uuid is distinct from p_entity_id then
        raise exception 'Read-back entity scope mismatch';
      end if;

      execute format(
        'update public.%I set %I = %L, updated_at = now() where id = %L',
        v_table,
        v_update_column,
        v_update_value,
        v_id
      );

      execute format(
        'select to_jsonb(row_value) from public.%I row_value where id = $1',
        v_table
      ) into v_row using v_id;

      if v_row->>v_update_column is distinct from v_update_value then
        raise exception 'Update did not persist through table read-back';
      end if;

      if v_archive then
        execute format(
          'update public.%I set status = %L, updated_at = now() where id = %L',
          v_table,
          'ARCHIVED',
          v_id
        );

        execute format(
          'select status from public.%I where id = $1',
          v_table
        ) into v_status using v_id;

        if v_status is distinct from 'ARCHIVED' then
          raise exception 'Archive status did not persist';
        end if;
      end if;

      if v_workspace = 'bank_statements' then
        v_bank_statement_id := v_id;
      elsif v_workspace = 'report_builder' then
        v_report_template_id := v_id;
      end if;

      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'name', 'crud.' || v_workspace,
        'passed', true,
        'details', jsonb_build_object(
          'table', v_table,
          'id', v_id,
          'insert', true,
          'read', true,
          'update', true,
          'archive', v_archive,
          'scope', v_scope
        )
      ));
    exception when others then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'name', 'crud.' || coalesce(v_workspace, 'unknown'),
        'passed', false,
        'message', sqlerrm,
        'details', jsonb_build_object('table', v_table)
      ));
    end;
  end loop;

  begin
    select to_jsonb(profile), profile.id
    into v_existing_profile, v_profile_id
    from public.finance_organization_profiles profile
    where profile.organization_id = p_organization_id
    for update;

    if v_profile_id is null then
      insert into public.finance_organization_profiles (
        organization_id, legal_name, country_code,
        functional_currency, reporting_currency,
        accounting_standard, fiscal_year_start_month,
        timezone, created_by
      ) values (
        p_organization_id, v_tag || ':PROFILE', 'TEST',
        upper(btrim(p_currency_code)), upper(btrim(p_currency_code)),
        'TEST', 1, v_timezone, p_actor_id
      ) returning id into v_profile_id;
    else
      update public.finance_organization_profiles
      set legal_name = v_tag || ':PROFILE',
          updated_at = now()
      where id = v_profile_id;
    end if;

    select to_jsonb(profile)
    into v_row
    from public.finance_organization_profiles profile
    where profile.id = v_profile_id
      and profile.organization_id = p_organization_id;

    if v_row is null or v_row->>'legal_name' is distinct from v_tag || ':PROFILE' then
      raise exception 'Organization profile write/read/update failed';
    end if;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'name', 'crud.organization_profile',
      'passed', true,
      'details', jsonb_build_object(
        'table', 'finance_organization_profiles',
        'id', v_profile_id,
        'insert_or_update', true,
        'read', true,
        'archive', false,
        'scope', 'organization',
        'singleton', true
      )
    ));
  exception when others then
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'name', 'crud.organization_profile',
      'passed', false,
      'message', sqlerrm,
      'details', jsonb_build_object('table', 'finance_organization_profiles')
    ));
  end;

  begin
    select count(*) into v_read_count
    from public.accounts_receivable
    where organization_id = p_organization_id
      and entity_id = p_entity_id;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'name', 'read.customer_statements', 'passed', true,
      'details', jsonb_build_object('table', 'accounts_receivable', 'row_count', v_read_count)
    ));
  exception when others then
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'name', 'read.customer_statements', 'passed', false, 'message', sqlerrm
    ));
  end;

  begin
    select count(*) into v_read_count
    from public.accounts_payable
    where organization_id = p_organization_id
      and entity_id = p_entity_id;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'name', 'read.vendor_statements', 'passed', true,
      'details', jsonb_build_object('table', 'accounts_payable', 'row_count', v_read_count)
    ));
  exception when others then
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'name', 'read.vendor_statements', 'passed', false, 'message', sqlerrm
    ));
  end;

  begin
    select count(*)
    into v_read_count
    from public.bank_ledger
    where organization_id = p_organization_id
      and entity_id = p_entity_id;

    v_table := 'bank_ledger';

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'name', 'read.cash_management', 'passed', true,
      'details', jsonb_build_object('table', v_table, 'row_count', v_read_count)
    ));
  exception when others then
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'name', 'read.cash_management', 'passed', false, 'message', sqlerrm
    ));
  end;

  v_results := v_results || jsonb_build_array(jsonb_build_object(
    'name', 'probe.prerequisite_master_data_rolled_back',
    'passed', true,
    'details', jsonb_build_object('provisioned', v_provisioned)
  ));

  raise exception '__FINANCE_WORKSPACE_CRUD_CERTIFICATION_ROLLBACK__';
exception when others then
  get stacked diagnostics v_error = message_text;

  if v_error = '__FINANCE_WORKSPACE_CRUD_CERTIFICATION_ROLLBACK__' then
    return jsonb_build_object(
      'success', not jsonb_path_exists(v_results, '$[*] ? (@.passed == false)'),
      'rolled_back', true,
      'tag', v_tag,
      'results', v_results,
      'passed', (select count(*) from jsonb_array_elements(v_results) row_value where (row_value->>'passed')::boolean),
      'failed', (select count(*) from jsonb_array_elements(v_results) row_value where not (row_value->>'passed')::boolean)
    );
  end if;

  return jsonb_build_object(
    'success', false,
    'rolled_back', true,
    'tag', v_tag,
    'results', v_results || jsonb_build_array(jsonb_build_object(
      'name', 'probe.unexpected_failure', 'passed', false, 'message', v_error
    )),
    'passed', (select count(*) from jsonb_array_elements(v_results) row_value where (row_value->>'passed')::boolean),
    'failed', 1 + (select count(*) from jsonb_array_elements(v_results) row_value where not (row_value->>'passed')::boolean)
  );
end;
$$;

revoke all on function public.finance_run_workspace_crud_certification_probe(
  uuid, uuid, uuid, date, text
) from public, anon, authenticated;

grant execute on function public.finance_run_workspace_crud_certification_probe(
  uuid, uuid, uuid, date, text
) to service_role;

notify pgrst, 'reload schema';

commit;
