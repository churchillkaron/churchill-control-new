begin;

alter table if exists public.bank_accounts
  alter column currency drop default;

alter table if exists public.vendor_payments
  add column if not exists bank_account_id uuid,
  add column if not exists currency_code text,
  add column if not exists exchange_rate numeric,
  add column if not exists reference_number text,
  add column if not exists journal_entry_id uuid,
  add column if not exists status text not null default 'POSTED',
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.bank_ledger
  add column if not exists bank_account_id uuid,
  add column if not exists currency_code text,
  add column if not exists exchange_rate numeric,
  add column if not exists reference_number text,
  add column if not exists source_document text,
  add column if not exists source_document_id uuid,
  add column if not exists journal_entry_id uuid,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.finance_vendor_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  vendor_payment_id uuid not null,
  accounts_payable_id uuid not null,
  vendor_invoice_id uuid,
  allocated_amount numeric not null,
  balance_before numeric not null,
  balance_after numeric not null,
  currency_code text not null,
  exchange_rate numeric not null,
  allocated_by uuid not null,
  allocated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (vendor_payment_id, accounts_payable_id),
  check (allocated_amount > 0),
  check (balance_before >= 0),
  check (balance_after >= 0),
  check (exchange_rate > 0)
);

create index if not exists finance_vendor_payment_allocations_scope_idx
on public.finance_vendor_payment_allocations (
  organization_id,
  entity_id,
  accounts_payable_id,
  allocated_at desc
);

create or replace function public.finance_post_vendor_payment_allocation_idempotent(
  p_payment_id uuid,
  p_organization_id uuid,
  p_entity_id uuid,
  p_accounts_payable_id uuid,
  p_payment_amount numeric,
  p_bank_account_id uuid,
  p_payment_method text,
  p_reference_number text,
  p_paid_by uuid,
  p_paid_at timestamptz,
  p_currency_code text,
  p_exchange_rate numeric,
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
  v_ap public.accounts_payable%rowtype;
  v_payment public.vendor_payments%rowtype;
  v_bank_account record;
  v_balance_before numeric;
  v_balance_after numeric;
  v_status text;
  v_journal jsonb;
  v_journal_entry_id uuid;
  v_bank_ledger_id uuid;
  v_now timestamptz := coalesce(p_paid_at, now());
begin
  if p_payment_id is null then
    raise exception 'payment_id required';
  end if;

  if p_organization_id is null or p_entity_id is null then
    raise exception 'organization_id and entity_id required';
  end if;

  if p_accounts_payable_id is null then
    raise exception 'accounts_payable_id required';
  end if;

  if p_bank_account_id is null then
    raise exception 'bank_account_id required';
  end if;

  if p_paid_by is null then
    raise exception 'authenticated paid_by required';
  end if;

  if p_payment_amount is null or p_payment_amount <= 0 then
    raise exception 'payment_amount must be greater than zero';
  end if;

  if nullif(btrim(p_payment_method), '') is null then
    raise exception 'payment_method required';
  end if;

  if nullif(btrim(p_currency_code), '') is null then
    raise exception 'currency_code required';
  end if;

  if p_exchange_rate is null or p_exchange_rate <= 0 then
    raise exception 'exchange_rate must be positive';
  end if;

  if p_journal_lines is null
     or jsonb_typeof(p_journal_lines) <> 'array'
     or jsonb_array_length(p_journal_lines) < 2 then
    raise exception 'balanced journal lines required';
  end if;

  if nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'idempotency_key required';
  end if;

  v_request_hash := md5(concat_ws(
    '|',
    p_accounts_payable_id::text,
    p_payment_amount::text,
    p_bank_account_id::text,
    upper(btrim(p_payment_method)),
    coalesce(btrim(p_reference_number), ''),
    v_now::date::text,
    upper(btrim(p_currency_code)),
    p_exchange_rate::text,
    coalesce(p_journal_lines, '[]'::jsonb)::text
  ));

  v_existing := public.finance_claim_idempotency(
    p_organization_id,
    p_entity_id,
    'VENDOR_PAYMENT_ALLOCATION',
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
      p_entity_id::text || ':vendor-payment:' ||
      p_accounts_payable_id::text,
      0
    )
  );

  select *
  into v_ap
  from public.accounts_payable
  where id = p_accounts_payable_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id
  for update;

  if not found then
    raise exception 'Accounts payable entry not found in organization and entity scope';
  end if;

  if coalesce(v_ap.payment_hold, false) then
    raise exception 'Accounts payable entry is on payment hold: %', coalesce(v_ap.hold_reason, 'approval required');
  end if;

  v_balance_before := coalesce(v_ap.outstanding_balance, v_ap.amount, 0);

  if v_balance_before <= 0 or upper(coalesce(v_ap.status, '')) = 'PAID' then
    raise exception 'Accounts payable entry is already paid';
  end if;

  if p_payment_amount > v_balance_before then
    raise exception 'Payment amount exceeds outstanding payable balance';
  end if;

  if nullif(btrim(v_ap.currency_code), '') is not null
     and upper(btrim(v_ap.currency_code)) <> upper(btrim(p_currency_code)) then
    raise exception 'Payment currency does not match accounts payable currency';
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

  v_balance_after := v_balance_before - p_payment_amount;
  v_status := case
    when abs(v_balance_after) <= 0.005 then 'PAID'
    else 'PARTIAL'
  end;

  if v_status = 'PAID' then
    v_balance_after := 0;
  end if;

  insert into public.vendor_payments (
    id,
    organization_id,
    entity_id,
    accounts_payable_id,
    vendor_party_id,
    bank_account_id,
    amount,
    payment_method,
    reference_number,
    currency_code,
    exchange_rate,
    paid_by,
    paid_at,
    status,
    created_at,
    updated_at
  ) values (
    p_payment_id,
    p_organization_id,
    p_entity_id,
    p_accounts_payable_id,
    v_ap.vendor_party_id,
    p_bank_account_id,
    p_payment_amount,
    upper(btrim(p_payment_method)),
    nullif(btrim(p_reference_number), ''),
    upper(btrim(p_currency_code)),
    p_exchange_rate,
    p_paid_by,
    v_now,
    'POSTED',
    now(),
    now()
  )
  returning * into v_payment;

  insert into public.finance_vendor_payment_allocations (
    organization_id,
    entity_id,
    vendor_payment_id,
    accounts_payable_id,
    vendor_invoice_id,
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
    v_ap.id,
    v_ap.vendor_invoice_id,
    p_payment_amount,
    v_balance_before,
    v_balance_after,
    upper(btrim(p_currency_code)),
    p_exchange_rate,
    p_paid_by,
    v_now,
    jsonb_build_object(
      'payment_method', upper(btrim(p_payment_method)),
      'reference_number', nullif(btrim(p_reference_number), ''),
      'bank_account_id', p_bank_account_id
    )
  );

  update public.accounts_payable
  set outstanding_balance = v_balance_after,
      status = v_status,
      payment_date = v_now,
      updated_at = now()
  where id = v_ap.id
    and organization_id = p_organization_id
    and entity_id = p_entity_id;

  if v_ap.vendor_invoice_id is not null then
    update public.vendor_invoices
    set outstanding_amount = v_balance_after,
        status = case
          when v_status = 'PAID' then 'PAID'
          else 'PARTIALLY_PAID'
        end,
        updated_at = now()
    where id = v_ap.vendor_invoice_id
      and organization_id = p_organization_id
      and entity_id = p_entity_id;

    if not found then
      raise exception 'Vendor invoice not found for accounts payable allocation';
    end if;
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
    'VENDOR_PAYMENT',
    p_payment_id,
    'vendor_payment',
    p_payment_id,
    nullif(btrim(p_reference_number), ''),
    p_payment_amount,
    upper(btrim(p_currency_code)),
    p_exchange_rate,
    'OUTFLOW',
    v_now,
    now()
  )
  returning id into v_bank_ledger_id;

  select public.finance_post_journal_atomic(
    p_organization_id => p_organization_id,
    p_entity_id => p_entity_id,
    p_posting_date => v_now::date,
    p_document_date => v_now::date,
    p_journal_type => 'SYSTEM',
    p_reference => 'accounts_payable:' || p_payment_id::text,
    p_source_module => 'accounts_payable',
    p_source_document => 'VENDOR_PAYMENT_POSTED',
    p_source_document_id => p_payment_id,
    p_description => 'Vendor Payment ' || coalesce(nullif(btrim(p_reference_number), ''), p_payment_id::text),
    p_currency_code => upper(btrim(p_currency_code)),
    p_exchange_rate => p_exchange_rate,
    p_lines => p_journal_lines,
    p_created_by => p_paid_by,
    p_idempotency_key => 'accounting-event:VENDOR_PAYMENT_POSTED:accounts_payable:' || p_payment_id::text
  ) into v_journal;

  v_journal_entry_id := nullif(v_journal->'journal'->>'id', '')::uuid;

  if v_journal_entry_id is null then
    raise exception 'Vendor payment posting did not return a journal entry';
  end if;

  update public.vendor_payments
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
  from public.vendor_payments
  where id = p_payment_id
    and organization_id = p_organization_id
    and entity_id = p_entity_id;

  v_result := jsonb_build_object(
    'success', true,
    'payment', to_jsonb(v_payment),
    'accounts_payable_id', v_ap.id,
    'vendor_invoice_id', v_ap.vendor_invoice_id,
    'allocated_amount', p_payment_amount,
    'balance_before', v_balance_before,
    'outstanding_balance', v_balance_after,
    'status', v_status,
    'bank_account_id', p_bank_account_id,
    'bank_ledger_id', v_bank_ledger_id,
    'journal', v_journal,
    'journal_entry_id', v_journal_entry_id
  );

  perform public.finance_complete_idempotency(
    p_organization_id,
    p_entity_id,
    'VENDOR_PAYMENT_ALLOCATION',
    btrim(p_idempotency_key),
    v_result
  );

  return v_result;
end;
$$;

revoke all on function public.finance_post_vendor_payment_allocation_idempotent(
  uuid, uuid, uuid, uuid, numeric, uuid, text, text, uuid, timestamptz,
  text, numeric, jsonb, text
) from public;

grant execute on function public.finance_post_vendor_payment_allocation_idempotent(
  uuid, uuid, uuid, uuid, numeric, uuid, text, text, uuid, timestamptz,
  text, numeric, jsonb, text
) to service_role;

comment on table public.finance_vendor_payment_allocations is
  'Atomic allocation evidence linking vendor payments to Accounts Payable and source vendor invoices.';

notify pgrst, 'reload schema';

commit;
