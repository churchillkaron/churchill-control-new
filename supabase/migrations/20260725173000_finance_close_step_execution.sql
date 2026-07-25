begin;

create table if not exists public.finance_exchange_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid,
  from_currency text not null,
  to_currency text not null,
  rate numeric not null,
  effective_date date not null,
  source text,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists finance_exchange_rates_scope_date_unique
on public.finance_exchange_rates (
  organization_id,
  coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid),
  upper(btrim(from_currency)),
  upper(btrim(to_currency)),
  effective_date
);

create table if not exists public.finance_fx_revaluation_accounts (
  organization_id uuid not null,
  entity_id uuid not null,
  account_id uuid not null,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, entity_id, account_id)
);

create table if not exists public.finance_tax_close_configurations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid,
  tax_type text not null,
  recoverable_tax_account_id uuid not null,
  payable_tax_account_id uuid not null,
  settlement_account_id uuid not null,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists finance_tax_close_configuration_scope_unique
on public.finance_tax_close_configurations (
  organization_id,
  coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid),
  upper(btrim(tax_type))
);

create table if not exists public.currency_revaluations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid,
  period_id uuid,
  account_id uuid not null,
  base_currency text not null,
  target_currency text not null,
  old_value numeric not null default 0,
  new_value numeric not null default 0,
  gain_loss numeric not null default 0,
  closing_rate numeric,
  journal_entry_id uuid,
  idempotency_key text,
  created_at timestamptz not null default now()
);

alter table public.currency_revaluations
  add column if not exists entity_id uuid,
  add column if not exists period_id uuid,
  add column if not exists closing_rate numeric,
  add column if not exists journal_entry_id uuid,
  add column if not exists idempotency_key text;

create unique index if not exists currency_revaluations_period_account_currency_unique
on public.currency_revaluations (
  organization_id,
  entity_id,
  period_id,
  account_id,
  upper(btrim(base_currency)),
  upper(btrim(target_currency))
)
where period_id is not null;

create table if not exists public.bank_statements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid,
  period_id uuid,
  bank_account_id uuid,
  transaction_date date not null,
  description text,
  amount numeric not null,
  direction text not null,
  reference_number text,
  matched boolean,
  matched_at timestamptz,
  ledger_reference_id uuid,
  created_at timestamptz not null default now()
);

alter table public.bank_statements
  add column if not exists entity_id uuid,
  add column if not exists period_id uuid,
  add column if not exists bank_account_id uuid,
  add column if not exists matched boolean,
  add column if not exists matched_at timestamptz,
  add column if not exists ledger_reference_id uuid;

alter table public.bank_ledger
  add column if not exists period_id uuid,
  add column if not exists bank_account_id uuid,
  add column if not exists reconciled_statement_id uuid,
  add column if not exists reconciled_at timestamptz,
  add column if not exists reconciled_by uuid;

create unique index if not exists bank_statements_ledger_reference_unique
on public.bank_statements (organization_id, ledger_reference_id)
where ledger_reference_id is not null;

create unique index if not exists bank_ledger_statement_reference_unique
on public.bank_ledger (organization_id, reconciled_statement_id)
where reconciled_statement_id is not null;

create or replace function public.finance_reconcile_bank_period_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_period_id uuid,
  p_completed_by uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period public.accounting_periods%rowtype;
  v_existing jsonb;
  v_request_hash text;
  v_statement public.bank_statements%rowtype;
  v_ledger public.bank_ledger%rowtype;
  v_statement_count bigint;
  v_ledger_count bigint;
  v_match_count bigint := 0;
  v_unmatched_statements bigint;
  v_unmatched_ledger bigint;
  v_step public.finance_period_close_steps%rowtype;
  v_result jsonb;
begin
  v_period := public.finance_assert_open_period(
    p_organization_id,
    p_entity_id,
    p_period_id
  );

  v_request_hash := md5(concat_ws(
    '|',
    p_period_id::text,
    v_period.start_date::text,
    v_period.end_date::text
  ));

  v_existing := public.finance_claim_idempotency(
    p_organization_id,
    p_entity_id,
    'PERIOD_BANK_RECONCILIATION',
    p_idempotency_key,
    v_request_hash,
    p_period_id
  );

  if v_existing is not null then
    return v_existing;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':' || p_entity_id::text || ':bank-reconciliation:' || p_period_id::text,
      0
    )
  );

  update public.bank_statements
  set period_id = p_period_id
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and transaction_date between v_period.start_date and v_period.end_date
    and period_id is null;

  update public.bank_ledger
  set period_id = p_period_id
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and created_at::date between v_period.start_date and v_period.end_date
    and period_id is null;

  select count(*)
  into v_statement_count
  from public.bank_statements
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and transaction_date between v_period.start_date and v_period.end_date;

  select count(*)
  into v_ledger_count
  from public.bank_ledger
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and created_at::date between v_period.start_date and v_period.end_date;

  if v_statement_count = 0 and v_ledger_count = 0 then
    insert into public.finance_period_close_steps (
      organization_id,
      entity_id,
      period_id,
      step_type,
      status,
      evidence,
      idempotency_key,
      completed_by,
      completed_at,
      created_at,
      updated_at
    ) values (
      p_organization_id,
      p_entity_id,
      p_period_id,
      'BANK_RECONCILIATION',
      'SKIPPED',
      jsonb_build_object(
        'reason', 'No bank statement or bank ledger activity exists in the selected period',
        'statement_count', 0,
        'ledger_count', 0
      ),
      btrim(p_idempotency_key),
      p_completed_by,
      now(),
      now(),
      now()
    )
    on conflict (organization_id, entity_id, period_id, step_type)
    do update set
      status = excluded.status,
      evidence = excluded.evidence,
      idempotency_key = excluded.idempotency_key,
      completed_by = excluded.completed_by,
      completed_at = excluded.completed_at,
      updated_at = now()
    returning * into v_step;

    v_result := jsonb_build_object(
      'success', true,
      'period_id', p_period_id,
      'step', to_jsonb(v_step)
    );

    perform public.finance_complete_idempotency(
      p_organization_id,
      p_entity_id,
      'PERIOD_BANK_RECONCILIATION',
      p_idempotency_key,
      v_result
    );

    return v_result;
  end if;

  for v_statement in
    select *
    from public.bank_statements
    where organization_id = p_organization_id
      and entity_id = p_entity_id
      and transaction_date between v_period.start_date and v_period.end_date
      and coalesce(matched, false) = false
    order by transaction_date, id
    for update
  loop
    select *
    into v_ledger
    from public.bank_ledger
    where organization_id = p_organization_id
      and entity_id = p_entity_id
      and created_at::date between v_period.start_date and v_period.end_date
      and reconciled_statement_id is null
      and amount = v_statement.amount
      and upper(btrim(direction)) = upper(btrim(v_statement.direction))
      and (
        v_statement.bank_account_id is null
        or bank_account_id is null
        or bank_account_id = v_statement.bank_account_id
      )
    order by
      case
        when nullif(btrim(v_statement.reference_number), '') is not null
         and reference_id::text = btrim(v_statement.reference_number)
          then 0
        else 1
      end,
      abs(created_at::date - v_statement.transaction_date),
      created_at,
      id
    limit 1
    for update skip locked;

    if found then
      update public.bank_statements
      set matched = true,
          matched_at = now(),
          ledger_reference_id = v_ledger.id,
          period_id = p_period_id
      where id = v_statement.id;

      update public.bank_ledger
      set reconciled_statement_id = v_statement.id,
          reconciled_at = now(),
          reconciled_by = p_completed_by,
          period_id = p_period_id
      where id = v_ledger.id;

      v_match_count := v_match_count + 1;
    end if;
  end loop;

  select count(*)
  into v_unmatched_statements
  from public.bank_statements
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and transaction_date between v_period.start_date and v_period.end_date
    and coalesce(matched, false) = false;

  select count(*)
  into v_unmatched_ledger
  from public.bank_ledger
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and created_at::date between v_period.start_date and v_period.end_date
    and reconciled_statement_id is null;

  if v_unmatched_statements > 0 or v_unmatched_ledger > 0 then
    raise exception
      'Bank reconciliation incomplete: % unmatched statement(s), % unmatched ledger entrie(s)',
      v_unmatched_statements,
      v_unmatched_ledger;
  end if;

  insert into public.finance_period_close_steps (
    organization_id,
    entity_id,
    period_id,
    step_type,
    status,
    evidence,
    idempotency_key,
    completed_by,
    completed_at,
    created_at,
    updated_at
  ) values (
    p_organization_id,
    p_entity_id,
    p_period_id,
    'BANK_RECONCILIATION',
    'COMPLETED',
    jsonb_build_object(
      'statement_count', v_statement_count,
      'ledger_count', v_ledger_count,
      'matched_in_run', v_match_count,
      'unmatched_statements', 0,
      'unmatched_ledger_entries', 0
    ),
    btrim(p_idempotency_key),
    p_completed_by,
    now(),
    now(),
    now()
  )
  on conflict (organization_id, entity_id, period_id, step_type)
  do update set
    status = excluded.status,
    evidence = excluded.evidence,
    idempotency_key = excluded.idempotency_key,
    completed_by = excluded.completed_by,
    completed_at = excluded.completed_at,
    updated_at = now()
  returning * into v_step;

  v_result := jsonb_build_object(
    'success', true,
    'period_id', p_period_id,
    'step', to_jsonb(v_step)
  );

  perform public.finance_complete_idempotency(
    p_organization_id,
    p_entity_id,
    'PERIOD_BANK_RECONCILIATION',
    p_idempotency_key,
    v_result
  );

  return v_result;
end;
$$;

create or replace function public.finance_reconcile_subledgers_period_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_period_id uuid,
  p_tolerance numeric,
  p_completed_by uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period public.accounting_periods%rowtype;
  v_existing jsonb;
  v_request_hash text;
  v_tolerance numeric;
  v_ar_account_id uuid;
  v_ap_account_id uuid;
  v_ar_invoices numeric;
  v_ar_payments numeric;
  v_ar_subledger numeric;
  v_ar_gl numeric;
  v_ap_invoices numeric;
  v_ap_payments numeric;
  v_ap_subledger numeric;
  v_ap_gl numeric;
  v_ar_difference numeric;
  v_ap_difference numeric;
  v_step public.finance_period_close_steps%rowtype;
  v_result jsonb;
begin
  v_period := public.finance_assert_open_period(
    p_organization_id,
    p_entity_id,
    p_period_id
  );

  v_tolerance := coalesce(p_tolerance, 0.01);

  if v_tolerance < 0 then
    raise exception 'Reconciliation tolerance cannot be negative';
  end if;

  v_request_hash := md5(concat_ws(
    '|',
    p_period_id::text,
    v_period.end_date::text,
    v_tolerance::text
  ));

  v_existing := public.finance_claim_idempotency(
    p_organization_id,
    p_entity_id,
    'PERIOD_SUBLEDGER_RECONCILIATION',
    p_idempotency_key,
    v_request_hash,
    p_period_id
  );

  if v_existing is not null then
    return v_existing;
  end if;

  select debit_account_id
  into v_ar_account_id
  from public.finance_posting_mappings
  where organization_id = p_organization_id
    and event_type = 'CUSTOMER_INVOICE_CREATED'
    and upper(coalesce(status, '')) = 'ACTIVE'
    and (entity_id = p_entity_id or entity_id is null)
  order by (entity_id = p_entity_id) desc
  limit 1;

  select credit_account_id
  into v_ap_account_id
  from public.finance_posting_mappings
  where organization_id = p_organization_id
    and event_type = 'VENDOR_INVOICE_CREATED'
    and upper(coalesce(status, '')) = 'ACTIVE'
    and (entity_id = p_entity_id or entity_id is null)
  order by (entity_id = p_entity_id) desc
  limit 1;

  if v_ar_account_id is null then
    raise exception 'AR control account is not configured in CUSTOMER_INVOICE_CREATED posting mapping';
  end if;

  if v_ap_account_id is null then
    raise exception 'AP control account is not configured in VENDOR_INVOICE_CREATED posting mapping';
  end if;

  select coalesce(sum(total_amount), 0)
  into v_ar_invoices
  from public.customer_invoices
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and invoice_date <= v_period.end_date
    and lower(coalesce(status, '')) not in ('cancelled', 'canceled', 'void');

  select coalesce(sum(amount), 0)
  into v_ar_payments
  from public.customer_payments
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and payment_date <= v_period.end_date;

  v_ar_subledger := v_ar_invoices - v_ar_payments;

  select coalesce(sum(debit) - sum(credit), 0)
  into v_ar_gl
  from public.general_ledger
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and account_id = v_ar_account_id
    and posting_date <= v_period.end_date;

  select coalesce(sum(total_amount), 0)
  into v_ap_invoices
  from public.vendor_invoices
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and invoice_date <= v_period.end_date
    and lower(coalesce(status, '')) not in ('cancelled', 'canceled', 'void');

  select coalesce(sum(amount), 0)
  into v_ap_payments
  from public.vendor_payments
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and paid_at::date <= v_period.end_date;

  v_ap_subledger := v_ap_invoices - v_ap_payments;

  select coalesce(sum(credit) - sum(debit), 0)
  into v_ap_gl
  from public.general_ledger
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and account_id = v_ap_account_id
    and posting_date <= v_period.end_date;

  v_ar_difference := v_ar_subledger - v_ar_gl;
  v_ap_difference := v_ap_subledger - v_ap_gl;

  if abs(v_ar_difference) > v_tolerance or abs(v_ap_difference) > v_tolerance then
    raise exception
      'Subledger reconciliation failed: AR difference %, AP difference %',
      round(v_ar_difference, 2),
      round(v_ap_difference, 2);
  end if;

  insert into public.finance_period_close_steps (
    organization_id,
    entity_id,
    period_id,
    step_type,
    status,
    evidence,
    idempotency_key,
    completed_by,
    completed_at,
    created_at,
    updated_at
  ) values (
    p_organization_id,
    p_entity_id,
    p_period_id,
    'SUBLEDGER_RECONCILIATION',
    'COMPLETED',
    jsonb_build_object(
      'tolerance', v_tolerance,
      'ar_account_id', v_ar_account_id,
      'ar_subledger_balance', v_ar_subledger,
      'ar_gl_balance', v_ar_gl,
      'ar_difference', v_ar_difference,
      'ap_account_id', v_ap_account_id,
      'ap_subledger_balance', v_ap_subledger,
      'ap_gl_balance', v_ap_gl,
      'ap_difference', v_ap_difference
    ),
    btrim(p_idempotency_key),
    p_completed_by,
    now(),
    now(),
    now()
  )
  on conflict (organization_id, entity_id, period_id, step_type)
  do update set
    status = excluded.status,
    evidence = excluded.evidence,
    idempotency_key = excluded.idempotency_key,
    completed_by = excluded.completed_by,
    completed_at = excluded.completed_at,
    updated_at = now()
  returning * into v_step;

  v_result := jsonb_build_object(
    'success', true,
    'period_id', p_period_id,
    'step', to_jsonb(v_step)
  );

  perform public.finance_complete_idempotency(
    p_organization_id,
    p_entity_id,
    'PERIOD_SUBLEDGER_RECONCILIATION',
    p_idempotency_key,
    v_result
  );

  return v_result;
end;
$$;

create or replace function public.finance_run_fx_revaluation_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_period_id uuid,
  p_revaluations jsonb,
  p_currency_code text,
  p_journal_lines jsonb,
  p_created_by uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period public.accounting_periods%rowtype;
  v_existing jsonb;
  v_request_hash text;
  v_row jsonb;
  v_journal jsonb;
  v_journal_id uuid;
  v_step public.finance_period_close_steps%rowtype;
  v_total_gain_loss numeric := 0;
  v_result jsonb;
begin
  v_period := public.finance_assert_open_period(
    p_organization_id,
    p_entity_id,
    p_period_id
  );

  if coalesce(jsonb_array_length(p_revaluations), 0) = 0 then
    raise exception 'FX revaluation rows required';
  end if;

  if coalesce(jsonb_array_length(p_journal_lines), 0) < 2 then
    raise exception 'FX revaluation journal requires at least two lines';
  end if;

  v_request_hash := md5(concat_ws(
    '|',
    p_period_id::text,
    upper(btrim(p_currency_code)),
    p_revaluations::text,
    p_journal_lines::text
  ));

  v_existing := public.finance_claim_idempotency(
    p_organization_id,
    p_entity_id,
    'PERIOD_FX_REVALUATION',
    p_idempotency_key,
    v_request_hash,
    p_period_id
  );

  if v_existing is not null then
    return v_existing;
  end if;

  select public.finance_post_journal_atomic(
    p_organization_id => p_organization_id,
    p_entity_id => p_entity_id,
    p_posting_date => v_period.end_date,
    p_document_date => v_period.end_date,
    p_journal_type => 'PERIOD_CLOSE',
    p_reference => 'period-close:' || p_period_id::text || ':fx-revaluation',
    p_source_module => 'period_close',
    p_source_document => 'FX_REVALUATION',
    p_source_document_id => p_period_id,
    p_description => 'Foreign currency revaluation',
    p_currency_code => upper(btrim(p_currency_code)),
    p_exchange_rate => 1,
    p_lines => p_journal_lines,
    p_created_by => p_created_by,
    p_idempotency_key => 'period-close:' || p_period_id::text || ':fx-revaluation:' || btrim(p_idempotency_key)
  ) into v_journal;

  v_journal_id := nullif(v_journal->'journal'->>'id', '')::uuid;

  for v_row in
    select value from jsonb_array_elements(p_revaluations)
  loop
    v_total_gain_loss := v_total_gain_loss + coalesce(nullif(v_row->>'gain_loss', '')::numeric, 0);

    insert into public.currency_revaluations (
      organization_id,
      entity_id,
      period_id,
      account_id,
      base_currency,
      target_currency,
      old_value,
      new_value,
      gain_loss,
      closing_rate,
      journal_entry_id,
      idempotency_key,
      created_at
    ) values (
      p_organization_id,
      p_entity_id,
      p_period_id,
      (v_row->>'account_id')::uuid,
      upper(btrim(v_row->>'foreign_currency')),
      upper(btrim(p_currency_code)),
      coalesce(nullif(v_row->>'carrying_value', '')::numeric, 0),
      coalesce(nullif(v_row->>'closing_value', '')::numeric, 0),
      coalesce(nullif(v_row->>'gain_loss', '')::numeric, 0),
      coalesce(nullif(v_row->>'closing_rate', '')::numeric, 0),
      v_journal_id,
      btrim(p_idempotency_key),
      now()
    )
    on conflict (
      organization_id,
      entity_id,
      period_id,
      account_id,
      upper(btrim(base_currency)),
      upper(btrim(target_currency))
    )
    do update set
      old_value = excluded.old_value,
      new_value = excluded.new_value,
      gain_loss = excluded.gain_loss,
      closing_rate = excluded.closing_rate,
      journal_entry_id = excluded.journal_entry_id,
      idempotency_key = excluded.idempotency_key;
  end loop;

  insert into public.finance_period_close_steps (
    organization_id,
    entity_id,
    period_id,
    step_type,
    status,
    journal_entry_id,
    evidence,
    idempotency_key,
    completed_by,
    completed_at,
    created_at,
    updated_at
  ) values (
    p_organization_id,
    p_entity_id,
    p_period_id,
    'FX_REVALUATION',
    'COMPLETED',
    v_journal_id,
    jsonb_build_object(
      'revaluation_count', jsonb_array_length(p_revaluations),
      'total_gain_loss', v_total_gain_loss,
      'functional_currency', upper(btrim(p_currency_code))
    ),
    btrim(p_idempotency_key),
    p_created_by,
    now(),
    now(),
    now()
  )
  on conflict (organization_id, entity_id, period_id, step_type)
  do update set
    status = 'COMPLETED',
    journal_entry_id = excluded.journal_entry_id,
    evidence = excluded.evidence,
    idempotency_key = excluded.idempotency_key,
    completed_by = excluded.completed_by,
    completed_at = excluded.completed_at,
    updated_at = now()
  returning * into v_step;

  v_result := jsonb_build_object(
    'success', true,
    'period_id', p_period_id,
    'step', to_jsonb(v_step),
    'journal', v_journal
  );

  perform public.finance_complete_idempotency(
    p_organization_id,
    p_entity_id,
    'PERIOD_FX_REVALUATION',
    p_idempotency_key,
    v_result
  );

  return v_result;
end;
$$;

revoke all on function public.finance_reconcile_bank_period_atomic(uuid, uuid, uuid, uuid, text) from public;
revoke all on function public.finance_reconcile_subledgers_period_atomic(uuid, uuid, uuid, numeric, uuid, text) from public;
revoke all on function public.finance_run_fx_revaluation_atomic(uuid, uuid, uuid, jsonb, text, jsonb, uuid, text) from public;

grant execute on function public.finance_reconcile_bank_period_atomic(uuid, uuid, uuid, uuid, text) to service_role;
grant execute on function public.finance_reconcile_subledgers_period_atomic(uuid, uuid, uuid, numeric, uuid, text) to service_role;
grant execute on function public.finance_run_fx_revaluation_atomic(uuid, uuid, uuid, jsonb, text, jsonb, uuid, text) to service_role;

commit;
