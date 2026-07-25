begin;

alter table if exists public.customer_payments
  alter column customer_invoice_id drop not null;

alter table if exists public.customer_payments
  add column if not exists bank_account_id uuid,
  add column if not exists currency_code text,
  add column if not exists exchange_rate numeric,
  add column if not exists allocated_amount numeric not null default 0,
  add column if not exists unapplied_amount numeric not null default 0,
  add column if not exists journal_entry_id uuid,
  add column if not exists status text not null default 'POSTED',
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.finance_customer_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  customer_payment_id uuid not null,
  customer_id uuid not null,
  accounts_receivable_id uuid not null,
  customer_invoice_id uuid not null,
  allocated_amount numeric not null,
  balance_before numeric not null,
  balance_after numeric not null,
  currency_code text not null,
  exchange_rate numeric not null,
  allocated_by uuid not null,
  allocated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (customer_payment_id, customer_invoice_id),
  check (allocated_amount > 0),
  check (balance_before >= 0),
  check (balance_after >= 0),
  check (exchange_rate > 0)
);

create index if not exists finance_customer_payment_allocations_scope_idx
on public.finance_customer_payment_allocations (
  organization_id,
  entity_id,
  customer_id,
  customer_invoice_id,
  allocated_at desc
);

create table if not exists public.finance_customer_unapplied_cash (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  customer_id uuid not null,
  customer_payment_id uuid not null unique,
  original_amount numeric not null,
  available_amount numeric not null,
  currency_code text not null,
  exchange_rate numeric not null,
  status text not null default 'OPEN',
  received_by uuid not null,
  received_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (original_amount > 0),
  check (available_amount >= 0),
  check (available_amount <= original_amount),
  check (exchange_rate > 0),
  check (upper(status) in ('OPEN', 'PARTIALLY_APPLIED', 'APPLIED', 'REFUNDED'))
);

create index if not exists finance_customer_unapplied_cash_scope_idx
on public.finance_customer_unapplied_cash (
  organization_id,
  entity_id,
  customer_id,
  status,
  received_at desc
);

create or replace function public.finance_post_customer_receipt_allocation_idempotent(
  p_payment_id uuid,
  p_organization_id uuid,
  p_entity_id uuid,
  p_customer_id uuid,
  p_payment_date date,
  p_payment_amount numeric,
  p_bank_account_id uuid,
  p_payment_method text,
  p_reference_number text,
  p_paid_by uuid,
  p_currency_code text,
  p_exchange_rate numeric,
  p_allocations jsonb,
  p_journal_lines jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing jsonb;
  v_result jsonb;
  v_request_hash text;
  v_payment public.customer_payments%rowtype;
  v_receivable public.accounts_receivable%rowtype;
  v_invoice public.customer_invoices%rowtype;
  v_bank_account record;
  v_allocation jsonb;
  v_invoice_id uuid;
  v_primary_invoice_id uuid;
  v_allocation_amount numeric;
  v_balance_before numeric;
  v_balance_after numeric;
  v_invoice_status text;
  v_allocated_amount numeric := 0;
  v_unapplied_amount numeric := 0;
  v_journal jsonb;
  v_journal_entry_id uuid;
  v_bank_ledger_id uuid;
  v_now timestamptz := now();
begin
  if p_payment_id is null then
    raise exception 'payment_id required';
  end if;

  if p_organization_id is null or p_entity_id is null then
    raise exception 'organization_id and entity_id required';
  end if;

  if p_customer_id is null then
    raise exception 'customer_id required';
  end if;

  if p_payment_date is null then
    raise exception 'payment_date required';
  end if;

  if p_payment_amount is null or p_payment_amount <= 0 then
    raise exception 'payment_amount must be greater than zero';
  end if;

  if p_bank_account_id is null then
    raise exception 'bank_account_id required';
  end if;

  if nullif(btrim(p_payment_method), '') is null then
    raise exception 'payment_method required';
  end if;

  if p_paid_by is null then
    raise exception 'authenticated paid_by required';
  end if;

  if nullif(btrim(p_currency_code), '') is null then
    raise exception 'currency_code required';
  end if;

  if p_exchange_rate is null or p_exchange_rate <= 0 then
    raise exception 'exchange_rate must be positive';
  end if;

  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array' then
    raise exception 'allocations must be an array';
  end if;

  if p_journal_lines is null
     or jsonb_typeof(p_journal_lines) <> 'array'
     or jsonb_array_length(p_journal_lines) < 2 then
    raise exception 'balanced journal lines required';
  end if;

  if nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'idempotency_key required';
  end if;

  if exists (
    select 1
    from (
      select
        nullif(value->>'customer_invoice_id', '')::uuid as customer_invoice_id,
        count(*) as allocation_count
      from jsonb_array_elements(p_allocations)
      group by nullif(value->>'customer_invoice_id', '')::uuid
    ) duplicates
    where duplicates.customer_invoice_id is null
       or duplicates.allocation_count > 1
  ) then
    raise exception 'Each allocation requires one unique customer_invoice_id';
  end if;

  select coalesce(sum(nullif(value->>'amount', '')::numeric), 0)
  into v_allocated_amount
  from jsonb_array_elements(p_allocations);

  if v_allocated_amount < 0 then
    raise exception 'allocated amount cannot be negative';
  end if;

  if v_allocated_amount > p_payment_amount then
    raise exception 'allocated amount exceeds payment amount';
  end if;

  v_unapplied_amount := p_payment_amount - v_allocated_amount;

  select nullif(value->>'customer_invoice_id', '')::uuid
  into v_primary_invoice_id
  from jsonb_array_elements(p_allocations)
  limit 1;

  v_request_hash := md5(concat_ws(
    '|',
    p_customer_id::text,
    p_payment_date::text,
    p_payment_amount::text,
    p_bank_account_id::text,
    upper(btrim(p_payment_method)),
    coalesce(btrim(p_reference_number), ''),
    upper(btrim(p_currency_code)),
    p_exchange_rate::text,
    p_allocations::text,
    p_journal_lines::text
  ));

  v_existing := public.finance_claim_idempotency(
    p_organization_id,
    p_entity_id,
    'CUSTOMER_RECEIPT_ALLOCATION',
    btrim(p_idempotency_key),
    v_request_hash,
    p_payment_id
  );

  if v_existing is not null then
    return v_existing;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':' ||
      p_entity_id::text || ':customer-receipt:' ||
      p_customer_id::text,
      0
    )
  );

  perform 1
  from public.legal_entities
  where id = p_entity_id
    and organization_id = p_organization_id;

  if not found then
    raise exception 'Entity is outside organization scope';
  end if;

  select id, currency
  into v_bank_account
  from public.bank_accounts
  where id = p_bank_account_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id;

  if not found then
    raise exception 'Bank account not found in organization and entity scope';
  end if;

  if nullif(btrim(v_bank_account.currency), '') is not null
     and upper(btrim(v_bank_account.currency)) <> upper(btrim(p_currency_code)) then
    raise exception 'Bank account currency does not match payment currency';
  end if;

  insert into public.customer_payments (
    id,
    organization_id,
    entity_id,
    customer_id,
    customer_invoice_id,
    bank_account_id,
    payment_date,
    amount,
    allocated_amount,
    unapplied_amount,
    payment_method,
    reference_number,
    currency_code,
    exchange_rate,
    paid_by,
    status,
    created_at,
    updated_at
  ) values (
    p_payment_id,
    p_organization_id,
    p_entity_id,
    p_customer_id,
    v_primary_invoice_id,
    p_bank_account_id,
    p_payment_date,
    p_payment_amount,
    v_allocated_amount,
    v_unapplied_amount,
    upper(btrim(p_payment_method)),
    nullif(btrim(p_reference_number), ''),
    upper(btrim(p_currency_code)),
    p_exchange_rate,
    p_paid_by,
    case when v_unapplied_amount > 0 then 'PARTIALLY_APPLIED' else 'APPLIED' end,
    now(),
    now()
  )
  returning * into v_payment;

  for v_allocation in
    select value
    from jsonb_array_elements(p_allocations)
    order by value->>'customer_invoice_id'
  loop
    v_invoice_id := nullif(v_allocation->>'customer_invoice_id', '')::uuid;
    v_allocation_amount := nullif(v_allocation->>'amount', '')::numeric;

    if v_allocation_amount is null or v_allocation_amount <= 0 then
      raise exception 'Every customer receipt allocation amount must be greater than zero';
    end if;

    select *
    into v_receivable
    from public.accounts_receivable
    where organization_id = p_organization_id
      and entity_id = p_entity_id
      and customer_invoice_id = v_invoice_id
    for update;

    if not found then
      raise exception 'Accounts receivable entry not found for allocated invoice %', v_invoice_id;
    end if;

    if v_receivable.customer_id is distinct from p_customer_id then
      raise exception 'Allocated invoice belongs to another customer';
    end if;

    select *
    into v_invoice
    from public.customer_invoices
    where id = v_invoice_id
      and organization_id = p_organization_id
      and entity_id = p_entity_id
      and customer_id = p_customer_id
    for update;

    if not found then
      raise exception 'Customer invoice not found in payment scope';
    end if;

    if nullif(btrim(v_invoice.currency_code), '') is not null
       and upper(btrim(v_invoice.currency_code)) <> upper(btrim(p_currency_code)) then
      raise exception 'Allocated invoice currency does not match payment currency';
    end if;

    v_balance_before := coalesce(v_receivable.outstanding_balance, v_receivable.amount, 0);

    if v_balance_before <= 0 then
      raise exception 'Allocated invoice has no outstanding balance';
    end if;

    if v_allocation_amount > v_balance_before then
      raise exception 'Allocation exceeds outstanding balance for invoice %', v_invoice_id;
    end if;

    v_balance_after := v_balance_before - v_allocation_amount;
    v_invoice_status := case
      when abs(v_balance_after) <= 0.005 then 'PAID'
      else 'PARTIAL'
    end;

    if v_invoice_status = 'PAID' then
      v_balance_after := 0;
    end if;

    insert into public.finance_customer_payment_allocations (
      organization_id,
      entity_id,
      customer_payment_id,
      customer_id,
      accounts_receivable_id,
      customer_invoice_id,
      allocated_amount,
      balance_before,
      balance_after,
      currency_code,
      exchange_rate,
      allocated_by,
      allocated_at,
      metadata
    ) values (
      p_organization_id,
      p_entity_id,
      p_payment_id,
      p_customer_id,
      v_receivable.id,
      v_invoice_id,
      v_allocation_amount,
      v_balance_before,
      v_balance_after,
      upper(btrim(p_currency_code)),
      p_exchange_rate,
      p_paid_by,
      v_now,
      jsonb_build_object(
        'reference_number', nullif(btrim(p_reference_number), ''),
        'bank_account_id', p_bank_account_id,
        'payment_method', upper(btrim(p_payment_method))
      )
    );

    update public.accounts_receivable
    set outstanding_balance = v_balance_after,
        status = v_invoice_status,
        updated_at = now()
    where id = v_receivable.id
      and organization_id = p_organization_id
      and entity_id = p_entity_id;

    update public.customer_invoices
    set outstanding_balance = v_balance_after,
        status = v_invoice_status,
        updated_at = now()
    where id = v_invoice_id
      and organization_id = p_organization_id
      and entity_id = p_entity_id
      and customer_id = p_customer_id;

    if not found then
      raise exception 'Customer invoice balance update failed';
    end if;
  end loop;

  if v_unapplied_amount > 0 then
    insert into public.finance_customer_unapplied_cash (
      organization_id,
      entity_id,
      customer_id,
      customer_payment_id,
      original_amount,
      available_amount,
      currency_code,
      exchange_rate,
      status,
      received_by,
      received_at,
      metadata
    ) values (
      p_organization_id,
      p_entity_id,
      p_customer_id,
      p_payment_id,
      v_unapplied_amount,
      v_unapplied_amount,
      upper(btrim(p_currency_code)),
      p_exchange_rate,
      'OPEN',
      p_paid_by,
      v_now,
      jsonb_build_object(
        'reference_number', nullif(btrim(p_reference_number), ''),
        'bank_account_id', p_bank_account_id,
        'payment_method', upper(btrim(p_payment_method))
      )
    );
  end if;

  insert into public.bank_ledger (
    organization_id,
    entity_id,
    bank_account_id,
    transaction_type,
    reference_id,
    source_document,
    source_document_id,
    reference_number,
    amount,
    currency_code,
    exchange_rate,
    direction,
    created_at,
    updated_at
  ) values (
    p_organization_id,
    p_entity_id,
    p_bank_account_id,
    'CUSTOMER_RECEIPT',
    p_payment_id,
    'customer_payment',
    p_payment_id,
    nullif(btrim(p_reference_number), ''),
    p_payment_amount,
    upper(btrim(p_currency_code)),
    p_exchange_rate,
    'INFLOW',
    v_now,
    now()
  )
  returning id into v_bank_ledger_id;

  select public.finance_post_journal_atomic(
    p_organization_id => p_organization_id,
    p_entity_id => p_entity_id,
    p_posting_date => p_payment_date,
    p_document_date => p_payment_date,
    p_journal_type => 'SYSTEM',
    p_reference => 'accounts_receivable:' || p_payment_id::text,
    p_source_module => 'accounts_receivable',
    p_source_document => 'CUSTOMER_RECEIPT_POSTED',
    p_source_document_id => p_payment_id,
    p_description => 'Customer Receipt ' || coalesce(nullif(btrim(p_reference_number), ''), p_payment_id::text),
    p_currency_code => upper(btrim(p_currency_code)),
    p_exchange_rate => p_exchange_rate,
    p_lines => p_journal_lines,
    p_created_by => p_paid_by,
    p_idempotency_key => 'accounting-event:CUSTOMER_RECEIPT_POSTED:accounts_receivable:' || p_payment_id::text
  ) into v_journal;

  v_journal_entry_id := nullif(v_journal->'journal'->>'id', '')::uuid;

  if v_journal_entry_id is null then
    raise exception 'Customer receipt posting did not return a journal entry';
  end if;

  update public.customer_payments
  set journal_entry_id = v_journal_entry_id,
      updated_at = now()
  where id = p_payment_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id;

  update public.bank_ledger
  set journal_entry_id = v_journal_entry_id,
      updated_at = now()
  where id = v_bank_ledger_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id;

  select *
  into v_payment
  from public.customer_payments
  where id = p_payment_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id;

  v_result := jsonb_build_object(
    'success', true,
    'payment', to_jsonb(v_payment),
    'customer_id', p_customer_id,
    'payment_amount', p_payment_amount,
    'allocated_amount', v_allocated_amount,
    'unapplied_amount', v_unapplied_amount,
    'allocation_count', jsonb_array_length(p_allocations),
    'bank_account_id', p_bank_account_id,
    'bank_ledger_id', v_bank_ledger_id,
    'journal', v_journal,
    'journal_entry_id', v_journal_entry_id
  );

  perform public.finance_complete_idempotency(
    p_organization_id,
    p_entity_id,
    'CUSTOMER_RECEIPT_ALLOCATION',
    btrim(p_idempotency_key),
    v_result
  );

  return v_result;
end;
$$;

revoke all on function public.finance_post_customer_receipt_allocation_idempotent(
  uuid, uuid, uuid, uuid, date, numeric, uuid, text, text, uuid,
  text, numeric, jsonb, jsonb, text
) from public;

grant execute on function public.finance_post_customer_receipt_allocation_idempotent(
  uuid, uuid, uuid, uuid, date, numeric, uuid, text, text, uuid,
  text, numeric, jsonb, jsonb, text
) to service_role;

comment on table public.finance_customer_payment_allocations is
  'Atomic Accounts Receivable allocation evidence for customer receipts across one or more invoices.';

comment on table public.finance_customer_unapplied_cash is
  'Customer receipt balances retained for future allocation, refund, or credit processing.';

notify pgrst, 'reload schema';

commit;
