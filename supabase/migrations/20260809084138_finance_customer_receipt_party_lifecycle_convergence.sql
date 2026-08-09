begin;

alter table public.finance_customer_payment_allocations
  add column if not exists party_id uuid,
  add column if not exists reversed_at timestamptz,
  add column if not exists reversed_by uuid,
  add column if not exists updated_at timestamptz not null default now();

update public.finance_customer_payment_allocations
set party_id = customer_id
where party_id is null;

alter table public.finance_customer_payment_allocations
  alter column party_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'finance_customer_payment_allocations_org_party_fkey'
      and conrelid = 'public.finance_customer_payment_allocations'::regclass
  ) then
    alter table public.finance_customer_payment_allocations
      add constraint finance_customer_payment_allocations_org_party_fkey
      foreign key (organization_id, party_id)
      references public.parties (organization_id, id)
      on delete restrict;
  end if;
end
$$;

create index if not exists finance_customer_payment_allocations_party_scope_idx
on public.finance_customer_payment_allocations (
  organization_id,
  entity_id,
  party_id,
  customer_invoice_id,
  allocated_at desc
);

alter table public.finance_customer_unapplied_cash
  add column if not exists party_id uuid,
  add column if not exists refunded_at timestamptz,
  add column if not exists refunded_by uuid;

update public.finance_customer_unapplied_cash
set party_id = customer_id
where party_id is null;

alter table public.finance_customer_unapplied_cash
  alter column party_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'finance_customer_unapplied_cash_org_party_fkey'
      and conrelid = 'public.finance_customer_unapplied_cash'::regclass
  ) then
    alter table public.finance_customer_unapplied_cash
      add constraint finance_customer_unapplied_cash_org_party_fkey
      foreign key (organization_id, party_id)
      references public.parties (organization_id, id)
      on delete restrict;
  end if;
end
$$;

create index if not exists finance_customer_unapplied_cash_party_scope_idx
on public.finance_customer_unapplied_cash (
  organization_id,
  entity_id,
  party_id,
  status,
  received_at desc
);

alter table public.customer_payments
  add column if not exists reversal_journal_entry_id uuid,
  add column if not exists reversal_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'customer_payments_reversal_journal_entry_id_fkey'
      and conrelid = 'public.customer_payments'::regclass
  ) then
    alter table public.customer_payments
      add constraint customer_payments_reversal_journal_entry_id_fkey
      foreign key (reversal_journal_entry_id)
      references public.journal_entries (id)
      on delete restrict;
  end if;
end
$$;

create or replace function public.commercial_reconcile_sales_order_payment_from_invoice(
  p_organization_id uuid,
  p_entity_id uuid,
  p_customer_invoice_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.customer_invoices%rowtype;
  v_order public.sales_orders%rowtype;
  v_paid numeric := 0;
  v_remaining numeric := 0;
  v_status text := 'UNPAID';
begin
  select * into v_invoice
  from public.customer_invoices
  where id = p_customer_invoice_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id;

  if not found then
    raise exception 'Customer invoice not found for reconciliation';
  end if;

  if upper(coalesce(v_invoice.source_document_type, '')) <> 'SALES_ORDER'
     or v_invoice.source_document_id is null then
    return jsonb_build_object(
      'reconciled', false,
      'reason', 'invoice_not_sourced_from_sales_order',
      'customer_invoice_id', p_customer_invoice_id
    );
  end if;

  select * into v_order
  from public.sales_orders
  where id = v_invoice.source_document_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
  for update;

  if not found then
    raise exception 'Source Sales Order not found in invoice scope';
  end if;

  if v_order.party_id is not null
     and v_invoice.party_id is distinct from v_order.party_id then
    raise exception 'Sales Order and invoice party mismatch';
  end if;

  v_paid := greatest(
    0,
    least(
      coalesce(v_order.total_amount, 0),
      coalesce(v_invoice.total_amount, 0) -
      coalesce(v_invoice.outstanding_balance, v_invoice.total_amount, 0)
    )
  );

  v_remaining := greatest(coalesce(v_order.total_amount, 0) - v_paid, 0);

  v_status := case
    when abs(v_remaining) <= 0.005 then 'PAID'
    when v_paid > 0 then 'PARTIALLY_PAID'
    else 'UNPAID'
  end;

  update public.sales_orders
  set paid_amount = round(v_paid, 2),
      remaining_balance = round(v_remaining, 2),
      payment_status = v_status,
      updated_at = now()
  where id = v_order.id
    and organization_id = p_organization_id
    and entity_id = p_entity_id;

  return jsonb_build_object(
    'reconciled', true,
    'sales_order_id', v_order.id,
    'customer_invoice_id', p_customer_invoice_id,
    'paid_amount', round(v_paid, 2),
    'remaining_balance', round(v_remaining, 2),
    'payment_status', v_status
  );
end;
$$;

revoke all on function public.commercial_reconcile_sales_order_payment_from_invoice(uuid, uuid, uuid) from public;
revoke all on function public.commercial_reconcile_sales_order_payment_from_invoice(uuid, uuid, uuid) from anon;
revoke all on function public.commercial_reconcile_sales_order_payment_from_invoice(uuid, uuid, uuid) from authenticated;
grant execute on function public.commercial_reconcile_sales_order_payment_from_invoice(uuid, uuid, uuid) to service_role;

create or replace function public.finance_post_customer_receipt_party_idempotent(
  p_payment_id uuid,
  p_organization_id uuid,
  p_entity_id uuid,
  p_party_id uuid,
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
set search_path = ''
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
  v_reconciliations jsonb := '[]'::jsonb;
begin
  if p_payment_id is null then raise exception 'payment_id required'; end if;
  if p_organization_id is null or p_entity_id is null then raise exception 'organization_id and entity_id required'; end if;
  if p_party_id is null then raise exception 'party_id required'; end if;
  if p_payment_date is null then raise exception 'payment_date required'; end if;
  if p_payment_amount is null or p_payment_amount <= 0 then raise exception 'payment_amount must be greater than zero'; end if;
  if p_bank_account_id is null then raise exception 'bank_account_id required'; end if;
  if nullif(btrim(p_payment_method), '') is null then raise exception 'payment_method required'; end if;
  if p_paid_by is null then raise exception 'authenticated paid_by required'; end if;
  if nullif(btrim(p_currency_code), '') is null then raise exception 'currency_code required'; end if;
  if p_exchange_rate is null or p_exchange_rate <= 0 then raise exception 'exchange_rate must be positive'; end if;
  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array' then raise exception 'allocations must be an array'; end if;
  if p_journal_lines is null or jsonb_typeof(p_journal_lines) <> 'array' or jsonb_array_length(p_journal_lines) < 2 then
    raise exception 'balanced journal lines required';
  end if;
  if nullif(btrim(p_idempotency_key), '') is null then raise exception 'idempotency_key required'; end if;

  if exists (
    select 1
    from (
      select nullif(value->>'customer_invoice_id', '')::uuid as customer_invoice_id, count(*) as allocation_count
      from jsonb_array_elements(p_allocations)
      group by nullif(value->>'customer_invoice_id', '')::uuid
    ) duplicates
    where duplicates.customer_invoice_id is null or duplicates.allocation_count > 1
  ) then
    raise exception 'Each allocation requires one unique customer_invoice_id';
  end if;

  select coalesce(sum(nullif(value->>'amount', '')::numeric), 0)
  into v_allocated_amount
  from jsonb_array_elements(p_allocations);

  if v_allocated_amount < 0 then raise exception 'allocated amount cannot be negative'; end if;
  if v_allocated_amount > p_payment_amount + 0.005 then raise exception 'allocated amount exceeds payment amount'; end if;

  v_unapplied_amount := greatest(p_payment_amount - v_allocated_amount, 0);

  select nullif(value->>'customer_invoice_id', '')::uuid
  into v_primary_invoice_id
  from jsonb_array_elements(p_allocations)
  limit 1;

  v_request_hash := md5(concat_ws(
    '|', p_party_id::text, p_payment_date::text, p_payment_amount::text,
    p_bank_account_id::text, upper(btrim(p_payment_method)),
    coalesce(btrim(p_reference_number), ''), upper(btrim(p_currency_code)),
    p_exchange_rate::text, p_allocations::text, p_journal_lines::text
  ));

  v_existing := public.finance_claim_idempotency(
    p_organization_id, p_entity_id, 'CUSTOMER_RECEIPT_PARTY',
    btrim(p_idempotency_key), v_request_hash, p_payment_id
  );
  if v_existing is not null then return v_existing; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_organization_id::text || ':' || p_entity_id::text || ':customer-receipt-party:' || p_party_id::text,
      0
    )
  );

  perform 1 from public.legal_entities
  where id = p_entity_id and organization_id = p_organization_id;
  if not found then raise exception 'Entity is outside organization scope'; end if;

  perform 1 from public.parties
  where id = p_party_id and organization_id = p_organization_id;
  if not found then raise exception 'Party is outside organization scope'; end if;

  select id, coalesce(nullif(currency_code, ''), nullif(currency, '')) as currency
  into v_bank_account
  from public.bank_accounts
  where id = p_bank_account_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id;
  if not found then raise exception 'Bank account not found in organization and entity scope'; end if;
  if nullif(btrim(v_bank_account.currency), '') is not null
     and upper(btrim(v_bank_account.currency)) <> upper(btrim(p_currency_code)) then
    raise exception 'Bank account currency does not match payment currency';
  end if;

  insert into public.customer_payments (
    id, organization_id, entity_id, customer_id, party_id, customer_invoice_id,
    bank_account_id, payment_date, amount, allocated_amount, unapplied_amount,
    payment_method, reference_number, currency_code, exchange_rate, paid_by,
    status, created_at, updated_at
  ) values (
    p_payment_id, p_organization_id, p_entity_id, p_party_id, p_party_id,
    v_primary_invoice_id, p_bank_account_id, p_payment_date, p_payment_amount,
    v_allocated_amount, v_unapplied_amount, upper(btrim(p_payment_method)),
    nullif(btrim(p_reference_number), ''), upper(btrim(p_currency_code)),
    p_exchange_rate, p_paid_by, case when v_unapplied_amount > 0 then 'PARTIALLY_APPLIED' else 'APPLIED' end,
    v_now, v_now
  ) returning * into v_payment;

  for v_allocation in
    select value from jsonb_array_elements(p_allocations)
    order by value->>'customer_invoice_id'
  loop
    v_invoice_id := nullif(v_allocation->>'customer_invoice_id', '')::uuid;
    v_allocation_amount := nullif(v_allocation->>'amount', '')::numeric;
    if v_allocation_amount is null or v_allocation_amount <= 0 then
      raise exception 'Every customer receipt allocation amount must be greater than zero';
    end if;

    select * into v_receivable
    from public.accounts_receivable
    where organization_id = p_organization_id
      and entity_id = p_entity_id
      and customer_invoice_id = v_invoice_id
      and party_id = p_party_id
    for update;
    if not found then raise exception 'Accounts receivable entry not found for allocated invoice %', v_invoice_id; end if;

    select * into v_invoice
    from public.customer_invoices
    where id = v_invoice_id
      and organization_id = p_organization_id
      and entity_id = p_entity_id
      and party_id = p_party_id
    for update;
    if not found then raise exception 'Customer invoice not found in payment scope'; end if;

    if nullif(btrim(v_invoice.currency_code), '') is not null
       and upper(btrim(v_invoice.currency_code)) <> upper(btrim(p_currency_code)) then
      raise exception 'Allocated invoice currency does not match payment currency';
    end if;

    v_balance_before := coalesce(v_receivable.outstanding_balance, v_receivable.amount, 0);
    if v_balance_before <= 0 then raise exception 'Allocated invoice has no outstanding balance'; end if;
    if v_allocation_amount > v_balance_before + 0.005 then
      raise exception 'Allocation exceeds outstanding balance for invoice %', v_invoice_id;
    end if;

    v_balance_after := greatest(v_balance_before - v_allocation_amount, 0);
    v_invoice_status := case when abs(v_balance_after) <= 0.005 then 'PAID' else 'PARTIAL' end;
    if v_invoice_status = 'PAID' then v_balance_after := 0; end if;

    insert into public.finance_customer_payment_allocations (
      organization_id, entity_id, customer_payment_id, customer_id, party_id,
      accounts_receivable_id, customer_invoice_id, allocated_amount,
      balance_before, balance_after, currency_code, exchange_rate,
      allocated_by, allocated_at, metadata, updated_at
    ) values (
      p_organization_id, p_entity_id, p_payment_id, p_party_id, p_party_id,
      v_receivable.id, v_invoice_id, v_allocation_amount, v_balance_before,
      v_balance_after, upper(btrim(p_currency_code)), p_exchange_rate,
      p_paid_by, v_now,
      jsonb_build_object(
        'reference_number', nullif(btrim(p_reference_number), ''),
        'bank_account_id', p_bank_account_id,
        'payment_method', upper(btrim(p_payment_method))
      ),
      v_now
    );

    update public.accounts_receivable
    set outstanding_balance = v_balance_after,
        status = v_invoice_status,
        updated_at = now()
    where id = v_receivable.id
      and organization_id = p_organization_id
      and entity_id = p_entity_id
      and party_id = p_party_id;

    update public.customer_invoices
    set outstanding_balance = v_balance_after,
        outstanding_amount = v_balance_after,
        status = v_invoice_status,
        updated_at = now()
    where id = v_invoice_id
      and organization_id = p_organization_id
      and entity_id = p_entity_id
      and party_id = p_party_id;
    if not found then raise exception 'Customer invoice balance update failed'; end if;

    v_reconciliations := v_reconciliations || jsonb_build_array(
      public.commercial_reconcile_sales_order_payment_from_invoice(
        p_organization_id, p_entity_id, v_invoice_id
      )
    );
  end loop;

  if v_unapplied_amount > 0.005 then
    insert into public.finance_customer_unapplied_cash (
      organization_id, entity_id, customer_id, party_id, customer_payment_id,
      original_amount, available_amount, currency_code, exchange_rate, status,
      received_by, received_at, metadata, created_at, updated_at
    ) values (
      p_organization_id, p_entity_id, p_party_id, p_party_id, p_payment_id,
      v_unapplied_amount, v_unapplied_amount, upper(btrim(p_currency_code)),
      p_exchange_rate, 'OPEN', p_paid_by, v_now,
      jsonb_build_object(
        'reference_number', nullif(btrim(p_reference_number), ''),
        'bank_account_id', p_bank_account_id,
        'payment_method', upper(btrim(p_payment_method))
      ),
      v_now, v_now
    );
  end if;

  insert into public.bank_ledger (
    organization_id, entity_id, bank_account_id, transaction_type, reference_id,
    source_document, source_document_id, reference_number, amount, currency_code,
    exchange_rate, direction, created_at, updated_at
  ) values (
    p_organization_id, p_entity_id, p_bank_account_id, 'CUSTOMER_RECEIPT', p_payment_id,
    'customer_payment', p_payment_id, nullif(btrim(p_reference_number), ''),
    p_payment_amount, upper(btrim(p_currency_code)), p_exchange_rate, 'INFLOW', v_now, v_now
  ) returning id into v_bank_ledger_id;

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
    p_idempotency_key => 'accounting-event:CUSTOMER_RECEIPT_PARTY:' || p_payment_id::text
  ) into v_journal;

  v_journal_entry_id := nullif(v_journal->'journal'->>'id', '')::uuid;
  if v_journal_entry_id is null then raise exception 'Customer receipt posting did not return a journal entry'; end if;

  update public.customer_payments
  set journal_entry_id = v_journal_entry_id, updated_at = now()
  where id = p_payment_id and organization_id = p_organization_id and entity_id = p_entity_id;

  update public.bank_ledger
  set journal_entry_id = v_journal_entry_id, updated_at = now()
  where id = v_bank_ledger_id and organization_id = p_organization_id and entity_id = p_entity_id;

  select * into v_payment
  from public.customer_payments
  where id = p_payment_id and organization_id = p_organization_id and entity_id = p_entity_id;

  v_result := jsonb_build_object(
    'success', true,
    'payment', to_jsonb(v_payment),
    'party_id', p_party_id,
    'payment_amount', p_payment_amount,
    'allocated_amount', v_allocated_amount,
    'unapplied_amount', v_unapplied_amount,
    'allocation_count', jsonb_array_length(p_allocations),
    'bank_account_id', p_bank_account_id,
    'bank_ledger_id', v_bank_ledger_id,
    'journal', v_journal,
    'journal_entry_id', v_journal_entry_id,
    'sales_order_reconciliations', v_reconciliations
  );

  perform public.finance_complete_idempotency(
    p_organization_id, p_entity_id, 'CUSTOMER_RECEIPT_PARTY',
    btrim(p_idempotency_key), v_result
  );

  return v_result;
end;
$$;

revoke all on function public.finance_post_customer_receipt_party_idempotent(uuid, uuid, uuid, uuid, date, numeric, uuid, text, text, uuid, text, numeric, jsonb, jsonb, text) from public;
revoke all on function public.finance_post_customer_receipt_party_idempotent(uuid, uuid, uuid, uuid, date, numeric, uuid, text, text, uuid, text, numeric, jsonb, jsonb, text) from anon;
revoke all on function public.finance_post_customer_receipt_party_idempotent(uuid, uuid, uuid, uuid, date, numeric, uuid, text, text, uuid, text, numeric, jsonb, jsonb, text) from authenticated;
grant execute on function public.finance_post_customer_receipt_party_idempotent(uuid, uuid, uuid, uuid, date, numeric, uuid, text, text, uuid, text, numeric, jsonb, jsonb, text) to service_role;

create or replace function public.finance_reverse_customer_receipt_party_idempotent(
  p_organization_id uuid,
  p_entity_id uuid,
  p_payment_id uuid,
  p_target_status text,
  p_actor_id uuid,
  p_reason text,
  p_journal_lines jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.customer_payments%rowtype;
  v_allocation public.finance_customer_payment_allocations%rowtype;
  v_receivable public.accounts_receivable%rowtype;
  v_new_balance numeric;
  v_status text;
  v_target text;
  v_request_hash text;
  v_existing jsonb;
  v_journal jsonb;
  v_journal_entry_id uuid;
  v_bank_ledger_id uuid;
  v_reconciliations jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  if p_organization_id is null or p_entity_id is null then raise exception 'organization_id and entity_id required'; end if;
  if p_payment_id is null then raise exception 'payment_id required'; end if;
  if p_actor_id is null then raise exception 'actor_id required'; end if;
  if nullif(btrim(p_idempotency_key), '') is null then raise exception 'idempotency_key required'; end if;
  if p_journal_lines is null or jsonb_typeof(p_journal_lines) <> 'array' or jsonb_array_length(p_journal_lines) < 2 then
    raise exception 'balanced reversal journal lines required';
  end if;

  v_target := upper(coalesce(nullif(btrim(p_target_status), ''), 'REVERSED'));
  if v_target not in ('REVERSED', 'REFUNDED') then raise exception 'target status must be REVERSED or REFUNDED'; end if;

  v_request_hash := md5(concat_ws('|', p_payment_id::text, v_target, coalesce(btrim(p_reason), ''), p_journal_lines::text));
  v_existing := public.finance_claim_idempotency(
    p_organization_id, p_entity_id, 'CUSTOMER_RECEIPT_REVERSAL',
    btrim(p_idempotency_key), v_request_hash, p_payment_id
  );
  if v_existing is not null then return v_existing; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_organization_id::text || ':' || p_entity_id::text || ':customer-receipt-reversal:' || p_payment_id::text,
      0
    )
  );

  select * into v_payment
  from public.customer_payments
  where id = p_payment_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
  for update;
  if not found then raise exception 'Customer payment not found'; end if;

  if upper(coalesce(v_payment.status, '')) in ('REVERSED', 'REFUNDED') then
    v_result := jsonb_build_object(
      'success', true,
      'payment_id', p_payment_id,
      'status', v_payment.status,
      'idempotent', true,
      'reversal_journal_entry_id', v_payment.reversal_journal_entry_id
    );
    perform public.finance_complete_idempotency(
      p_organization_id, p_entity_id, 'CUSTOMER_RECEIPT_REVERSAL',
      btrim(p_idempotency_key), v_result
    );
    return v_result;
  end if;

  if v_payment.journal_entry_id is null then raise exception 'Customer payment has no posted journal to reverse'; end if;

  for v_allocation in
    select *
    from public.finance_customer_payment_allocations
    where organization_id = p_organization_id
      and entity_id = p_entity_id
      and customer_payment_id = p_payment_id
      and reversed_at is null
    order by allocated_at, id
    for update
  loop
    select * into v_receivable
    from public.accounts_receivable
    where id = v_allocation.accounts_receivable_id
      and organization_id = p_organization_id
      and entity_id = p_entity_id
      and party_id = v_payment.party_id
    for update;

    if not found then raise exception 'Accounts receivable entry missing during payment reversal'; end if;

    v_new_balance := least(
      coalesce(v_receivable.amount, 0),
      coalesce(v_receivable.outstanding_balance, 0) + v_allocation.allocated_amount
    );

    v_status := case
      when v_new_balance <= 0.005 then 'PAID'
      when v_new_balance < coalesce(v_receivable.amount, v_new_balance) then 'PARTIAL'
      else 'OPEN'
    end;

    update public.accounts_receivable
    set outstanding_balance = v_new_balance,
        status = v_status,
        updated_at = now()
    where id = v_receivable.id
      and organization_id = p_organization_id
      and entity_id = p_entity_id
      and party_id = v_payment.party_id;

    update public.customer_invoices
    set outstanding_balance = v_new_balance,
        outstanding_amount = v_new_balance,
        status = v_status,
        updated_at = now()
    where id = v_allocation.customer_invoice_id
      and organization_id = p_organization_id
      and entity_id = p_entity_id
      and party_id = v_payment.party_id;
    if not found then raise exception 'Customer invoice missing during payment reversal'; end if;

    update public.finance_customer_payment_allocations
    set reversed_at = now(), reversed_by = p_actor_id, updated_at = now()
    where id = v_allocation.id;

    v_reconciliations := v_reconciliations || jsonb_build_array(
      public.commercial_reconcile_sales_order_payment_from_invoice(
        p_organization_id, p_entity_id, v_allocation.customer_invoice_id
      )
    );
  end loop;

  update public.finance_customer_unapplied_cash
  set available_amount = 0,
      status = 'REFUNDED',
      refunded_at = now(),
      refunded_by = p_actor_id,
      updated_at = now()
  where organization_id = p_organization_id
    and entity_id = p_entity_id
    and customer_payment_id = p_payment_id
    and available_amount > 0;

  insert into public.bank_ledger (
    organization_id, entity_id, bank_account_id, transaction_type, reference_id,
    source_document, source_document_id, reference_number, amount, currency_code,
    exchange_rate, direction, created_at, updated_at
  ) values (
    p_organization_id, p_entity_id, v_payment.bank_account_id,
    case when v_target = 'REFUNDED' then 'CUSTOMER_REFUND' else 'CUSTOMER_RECEIPT_REVERSAL' end,
    p_payment_id, 'customer_payment_reversal', p_payment_id,
    v_payment.reference_number, v_payment.amount, v_payment.currency_code,
    coalesce(v_payment.exchange_rate, 1), 'OUTFLOW', now(), now()
  ) returning id into v_bank_ledger_id;

  select public.finance_post_journal_atomic(
    p_organization_id => p_organization_id,
    p_entity_id => p_entity_id,
    p_posting_date => current_date,
    p_document_date => current_date,
    p_journal_type => 'SYSTEM',
    p_reference => 'accounts_receivable:reversal:' || p_payment_id::text,
    p_source_module => 'accounts_receivable',
    p_source_document => case when v_target = 'REFUNDED' then 'CUSTOMER_REFUND_POSTED' else 'CUSTOMER_RECEIPT_REVERSED' end,
    p_source_document_id => p_payment_id,
    p_description => coalesce(nullif(btrim(p_reason), ''), initcap(lower(v_target)) || ' customer receipt ' || p_payment_id::text),
    p_currency_code => v_payment.currency_code,
    p_exchange_rate => coalesce(v_payment.exchange_rate, 1),
    p_lines => p_journal_lines,
    p_created_by => p_actor_id,
    p_idempotency_key => 'accounting-event:CUSTOMER_RECEIPT_REVERSAL:' || p_payment_id::text || ':' || lower(v_target)
  ) into v_journal;

  v_journal_entry_id := nullif(v_journal->'journal'->>'id', '')::uuid;
  if v_journal_entry_id is null then raise exception 'Customer receipt reversal did not return a journal entry'; end if;

  update public.bank_ledger
  set journal_entry_id = v_journal_entry_id, updated_at = now()
  where id = v_bank_ledger_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id;

  update public.customer_payments
  set allocated_amount = 0,
      unapplied_amount = 0,
      status = v_target,
      reversed_at = case when v_target = 'REVERSED' then now() else reversed_at end,
      refunded_at = case when v_target = 'REFUNDED' then now() else refunded_at end,
      reversal_journal_entry_id = v_journal_entry_id,
      reversal_reason = nullif(btrim(p_reason), ''),
      updated_at = now()
  where id = p_payment_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id;

  v_result := jsonb_build_object(
    'success', true,
    'payment_id', p_payment_id,
    'party_id', v_payment.party_id,
    'status', v_target,
    'reversal_journal_entry_id', v_journal_entry_id,
    'bank_ledger_id', v_bank_ledger_id,
    'sales_order_reconciliations', v_reconciliations,
    'idempotent', false
  );

  perform public.finance_complete_idempotency(
    p_organization_id, p_entity_id, 'CUSTOMER_RECEIPT_REVERSAL',
    btrim(p_idempotency_key), v_result
  );
  return v_result;
end;
$$;

revoke all on function public.finance_reverse_customer_receipt_party_idempotent(uuid, uuid, uuid, text, uuid, text, jsonb, text) from public;
revoke all on function public.finance_reverse_customer_receipt_party_idempotent(uuid, uuid, uuid, text, uuid, text, jsonb, text) from anon;
revoke all on function public.finance_reverse_customer_receipt_party_idempotent(uuid, uuid, uuid, text, uuid, text, jsonb, text) from authenticated;
grant execute on function public.finance_reverse_customer_receipt_party_idempotent(uuid, uuid, uuid, text, uuid, text, jsonb, text) to service_role;

revoke all on function public.finance_allocate_customer_payment(uuid, uuid, uuid, jsonb, uuid) from public;
revoke all on function public.finance_allocate_customer_payment(uuid, uuid, uuid, jsonb, uuid) from anon;
revoke all on function public.finance_allocate_customer_payment(uuid, uuid, uuid, jsonb, uuid) from authenticated;

revoke all on function public.finance_post_customer_payment_atomic(uuid, uuid, uuid, uuid, uuid, date, numeric, text, text, uuid, text, numeric, jsonb) from public;
revoke all on function public.finance_post_customer_payment_atomic(uuid, uuid, uuid, uuid, uuid, date, numeric, text, text, uuid, text, numeric, jsonb) from anon;
revoke all on function public.finance_post_customer_payment_atomic(uuid, uuid, uuid, uuid, uuid, date, numeric, text, text, uuid, text, numeric, jsonb) from authenticated;

revoke all on function public.finance_post_customer_payment_idempotent(uuid, uuid, uuid, uuid, uuid, date, numeric, text, text, uuid, text, numeric, jsonb, text) from public;
revoke all on function public.finance_post_customer_payment_idempotent(uuid, uuid, uuid, uuid, uuid, date, numeric, text, text, uuid, text, numeric, jsonb, text) from anon;
revoke all on function public.finance_post_customer_payment_idempotent(uuid, uuid, uuid, uuid, uuid, date, numeric, text, text, uuid, text, numeric, jsonb, text) from authenticated;

revoke all on function public.finance_post_customer_receipt_allocation_idempotent(uuid, uuid, uuid, uuid, date, numeric, uuid, text, text, uuid, text, numeric, jsonb, jsonb, text) from public;
revoke all on function public.finance_post_customer_receipt_allocation_idempotent(uuid, uuid, uuid, uuid, date, numeric, uuid, text, text, uuid, text, numeric, jsonb, jsonb, text) from anon;
revoke all on function public.finance_post_customer_receipt_allocation_idempotent(uuid, uuid, uuid, uuid, date, numeric, uuid, text, text, uuid, text, numeric, jsonb, jsonb, text) from authenticated;

revoke all on function public.finance_reverse_customer_payment_allocations(uuid, uuid, uuid, text, uuid) from public;
revoke all on function public.finance_reverse_customer_payment_allocations(uuid, uuid, uuid, text, uuid) from anon;
revoke all on function public.finance_reverse_customer_payment_allocations(uuid, uuid, uuid, text, uuid) from authenticated;

grant execute on function public.finance_post_customer_receipt_allocation_idempotent(uuid, uuid, uuid, uuid, date, numeric, uuid, text, text, uuid, text, numeric, jsonb, jsonb, text) to service_role;

comment on function public.finance_post_customer_receipt_party_idempotent(uuid, uuid, uuid, uuid, date, numeric, uuid, text, text, uuid, text, numeric, jsonb, jsonb, text) is
  'Canonical Party-first customer receipt posting. Owns payment, invoice/AR allocation, unapplied cash evidence, bank ledger, journal posting, idempotency, and Sales Order payment reconciliation.';

comment on function public.finance_reverse_customer_receipt_party_idempotent(uuid, uuid, uuid, text, uuid, text, jsonb, text) is
  'Canonical Party-first customer receipt reversal/refund. Restores AR/invoice balances, reverses allocation evidence, closes unapplied cash, posts bank outflow and reversing journal, and reconciles Sales Orders.';

notify pgrst, 'reload schema';

commit;
