begin;

alter table if exists public.finance_revenue_recognition_schedules
  add column if not exists organization_id uuid,
  add column if not exists entity_id uuid,
  add column if not exists customer_id uuid,
  add column if not exists source_document_type text,
  add column if not exists source_document_id uuid,
  add column if not exists contract_reference text,
  add column if not exists recognition_method text,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists total_amount numeric(20,6),
  add column if not exists currency_code text,
  add column if not exists revenue_account_id uuid,
  add column if not exists deferred_revenue_account_id uuid,
  add column if not exists notes text,
  add column if not exists status text default 'DRAFT',
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table if exists public.finance_vat_returns
  add column if not exists organization_id uuid,
  add column if not exists entity_id uuid,
  add column if not exists registration_reference text,
  add column if not exists jurisdiction_code text,
  add column if not exists period_start date,
  add column if not exists period_end date,
  add column if not exists filing_due_date date,
  add column if not exists currency_code text,
  add column if not exists notes text,
  add column if not exists status text default 'DRAFT',
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table if exists public.finance_depreciation_runs
  add column if not exists organization_id uuid,
  add column if not exists entity_id uuid,
  add column if not exists period_id uuid,
  add column if not exists book_reference text,
  add column if not exists period_start date,
  add column if not exists period_end date,
  add column if not exists posting_date date,
  add column if not exists notes text,
  add column if not exists status text default 'DRAFT',
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table if exists public.finance_statutory_filings
  add column if not exists organization_id uuid,
  add column if not exists entity_id uuid,
  add column if not exists filing_type text,
  add column if not exists jurisdiction_code text,
  add column if not exists authority_name text,
  add column if not exists period_start date,
  add column if not exists period_end date,
  add column if not exists due_date date,
  add column if not exists submission_reference text,
  add column if not exists notes text,
  add column if not exists status text default 'DRAFT',
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table if exists public.finance_report_templates
  add column if not exists organization_id uuid,
  add column if not exists name text,
  add column if not exists report_type text,
  add column if not exists description text,
  add column if not exists definition_json jsonb default '{}'::jsonb,
  add column if not exists status text default 'ACTIVE',
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table if exists public.finance_scheduled_reports
  add column if not exists organization_id uuid,
  add column if not exists report_template_id uuid,
  add column if not exists name text,
  add column if not exists frequency text,
  add column if not exists next_run_at timestamptz,
  add column if not exists recipient_list text,
  add column if not exists delivery_format text,
  add column if not exists timezone text,
  add column if not exists status text default 'ACTIVE',
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table if exists public.finance_organization_profiles
  add column if not exists organization_id uuid,
  add column if not exists legal_name text,
  add column if not exists country_code text,
  add column if not exists functional_currency text,
  add column if not exists reporting_currency text,
  add column if not exists accounting_standard text,
  add column if not exists fiscal_year_start_month integer,
  add column if not exists timezone text,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table if exists public.finance_accounting_settings
  add column if not exists organization_id uuid,
  add column if not exists setting_key text,
  add column if not exists name text,
  add column if not exists value_json jsonb default '{}'::jsonb,
  add column if not exists effective_from date,
  add column if not exists effective_to date,
  add column if not exists status text default 'ACTIVE',
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table if exists public.finance_number_sequences
  add column if not exists organization_id uuid,
  add column if not exists entity_id uuid,
  add column if not exists document_type text,
  add column if not exists prefix text,
  add column if not exists suffix text,
  add column if not exists next_number bigint,
  add column if not exists padding integer,
  add column if not exists reset_policy text,
  add column if not exists status text default 'ACTIVE',
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table if exists public.finance_posting_rules
  add column if not exists organization_id uuid,
  add column if not exists entity_id uuid,
  add column if not exists name text,
  add column if not exists event_type text,
  add column if not exists source_module text,
  add column if not exists debit_account_id uuid,
  add column if not exists credit_account_id uuid,
  add column if not exists effective_from date,
  add column if not exists effective_to date,
  add column if not exists priority integer default 100,
  add column if not exists status text default 'ACTIVE',
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table if exists public.finance_approval_workflows
  add column if not exists organization_id uuid,
  add column if not exists entity_id uuid,
  add column if not exists name text,
  add column if not exists document_type text,
  add column if not exists threshold_amount numeric(20,6),
  add column if not exists currency_code text,
  add column if not exists approver_role text,
  add column if not exists required_approvals integer default 1,
  add column if not exists effective_from date,
  add column if not exists effective_to date,
  add column if not exists status text default 'ACTIVE',
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table if exists public.finance_government_connections
  add column if not exists organization_id uuid,
  add column if not exists authority_name text,
  add column if not exists jurisdiction_code text,
  add column if not exists connection_type text,
  add column if not exists credential_reference text,
  add column if not exists last_verified_at timestamptz,
  add column if not exists status text default 'DISCONNECTED',
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table if exists public.finance_banking_integrations
  add column if not exists organization_id uuid,
  add column if not exists provider_name text,
  add column if not exists connection_type text,
  add column if not exists bank_account_id uuid,
  add column if not exists credential_reference text,
  add column if not exists last_sync_at timestamptz,
  add column if not exists status text default 'DISCONNECTED',
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table if exists public.finance_exchange_rates
  add column if not exists organization_id uuid,
  add column if not exists base_currency text,
  add column if not exists quote_currency text,
  add column if not exists effective_date date,
  add column if not exists rate numeric(24,10),
  add column if not exists source text,
  add column if not exists rate_type text,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table if exists public.finance_e_invoicing_settings
  add column if not exists organization_id uuid,
  add column if not exists network text,
  add column if not exists jurisdiction_code text,
  add column if not exists document_type text,
  add column if not exists sender_identifier text,
  add column if not exists credential_reference text,
  add column if not exists status text default 'INACTIVE',
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table if exists public.finance_document_templates
  add column if not exists organization_id uuid,
  add column if not exists name text,
  add column if not exists document_type text,
  add column if not exists locale text,
  add column if not exists version integer default 1,
  add column if not exists template_source_url text,
  add column if not exists status text default 'ACTIVE',
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

notify pgrst, 'reload schema';

commit;
