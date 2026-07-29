begin;

alter table public.intercompany_transactions
  add column if not exists from_legal_entity_id uuid,
  add column if not exists to_legal_entity_id uuid,
  add column if not exists transaction_number text,
  add column if not exists transaction_type text,
  add column if not exists reference_number text,
  add column if not exists transaction_date date,
  add column if not exists posting_date date,
  add column if not exists due_date date,
  add column if not exists description text,
  add column if not exists transaction_currency text,
  add column if not exists currency text,
  add column if not exists amount numeric,
  add column if not exists from_entity_currency text,
  add column if not exists to_entity_currency text,
  add column if not exists from_exchange_rate numeric,
  add column if not exists to_exchange_rate numeric,
  add column if not exists from_functional_amount numeric,
  add column if not exists to_functional_amount numeric,
  add column if not exists from_intercompany_account_id uuid,
  add column if not exists from_offset_account_id uuid,
  add column if not exists from_intercompany_side text,
  add column if not exists to_intercompany_account_id uuid,
  add column if not exists to_offset_account_id uuid,
  add column if not exists to_intercompany_side text,
  add column if not exists from_journal_entry_id uuid,
  add column if not exists to_journal_entry_id uuid,
  add column if not exists status text default 'DRAFT',
  add column if not exists reconciliation_status text default 'UNRECONCILED',
  add column if not exists outstanding_amount numeric,
  add column if not exists settled_amount numeric default 0,
  add column if not exists idempotency_key text,
  add column if not exists created_by text,
  add column if not exists updated_by text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.intercompany_transactions
set status = upper(coalesce(nullif(btrim(status), ''), 'DRAFT')),
    reconciliation_status = upper(coalesce(nullif(btrim(reconciliation_status), ''), 'UNRECONCILED')),
    transaction_currency = upper(coalesce(transaction_currency, currency)),
    currency = upper(coalesce(currency, transaction_currency)),
    settled_amount = coalesce(settled_amount, 0),
    outstanding_amount = coalesce(outstanding_amount, amount, 0),
    updated_at = coalesce(updated_at, now());

create table if not exists public.intercompany_settlements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  transaction_id uuid not null,
  settlement_date date not null,
  settlement_amount numeric not null,
  transaction_currency text not null,
  from_exchange_rate numeric not null,
  to_exchange_rate numeric not null,
  from_functional_amount numeric not null,
  to_functional_amount numeric not null,
  from_settlement_account_id uuid not null,
  to_settlement_account_id uuid not null,
  from_journal_entry_id uuid,
  to_journal_entry_id uuid,
  reference_number text,
  notes text,
  status text not null default 'POSTED',
  idempotency_key text not null,
  created_by text,
  created_at timestamptz not null default now()
);

alter table public.intercompany_reconciliations
  add column if not exists reconciliation_date date,
  add column if not exists from_journal_entry_id uuid,
  add column if not exists to_journal_entry_id uuid,
  add column if not exists from_functional_amount numeric,
  add column if not exists to_functional_amount numeric,
  add column if not exists notes text,
  add column if not exists idempotency_key text,
  add column if not exists created_by text,
  add column if not exists updated_at timestamptz default now();

create table if not exists public.intercompany_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  transaction_id uuid not null,
  settlement_id uuid,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now()
);

alter table public.intercompany_transactions
  drop constraint if exists intercompany_transaction_status_check,
  drop constraint if exists intercompany_reconciliation_status_check,
  drop constraint if exists intercompany_from_side_check,
  drop constraint if exists intercompany_to_side_check,
  drop constraint if exists intercompany_positive_amount_check,
  drop constraint if exists intercompany_distinct_entities_check;

alter table public.intercompany_transactions
  add constraint intercompany_transaction_status_check
    check (upper(status) in ('DRAFT', 'PENDING', 'POSTED', 'PARTIALLY_SETTLED', 'SETTLED', 'VOIDED')),
  add constraint intercompany_reconciliation_status_check
    check (upper(reconciliation_status) in ('UNRECONCILED', 'MATCHED', 'VARIANCE', 'REOPENED')),
  add constraint intercompany_from_side_check
    check (from_intercompany_side is null or upper(from_intercompany_side) in ('DEBIT', 'CREDIT')),
  add constraint intercompany_to_side_check
    check (to_intercompany_side is null or upper(to_intercompany_side) in ('DEBIT', 'CREDIT')),
  add constraint intercompany_positive_amount_check
    check (amount is null or amount > 0),
  add constraint intercompany_distinct_entities_check
    check (
      from_legal_entity_id is null
      or to_legal_entity_id is null
      or from_legal_entity_id <> to_legal_entity_id
    );

create unique index if not exists intercompany_transaction_idempotency_uq
  on public.intercompany_transactions (organization_id, idempotency_key)
  where idempotency_key is not null;

create unique index if not exists intercompany_transaction_reference_uq
  on public.intercompany_transactions (organization_id, lower(reference_number))
  where reference_number is not null;

create index if not exists intercompany_transaction_scope_idx
  on public.intercompany_transactions (
    organization_id,
    from_legal_entity_id,
    to_legal_entity_id,
    status,
    posting_date
  );

create unique index if not exists intercompany_reconciliation_transaction_uq
  on public.intercompany_reconciliations (organization_id, transaction_id);

create unique index if not exists intercompany_reconciliation_idempotency_uq
  on public.intercompany_reconciliations (organization_id, idempotency_key)
  where idempotency_key is not null;

create unique index if not exists intercompany_settlement_idempotency_uq
  on public.intercompany_settlements (organization_id, idempotency_key);

create index if not exists intercompany_settlement_transaction_idx
  on public.intercompany_settlements (organization_id, transaction_id, settlement_date);

create index if not exists intercompany_event_transaction_idx
  on public.intercompany_events (organization_id, transaction_id, created_at);

create or replace function public.finance_create_intercompany_atomic(
  p_transaction_id uuid,
  p_organization_id uuid,
  p_from_entity_id uuid,
  p_to_entity_id uuid,
  p_transaction_type text,
  p_reference_number text,
  p_transaction_date date,
  p_posting_date date,
  p_due_date date,
  p_description text,
  p_transaction_currency text,
  p_amount numeric,
  p_from_currency text,
  p_to_currency text,
  p_from_exchange_rate numeric,
  p_to_exchange_rate numeric,
  p_from_intercompany_account_id uuid,
  p_from_offset_account_id uuid,
  p_from_intercompany_side text,
  p_to_intercompany_account_id uuid,
  p_to_offset_account_id uuid,
  p_to_intercompany_side text,
  p_created_by text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.intercompany_transactions%rowtype;
  v_transaction public.intercompany_transactions%rowtype;
  v_from_journal jsonb;
  v_to_journal jsonb;
  v_from_amount numeric;
  v_to_amount numeric;
  v_from_lines jsonb;
  v_to_lines jsonb;
  v_number text;
begin
  if p_organization_id is null or p_from_entity_id is null or p_to_entity_id is null then
    raise exception 'organization_id and both legal entities are required';
  end if;
  if p_from_entity_id = p_to_entity_id then
    raise exception 'Intercompany legal entities must be different';
  end if;
  if p_transaction_id is null then raise exception 'transaction_id required'; end if;
  if nullif(btrim(p_idempotency_key), '') is null then raise exception 'idempotency_key required'; end if;
  if nullif(btrim(p_reference_number), '') is null then raise exception 'reference_number required'; end if;
  if p_transaction_date is null or p_posting_date is null then raise exception 'transaction_date and posting_date required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;
  if p_from_exchange_rate is null or p_from_exchange_rate <= 0 or p_to_exchange_rate is null or p_to_exchange_rate <= 0 then
    raise exception 'exchange rates must be positive';
  end if;
  if upper(p_from_intercompany_side) not in ('DEBIT', 'CREDIT') or upper(p_to_intercompany_side) not in ('DEBIT', 'CREDIT') then
    raise exception 'intercompany posting sides must be DEBIT or CREDIT';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' || btrim(p_idempotency_key), 0));

  select * into v_existing
  from public.intercompany_transactions
  where organization_id = p_organization_id
    and idempotency_key = btrim(p_idempotency_key)
  limit 1;

  if found then
    return jsonb_build_object('transaction', to_jsonb(v_existing), 'idempotentReplay', true);
  end if;

  perform 1 from public.legal_entities
  where organization_id = p_organization_id
    and id in (p_from_entity_id, p_to_entity_id)
    and coalesce(is_active, true) = true;
  if (select count(*) from public.legal_entities where organization_id = p_organization_id and id in (p_from_entity_id, p_to_entity_id) and coalesce(is_active, true) = true) <> 2 then
    raise exception 'Both legal entities must be active and in organisation scope';
  end if;

  perform 1 from public.chart_of_accounts
  where organization_id = p_organization_id and entity_id = p_from_entity_id
    and id in (p_from_intercompany_account_id, p_from_offset_account_id)
    and coalesce(is_active, true) = true;
  if (select count(*) from public.chart_of_accounts where organization_id = p_organization_id and entity_id = p_from_entity_id and id in (p_from_intercompany_account_id, p_from_offset_account_id) and coalesce(is_active, true) = true) <> 2 then
    raise exception 'Source posting accounts are outside entity scope or inactive';
  end if;

  if (select count(*) from public.chart_of_accounts where organization_id = p_organization_id and entity_id = p_to_entity_id and id in (p_to_intercompany_account_id, p_to_offset_account_id) and coalesce(is_active, true) = true) <> 2 then
    raise exception 'Destination posting accounts are outside entity scope or inactive';
  end if;

  v_from_amount := round(p_amount * p_from_exchange_rate, 2);
  v_to_amount := round(p_amount * p_to_exchange_rate, 2);
  if v_from_amount <= 0 or v_to_amount <= 0 then raise exception 'Functional amounts must be positive'; end if;

  v_number := 'IC-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' || substr(replace(p_transaction_id::text, '-', ''), 1, 6);

  insert into public.intercompany_transactions (
    id, organization_id, from_legal_entity_id, to_legal_entity_id,
    transaction_number, transaction_type, reference_number,
    transaction_date, posting_date, due_date, description,
    transaction_currency, currency, amount,
    from_entity_currency, to_entity_currency,
    from_exchange_rate, to_exchange_rate,
    from_functional_amount, to_functional_amount,
    from_intercompany_account_id, from_offset_account_id, from_intercompany_side,
    to_intercompany_account_id, to_offset_account_id, to_intercompany_side,
    status, reconciliation_status, outstanding_amount, settled_amount,
    idempotency_key, created_by, updated_by, created_at, updated_at
  ) values (
    p_transaction_id, p_organization_id, p_from_entity_id, p_to_entity_id,
    v_number, upper(btrim(p_transaction_type)), btrim(p_reference_number),
    p_transaction_date, p_posting_date, p_due_date, nullif(btrim(p_description), ''),
    upper(btrim(p_transaction_currency)), upper(btrim(p_transaction_currency)), p_amount,
    upper(btrim(p_from_currency)), upper(btrim(p_to_currency)),
    p_from_exchange_rate, p_to_exchange_rate,
    v_from_amount, v_to_amount,
    p_from_intercompany_account_id, p_from_offset_account_id, upper(p_from_intercompany_side),
    p_to_intercompany_account_id, p_to_offset_account_id, upper(p_to_intercompany_side),
    'PENDING', 'UNRECONCILED', p_amount, 0,
    btrim(p_idempotency_key), p_created_by, p_created_by, now(), now()
  ) returning * into v_transaction;

  v_from_lines := case when upper(p_from_intercompany_side) = 'DEBIT' then
    jsonb_build_array(
      jsonb_build_object('account_id', p_from_intercompany_account_id, 'description', p_description, 'debit', v_from_amount, 'credit', 0),
      jsonb_build_object('account_id', p_from_offset_account_id, 'description', p_description, 'debit', 0, 'credit', v_from_amount)
    )
  else
    jsonb_build_array(
      jsonb_build_object('account_id', p_from_intercompany_account_id, 'description', p_description, 'debit', 0, 'credit', v_from_amount),
      jsonb_build_object('account_id', p_from_offset_account_id, 'description', p_description, 'debit', v_from_amount, 'credit', 0)
    ) end;

  v_to_lines := case when upper(p_to_intercompany_side) = 'DEBIT' then
    jsonb_build_array(
      jsonb_build_object('account_id', p_to_intercompany_account_id, 'description', p_description, 'debit', v_to_amount, 'credit', 0),
      jsonb_build_object('account_id', p_to_offset_account_id, 'description', p_description, 'debit', 0, 'credit', v_to_amount)
    )
  else
    jsonb_build_array(
      jsonb_build_object('account_id', p_to_intercompany_account_id, 'description', p_description, 'debit', 0, 'credit', v_to_amount),
      jsonb_build_object('account_id', p_to_offset_account_id, 'description', p_description, 'debit', v_to_amount, 'credit', 0)
    ) end;

  select public.finance_post_journal_atomic(
    p_organization_id => p_organization_id, p_entity_id => p_from_entity_id,
    p_posting_date => p_posting_date, p_document_date => p_transaction_date,
    p_journal_type => 'INTERCOMPANY', p_reference => p_reference_number,
    p_source_module => 'intercompany', p_source_document => 'INTERCOMPANY_TRANSACTION',
    p_source_document_id => p_transaction_id, p_description => p_description,
    p_currency_code => upper(p_from_currency), p_exchange_rate => 1,
    p_lines => v_from_lines, p_created_by => p_created_by,
    p_idempotency_key => btrim(p_idempotency_key) || ':FROM'
  ) into v_from_journal;

  select public.finance_post_journal_atomic(
    p_organization_id => p_organization_id, p_entity_id => p_to_entity_id,
    p_posting_date => p_posting_date, p_document_date => p_transaction_date,
    p_journal_type => 'INTERCOMPANY', p_reference => p_reference_number,
    p_source_module => 'intercompany', p_source_document => 'INTERCOMPANY_TRANSACTION',
    p_source_document_id => p_transaction_id, p_description => p_description,
    p_currency_code => upper(p_to_currency), p_exchange_rate => 1,
    p_lines => v_to_lines, p_created_by => p_created_by,
    p_idempotency_key => btrim(p_idempotency_key) || ':TO'
  ) into v_to_journal;

  update public.intercompany_transactions
  set from_journal_entry_id = nullif(v_from_journal->'journal'->>'id', '')::uuid,
      to_journal_entry_id = nullif(v_to_journal->'journal'->>'id', '')::uuid,
      status = 'POSTED', updated_at = now()
  where id = p_transaction_id
  returning * into v_transaction;

  insert into public.intercompany_events (
    organization_id, transaction_id, event_type, event_data, created_by
  ) values (
    p_organization_id, p_transaction_id, 'INTERCOMPANY_POSTED',
    jsonb_build_object('from_journal', v_from_journal, 'to_journal', v_to_journal),
    p_created_by
  );

  return jsonb_build_object(
    'transaction', to_jsonb(v_transaction),
    'fromJournal', v_from_journal,
    'toJournal', v_to_journal,
    'idempotentReplay', false
  );
end;
$$;

create or replace function public.finance_reconcile_intercompany_atomic(
  p_organization_id uuid,
  p_transaction_id uuid,
  p_reconciliation_date date,
  p_notes text,
  p_created_by text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_transaction public.intercompany_transactions%rowtype;
  v_reconciliation public.intercompany_reconciliations%rowtype;
  v_variance numeric;
begin
  if p_organization_id is null or p_transaction_id is null then raise exception 'organization_id and transaction_id required'; end if;
  if nullif(btrim(p_idempotency_key), '') is null then raise exception 'idempotency_key required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' || p_transaction_id::text || ':RECONCILE', 0));

  select * into v_transaction from public.intercompany_transactions
  where organization_id = p_organization_id and id = p_transaction_id
  for update;
  if not found then raise exception 'Intercompany transaction not found'; end if;
  if v_transaction.from_journal_entry_id is null or v_transaction.to_journal_entry_id is null or upper(v_transaction.status) not in ('POSTED', 'PARTIALLY_SETTLED', 'SETTLED') then
    raise exception 'Both entity journals must be posted before reconciliation';
  end if;

  v_variance := round(coalesce(v_transaction.from_functional_amount, 0) / nullif(v_transaction.from_exchange_rate, 0), 2)
              - round(coalesce(v_transaction.to_functional_amount, 0) / nullif(v_transaction.to_exchange_rate, 0), 2);

  insert into public.intercompany_reconciliations (
    organization_id, entity_id, transaction_id, reconciliation_date,
    source_balance, target_balance, variance_amount, reconciliation_status,
    from_journal_entry_id, to_journal_entry_id,
    from_functional_amount, to_functional_amount,
    notes, idempotency_key, created_by, created_at, updated_at
  ) values (
    p_organization_id, v_transaction.from_legal_entity_id, p_transaction_id,
    coalesce(p_reconciliation_date, current_date),
    v_transaction.amount, v_transaction.amount, v_variance,
    case when abs(v_variance) <= 0.01 then 'MATCHED' else 'VARIANCE' end,
    v_transaction.from_journal_entry_id, v_transaction.to_journal_entry_id,
    v_transaction.from_functional_amount, v_transaction.to_functional_amount,
    nullif(btrim(p_notes), ''), btrim(p_idempotency_key), p_created_by, now(), now()
  )
  on conflict (organization_id, transaction_id)
  do update set
    reconciliation_date = excluded.reconciliation_date,
    source_balance = excluded.source_balance,
    target_balance = excluded.target_balance,
    variance_amount = excluded.variance_amount,
    reconciliation_status = excluded.reconciliation_status,
    notes = excluded.notes,
    idempotency_key = excluded.idempotency_key,
    created_by = excluded.created_by,
    updated_at = now()
  returning * into v_reconciliation;

  update public.intercompany_transactions
  set reconciliation_status = upper(v_reconciliation.reconciliation_status),
      updated_by = p_created_by,
      updated_at = now()
  where id = p_transaction_id
  returning * into v_transaction;

  insert into public.intercompany_events (
    organization_id, transaction_id, event_type, event_data, created_by
  ) values (
    p_organization_id, p_transaction_id, 'INTERCOMPANY_RECONCILED',
    to_jsonb(v_reconciliation), p_created_by
  );

  return jsonb_build_object(
    'transaction', to_jsonb(v_transaction),
    'reconciliation', to_jsonb(v_reconciliation)
  );
end;
$$;

create or replace function public.finance_settle_intercompany_atomic(
  p_settlement_id uuid,
  p_organization_id uuid,
  p_transaction_id uuid,
  p_settlement_date date,
  p_settlement_amount numeric,
  p_from_settlement_account_id uuid,
  p_to_settlement_account_id uuid,
  p_from_exchange_rate numeric,
  p_to_exchange_rate numeric,
  p_reference_number text,
  p_notes text,
  p_created_by text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_transaction public.intercompany_transactions%rowtype;
  v_settlement public.intercompany_settlements%rowtype;
  v_existing public.intercompany_settlements%rowtype;
  v_from_amount numeric;
  v_to_amount numeric;
  v_new_settled numeric;
  v_new_outstanding numeric;
  v_from_lines jsonb;
  v_to_lines jsonb;
  v_from_journal jsonb;
  v_to_journal jsonb;
begin
  if p_settlement_id is null or p_organization_id is null or p_transaction_id is null then raise exception 'settlement_id, organization_id and transaction_id required'; end if;
  if p_settlement_date is null then raise exception 'settlement_date required'; end if;
  if p_settlement_amount is null or p_settlement_amount <= 0 then raise exception 'settlement_amount must be positive'; end if;
  if p_from_exchange_rate is null or p_from_exchange_rate <= 0 or p_to_exchange_rate is null or p_to_exchange_rate <= 0 then raise exception 'settlement exchange rates must be positive'; end if;
  if nullif(btrim(p_idempotency_key), '') is null then raise exception 'idempotency_key required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' || p_transaction_id::text || ':SETTLE', 0));

  select * into v_existing from public.intercompany_settlements
  where organization_id = p_organization_id and idempotency_key = btrim(p_idempotency_key)
  limit 1;
  if found then return jsonb_build_object('settlement', to_jsonb(v_existing), 'idempotentReplay', true); end if;

  select * into v_transaction from public.intercompany_transactions
  where organization_id = p_organization_id and id = p_transaction_id
  for update;
  if not found then raise exception 'Intercompany transaction not found'; end if;
  if upper(v_transaction.reconciliation_status) <> 'MATCHED' then raise exception 'Intercompany transaction must be matched before settlement'; end if;
  if upper(v_transaction.status) in ('SETTLED', 'VOIDED') then raise exception 'Intercompany transaction is already closed'; end if;
  if p_settlement_amount > coalesce(v_transaction.outstanding_amount, v_transaction.amount) + 0.000001 then raise exception 'Settlement exceeds outstanding amount'; end if;

  if (select count(*) from public.chart_of_accounts where organization_id = p_organization_id and entity_id = v_transaction.from_legal_entity_id and id = p_from_settlement_account_id and coalesce(is_active, true) = true) <> 1 then
    raise exception 'Source settlement account is outside entity scope or inactive';
  end if;
  if (select count(*) from public.chart_of_accounts where organization_id = p_organization_id and entity_id = v_transaction.to_legal_entity_id and id = p_to_settlement_account_id and coalesce(is_active, true) = true) <> 1 then
    raise exception 'Destination settlement account is outside entity scope or inactive';
  end if;

  v_from_amount := round(p_settlement_amount * p_from_exchange_rate, 2);
  v_to_amount := round(p_settlement_amount * p_to_exchange_rate, 2);

  v_from_lines := case when upper(v_transaction.from_intercompany_side) = 'DEBIT' then
    jsonb_build_array(
      jsonb_build_object('account_id', v_transaction.from_intercompany_account_id, 'description', p_notes, 'debit', 0, 'credit', v_from_amount),
      jsonb_build_object('account_id', p_from_settlement_account_id, 'description', p_notes, 'debit', v_from_amount, 'credit', 0)
    )
  else
    jsonb_build_array(
      jsonb_build_object('account_id', v_transaction.from_intercompany_account_id, 'description', p_notes, 'debit', v_from_amount, 'credit', 0),
      jsonb_build_object('account_id', p_from_settlement_account_id, 'description', p_notes, 'debit', 0, 'credit', v_from_amount)
    ) end;

  v_to_lines := case when upper(v_transaction.to_intercompany_side) = 'DEBIT' then
    jsonb_build_array(
      jsonb_build_object('account_id', v_transaction.to_intercompany_account_id, 'description', p_notes, 'debit', 0, 'credit', v_to_amount),
      jsonb_build_object('account_id', p_to_settlement_account_id, 'description', p_notes, 'debit', v_to_amount, 'credit', 0)
    )
  else
    jsonb_build_array(
      jsonb_build_object('account_id', v_transaction.to_intercompany_account_id, 'description', p_notes, 'debit', v_to_amount, 'credit', 0),
      jsonb_build_object('account_id', p_to_settlement_account_id, 'description', p_notes, 'debit', 0, 'credit', v_to_amount)
    ) end;

  select public.finance_post_journal_atomic(
    p_organization_id => p_organization_id, p_entity_id => v_transaction.from_legal_entity_id,
    p_posting_date => p_settlement_date, p_document_date => p_settlement_date,
    p_journal_type => 'INTERCOMPANY', p_reference => coalesce(p_reference_number, v_transaction.reference_number),
    p_source_module => 'intercompany', p_source_document => 'INTERCOMPANY_SETTLEMENT',
    p_source_document_id => p_settlement_id, p_description => coalesce(p_notes, 'Intercompany settlement'),
    p_currency_code => v_transaction.from_entity_currency, p_exchange_rate => 1,
    p_lines => v_from_lines, p_created_by => p_created_by,
    p_idempotency_key => btrim(p_idempotency_key) || ':FROM'
  ) into v_from_journal;

  select public.finance_post_journal_atomic(
    p_organization_id => p_organization_id, p_entity_id => v_transaction.to_legal_entity_id,
    p_posting_date => p_settlement_date, p_document_date => p_settlement_date,
    p_journal_type => 'INTERCOMPANY', p_reference => coalesce(p_reference_number, v_transaction.reference_number),
    p_source_module => 'intercompany', p_source_document => 'INTERCOMPANY_SETTLEMENT',
    p_source_document_id => p_settlement_id, p_description => coalesce(p_notes, 'Intercompany settlement'),
    p_currency_code => v_transaction.to_entity_currency, p_exchange_rate => 1,
    p_lines => v_to_lines, p_created_by => p_created_by,
    p_idempotency_key => btrim(p_idempotency_key) || ':TO'
  ) into v_to_journal;

  insert into public.intercompany_settlements (
    id, organization_id, transaction_id, settlement_date, settlement_amount,
    transaction_currency, from_exchange_rate, to_exchange_rate,
    from_functional_amount, to_functional_amount,
    from_settlement_account_id, to_settlement_account_id,
    from_journal_entry_id, to_journal_entry_id,
    reference_number, notes, status, idempotency_key, created_by
  ) values (
    p_settlement_id, p_organization_id, p_transaction_id, p_settlement_date, p_settlement_amount,
    v_transaction.transaction_currency, p_from_exchange_rate, p_to_exchange_rate,
    v_from_amount, v_to_amount,
    p_from_settlement_account_id, p_to_settlement_account_id,
    nullif(v_from_journal->'journal'->>'id', '')::uuid,
    nullif(v_to_journal->'journal'->>'id', '')::uuid,
    nullif(btrim(p_reference_number), ''), nullif(btrim(p_notes), ''),
    'POSTED', btrim(p_idempotency_key), p_created_by
  ) returning * into v_settlement;

  v_new_settled := coalesce(v_transaction.settled_amount, 0) + p_settlement_amount;
  v_new_outstanding := greatest(coalesce(v_transaction.amount, 0) - v_new_settled, 0);

  update public.intercompany_transactions
  set settled_amount = v_new_settled,
      outstanding_amount = v_new_outstanding,
      status = case when v_new_outstanding <= 0.000001 then 'SETTLED' else 'PARTIALLY_SETTLED' end,
      updated_by = p_created_by,
      updated_at = now()
  where id = p_transaction_id
  returning * into v_transaction;

  insert into public.intercompany_events (
    organization_id, transaction_id, settlement_id, event_type, event_data, created_by
  ) values (
    p_organization_id, p_transaction_id, p_settlement_id, 'INTERCOMPANY_SETTLED',
    jsonb_build_object('settlement', to_jsonb(v_settlement), 'transaction', to_jsonb(v_transaction)),
    p_created_by
  );

  return jsonb_build_object(
    'transaction', to_jsonb(v_transaction),
    'settlement', to_jsonb(v_settlement),
    'fromJournal', v_from_journal,
    'toJournal', v_to_journal,
    'idempotentReplay', false
  );
end;
$$;

revoke all on function public.finance_create_intercompany_atomic(uuid, uuid, uuid, uuid, text, text, date, date, date, text, text, numeric, text, text, numeric, numeric, uuid, uuid, text, uuid, uuid, text, text, text) from public;
grant execute on function public.finance_create_intercompany_atomic(uuid, uuid, uuid, uuid, text, text, date, date, date, text, text, numeric, text, text, numeric, numeric, uuid, uuid, text, uuid, uuid, text, text, text) to service_role;

revoke all on function public.finance_reconcile_intercompany_atomic(uuid, uuid, date, text, text, text) from public;
grant execute on function public.finance_reconcile_intercompany_atomic(uuid, uuid, date, text, text, text) to service_role;

revoke all on function public.finance_settle_intercompany_atomic(uuid, uuid, uuid, date, numeric, uuid, uuid, numeric, numeric, text, text, text, text) from public;
grant execute on function public.finance_settle_intercompany_atomic(uuid, uuid, uuid, date, numeric, uuid, uuid, numeric, numeric, text, text, text, text) to service_role;

comment on table public.intercompany_transactions is
  'Governed intercompany source document linked to one immutable posted journal per participating Legal Entity.';
comment on table public.intercompany_settlements is
  'Partial and full intercompany settlements linked to balanced settlement journals in both Legal Entities.';
comment on table public.intercompany_events is
  'Immutable intercompany lifecycle evidence.';

notify pgrst, 'reload schema';
commit;
