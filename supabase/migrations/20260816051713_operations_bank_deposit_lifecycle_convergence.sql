alter table public.bank_accounts
  add column if not exists finance_account_id uuid references public.chart_of_accounts(id);

create index if not exists bank_accounts_finance_account_idx
  on public.bank_accounts (organization_id, entity_id, finance_account_id)
  where finance_account_id is not null;

create table if not exists public.operations_bank_deposits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  entity_id uuid not null references public.legal_entities(id),
  source_application_id text,
  source_location_id uuid not null references public.operations_cash_locations(id),
  transit_location_id uuid not null references public.operations_cash_locations(id),
  bank_account_id uuid not null references public.bank_accounts(id),
  cash_transfer_id uuid not null references public.operations_cash_transfers(id),
  amount numeric(18,2) not null,
  currency_code text not null,
  deposit_date date not null,
  deposit_reference text not null,
  evidence_url text,
  notes text,
  status text not null default 'SUBMITTED',
  bank_journal_entry_id uuid references public.journal_entries(id),
  bank_ledger_id uuid references public.bank_ledger(id),
  submitted_by uuid not null references public.staff_accounts(id),
  submitted_at timestamptz not null default now(),
  accounting_confirmed_by uuid references public.staff_accounts(id),
  accounting_confirmed_at timestamptz,
  confirmation_reference text,
  idempotency_key text not null,
  confirmation_idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operations_bank_deposits_amount_check check (amount > 0),
  constraint operations_bank_deposits_status_check
    check (upper(status) in ('SUBMITTED', 'CONFIRMED')),
  constraint operations_bank_deposits_reference_check
    check (nullif(btrim(deposit_reference), '') is not null),
  constraint operations_bank_deposits_locations_check
    check (source_location_id <> transit_location_id)
);

create unique index if not exists operations_bank_deposits_idempotency_uidx
  on public.operations_bank_deposits (organization_id, entity_id, idempotency_key);

create unique index if not exists operations_bank_deposits_cash_transfer_uidx
  on public.operations_bank_deposits (cash_transfer_id);

create unique index if not exists operations_bank_deposits_bank_ledger_uidx
  on public.operations_bank_deposits (bank_ledger_id)
  where bank_ledger_id is not null;

create unique index if not exists operations_bank_deposits_confirmation_idempotency_uidx
  on public.operations_bank_deposits (
    organization_id,
    entity_id,
    confirmation_idempotency_key
  )
  where confirmation_idempotency_key is not null;

create index if not exists operations_bank_deposits_scope_created_idx
  on public.operations_bank_deposits (organization_id, entity_id, created_at desc);

create index if not exists operations_bank_deposits_bank_status_idx
  on public.operations_bank_deposits (bank_account_id, status, deposit_date desc);

alter table public.operations_bank_deposits enable row level security;
revoke all on table public.operations_bank_deposits from public, anon, authenticated;
grant all on table public.operations_bank_deposits to service_role;

create or replace function public.operations_guard_bank_deposit_immutability()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id
     or new.entity_id is distinct from old.entity_id
     or new.source_application_id is distinct from old.source_application_id
     or new.source_location_id is distinct from old.source_location_id
     or new.transit_location_id is distinct from old.transit_location_id
     or new.bank_account_id is distinct from old.bank_account_id
     or new.cash_transfer_id is distinct from old.cash_transfer_id
     or new.amount is distinct from old.amount
     or new.currency_code is distinct from old.currency_code
     or new.deposit_date is distinct from old.deposit_date
     or new.deposit_reference is distinct from old.deposit_reference
     or new.evidence_url is distinct from old.evidence_url
     or new.notes is distinct from old.notes
     or new.submitted_by is distinct from old.submitted_by
     or new.submitted_at is distinct from old.submitted_at
     or new.idempotency_key is distinct from old.idempotency_key
     or new.created_at is distinct from old.created_at then
    raise exception 'Submitted bank deposit evidence is immutable';
  end if;

  if upper(old.status) = 'CONFIRMED' and upper(new.status) <> 'CONFIRMED' then
    raise exception 'Confirmed bank deposit cannot be reopened';
  end if;

  if upper(old.status) = 'SUBMITTED'
     and upper(new.status) not in ('SUBMITTED', 'CONFIRMED') then
    raise exception 'Unsupported bank deposit status transition';
  end if;

  if old.bank_journal_entry_id is not null
     and new.bank_journal_entry_id is distinct from old.bank_journal_entry_id then
    raise exception 'Bank deposit journal evidence is immutable';
  end if;

  if old.bank_ledger_id is not null
     and new.bank_ledger_id is distinct from old.bank_ledger_id then
    raise exception 'Bank deposit ledger evidence is immutable';
  end if;

  if old.accounting_confirmed_by is not null
     and new.accounting_confirmed_by is distinct from old.accounting_confirmed_by then
    raise exception 'Bank deposit accounting confirmation is immutable';
  end if;

  if old.accounting_confirmed_at is not null
     and new.accounting_confirmed_at is distinct from old.accounting_confirmed_at then
    raise exception 'Bank deposit accounting confirmation time is immutable';
  end if;

  if old.confirmation_reference is not null
     and new.confirmation_reference is distinct from old.confirmation_reference then
    raise exception 'Bank deposit confirmation reference is immutable';
  end if;

  if old.confirmation_idempotency_key is not null
     and new.confirmation_idempotency_key is distinct from old.confirmation_idempotency_key then
    raise exception 'Bank deposit confirmation idempotency is immutable';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.operations_guard_bank_deposit_immutability()
  from public, anon, authenticated;
grant execute on function public.operations_guard_bank_deposit_immutability()
  to service_role;

drop trigger if exists operations_bank_deposits_immutability
  on public.operations_bank_deposits;

create trigger operations_bank_deposits_immutability
before update on public.operations_bank_deposits
for each row
execute function public.operations_guard_bank_deposit_immutability();

create or replace function public.operations_submit_bank_deposit_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_source_application_id text,
  p_source_location_id uuid,
  p_transit_location_id uuid,
  p_bank_account_id uuid,
  p_amount numeric,
  p_deposit_date date,
  p_deposit_reference text,
  p_evidence_url text,
  p_notes text,
  p_actor_id uuid,
  p_actor_role text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_role text;
  v_amount numeric(18,2) := round(coalesce(p_amount, 0)::numeric, 2);
  v_reference text := pg_catalog.btrim(coalesce(p_deposit_reference, ''));
  v_key text := pg_catalog.btrim(coalesce(p_idempotency_key, ''));
  v_app text := lower(pg_catalog.btrim(coalesce(p_source_application_id, 'operations')));
  v_currency text;
  v_source public.operations_cash_locations%rowtype;
  v_transit public.operations_cash_locations%rowtype;
  v_bank public.bank_accounts%rowtype;
  v_existing public.operations_bank_deposits%rowtype;
  v_transfer jsonb;
  v_transfer_id uuid;
  v_deposit public.operations_bank_deposits%rowtype;
  v_event jsonb;
begin
  if p_organization_id is null or p_entity_id is null then
    raise exception 'organizationId and entityId required';
  end if;

  if p_actor_id is null then
    raise exception 'Authenticated manager required';
  end if;

  if p_source_location_id is null or p_transit_location_id is null then
    raise exception 'Source and deposit-in-transit locations required';
  end if;

  if p_bank_account_id is null then
    raise exception 'Target bank account required';
  end if;

  if v_amount <= 0 then
    raise exception 'Deposit amount must be greater than zero';
  end if;

  if p_deposit_date is null then
    raise exception 'Deposit date required';
  end if;

  if nullif(v_reference, '') is null then
    raise exception 'Deposit slip or bank reference required';
  end if;

  if nullif(v_key, '') is null then
    raise exception 'idempotencyKey required';
  end if;

  if p_source_location_id = p_transit_location_id then
    raise exception 'Source and deposit-in-transit locations must differ';
  end if;

  select upper(pg_catalog.btrim(coalesce(ou.role, sa.role, p_actor_role, '')))
    into v_role
  from public.staff_accounts sa
  left join public.organization_users ou
    on ou.staff_account_id = sa.id
   and ou.organization_id = p_organization_id
   and lower(coalesce(ou.status, 'active')) = 'active'
  where sa.id = p_actor_id
    and coalesce(sa.active, true) = true
    and (sa.active_organization_id = p_organization_id or ou.id is not null)
  order by ou.created_at desc nulls last
  limit 1;

  if coalesce(v_role, '') not in (
    'MANAGER',
    'GENERAL_MANAGER',
    'OWNER',
    'ORGANIZATION_OWNER',
    'ORG_OWNER',
    'PLATFORM_OWNER',
    'SUPER_ADMIN'
  ) then
    raise exception 'Manager or owner role required to submit bank deposits';
  end if;

  select *
    into v_existing
  from public.operations_bank_deposits d
  where d.organization_id = p_organization_id
    and d.entity_id = p_entity_id
    and d.idempotency_key = v_key
  limit 1;

  if found then
    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'deposit', to_jsonb(v_existing)
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_organization_id::text || ':' || p_entity_id::text || ':bank-deposit-submit',
      0
    )
  );

  select upper(e.currency)
    into v_currency
  from public.legal_entities e
  where e.id = p_entity_id
    and e.organization_id = p_organization_id
    and coalesce(e.is_active, true) = true;

  if v_currency is null then
    raise exception 'Legal entity currency is unavailable';
  end if;

  select *
    into v_source
  from public.operations_cash_locations l
  where l.id = p_source_location_id
    and l.organization_id = p_organization_id
    and l.entity_id = p_entity_id
    and l.is_active = true
  for update;

  if not found then
    raise exception 'Source cash location is unavailable';
  end if;

  if upper(coalesce(v_source.location_type, '')) = 'BANK_DEPOSIT' then
    raise exception 'Deposit-in-transit location cannot be used as the source deposit location';
  end if;

  if upper(v_source.currency_code) <> v_currency then
    raise exception 'Source cash location currency mismatch';
  end if;

  if round(coalesce(v_source.current_balance, 0)::numeric, 2) + 0.005 < v_amount then
    raise exception 'Source cash location has insufficient available balance';
  end if;

  select *
    into v_transit
  from public.operations_cash_locations l
  where l.id = p_transit_location_id
    and l.organization_id = p_organization_id
    and l.entity_id = p_entity_id
    and l.is_active = true
  for update;

  if not found then
    raise exception 'Deposit-in-transit location is unavailable';
  end if;

  if upper(coalesce(v_transit.location_type, '')) <> 'BANK_DEPOSIT' then
    raise exception 'Destination must be a BANK_DEPOSIT custody location';
  end if;

  if upper(v_transit.currency_code) <> v_currency then
    raise exception 'Deposit-in-transit location currency mismatch';
  end if;

  select *
    into v_bank
  from public.bank_accounts b
  where b.id = p_bank_account_id
    and b.organization_id = p_organization_id
    and b.entity_id = p_entity_id
    and coalesce(b.active, true) = true;

  if not found then
    raise exception 'Target bank account is outside the selected legal entity or inactive';
  end if;

  if nullif(upper(coalesce(v_bank.currency_code, v_bank.currency, '')), '') is not null
     and upper(coalesce(v_bank.currency_code, v_bank.currency)) <> v_currency then
    raise exception 'Target bank account currency mismatch';
  end if;

  select public.operations_record_cash_transfer_atomic(
    p_organization_id => p_organization_id,
    p_entity_id => p_entity_id,
    p_application_id => coalesce(nullif(v_app, ''), 'operations'),
    p_transfer_type => 'LOCATION_TO_LOCATION',
    p_source_location_id => p_source_location_id,
    p_destination_location_id => p_transit_location_id,
    p_source_cash_session_id => null,
    p_destination_cash_session_id => null,
    p_amount => v_amount,
    p_actor_id => p_actor_id,
    p_actor_role => v_role,
    p_reason => 'Bank deposit submitted: ' || v_reference,
    p_idempotency_key => 'bank-deposit-transfer:' || v_key
  )
  into v_transfer;

  v_transfer_id := nullif(v_transfer -> 'transfer' ->> 'id', '')::uuid;

  if v_transfer_id is null then
    raise exception 'Bank deposit custody transfer did not return transfer evidence';
  end if;

  insert into public.operations_bank_deposits (
    organization_id,
    entity_id,
    source_application_id,
    source_location_id,
    transit_location_id,
    bank_account_id,
    cash_transfer_id,
    amount,
    currency_code,
    deposit_date,
    deposit_reference,
    evidence_url,
    notes,
    status,
    submitted_by,
    idempotency_key,
    metadata
  )
  values (
    p_organization_id,
    p_entity_id,
    nullif(v_app, ''),
    p_source_location_id,
    p_transit_location_id,
    p_bank_account_id,
    v_transfer_id,
    v_amount,
    v_currency,
    p_deposit_date,
    v_reference,
    nullif(pg_catalog.btrim(coalesce(p_evidence_url, '')), ''),
    nullif(pg_catalog.btrim(coalesce(p_notes, '')), ''),
    'SUBMITTED',
    p_actor_id,
    v_key,
    jsonb_build_object('actor_role', v_role)
  )
  returning * into v_deposit;

  v_event := public.record_system_event_atomic(
    p_organization_id,
    'OPERATIONS_BANK_DEPOSIT_SUBMITTED',
    jsonb_build_object(
      'organization_id', p_organization_id,
      'entity_id', p_entity_id,
      'deposit_id', v_deposit.id,
      'source_location_id', p_source_location_id,
      'transit_location_id', p_transit_location_id,
      'bank_account_id', p_bank_account_id,
      'cash_transfer_id', v_transfer_id,
      'amount', v_amount,
      'currency_code', v_currency,
      'deposit_date', p_deposit_date,
      'deposit_reference', v_reference,
      'actor_id', p_actor_id
    ),
    'operations-bank-deposit-submitted:' || v_deposit.id::text
  );

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'deposit', to_jsonb(v_deposit),
    'cash_transfer', v_transfer -> 'transfer',
    'event_id', v_event -> 'event' ->> 'id'
  );
end;
$$;

revoke all on function public.operations_submit_bank_deposit_atomic(
  uuid,
  uuid,
  text,
  uuid,
  uuid,
  uuid,
  numeric,
  date,
  text,
  text,
  text,
  uuid,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.operations_submit_bank_deposit_atomic(
  uuid,
  uuid,
  text,
  uuid,
  uuid,
  uuid,
  numeric,
  date,
  text,
  text,
  text,
  uuid,
  text,
  text
) to service_role;

create or replace function public.operations_confirm_bank_deposit_atomic(
  p_organization_id uuid,
  p_entity_id uuid,
  p_deposit_id uuid,
  p_actor_id uuid,
  p_confirmation_reference text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_deposit public.operations_bank_deposits%rowtype;
  v_bank public.bank_accounts%rowtype;
  v_bank_account public.chart_of_accounts%rowtype;
  v_transit public.operations_cash_locations%rowtype;
  v_reference text := pg_catalog.btrim(coalesce(p_confirmation_reference, ''));
  v_key text := pg_catalog.btrim(coalesce(p_idempotency_key, ''));
  v_lines jsonb;
  v_posting jsonb;
  v_journal_id uuid;
  v_ledger_id uuid;
  v_event jsonb;
begin
  if p_organization_id is null or p_entity_id is null or p_deposit_id is null then
    raise exception 'organizationId, entityId and depositId required';
  end if;

  if p_actor_id is null then
    raise exception 'Accounting actor required';
  end if;

  if nullif(v_reference, '') is null then
    raise exception 'Bank confirmation reference required';
  end if;

  if nullif(v_key, '') is null then
    raise exception 'idempotencyKey required';
  end if;

  perform 1
  from public.staff_accounts sa
  left join public.organization_users ou
    on ou.staff_account_id = sa.id
   and ou.organization_id = p_organization_id
   and lower(coalesce(ou.status, 'active')) = 'active'
  where sa.id = p_actor_id
    and coalesce(sa.active, true) = true
    and (sa.active_organization_id = p_organization_id or ou.id is not null)
  limit 1;

  if not found then
    raise exception 'Accounting actor is outside the organization or inactive';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_organization_id::text || ':' || p_entity_id::text || ':bank-deposit-confirm:' || p_deposit_id::text,
      0
    )
  );

  select *
    into v_deposit
  from public.operations_bank_deposits d
  where d.id = p_deposit_id
    and d.organization_id = p_organization_id
    and d.entity_id = p_entity_id
  for update;

  if not found then
    raise exception 'Bank deposit not found';
  end if;

  if upper(v_deposit.status) = 'CONFIRMED' then
    if v_deposit.confirmation_idempotency_key = v_key then
      return jsonb_build_object(
        'success', true,
        'duplicate', true,
        'deposit', to_jsonb(v_deposit)
      );
    end if;

    raise exception 'Bank deposit is already accounting-confirmed';
  end if;

  if upper(v_deposit.status) <> 'SUBMITTED' then
    raise exception 'Only submitted bank deposits can be confirmed';
  end if;

  select *
    into v_bank
  from public.bank_accounts b
  where b.id = v_deposit.bank_account_id
    and b.organization_id = p_organization_id
    and b.entity_id = p_entity_id
    and coalesce(b.active, true) = true;

  if not found then
    raise exception 'Target bank account is outside the selected legal entity or inactive';
  end if;

  if v_bank.finance_account_id is null then
    raise exception 'Target bank account is not mapped to a Finance ledger account';
  end if;

  select *
    into v_bank_account
  from public.chart_of_accounts a
  where a.id = v_bank.finance_account_id
    and a.organization_id = p_organization_id
    and a.entity_id = p_entity_id
    and coalesce(a.is_active, true) = true;

  if not found then
    raise exception 'Target bank Finance account is outside the selected legal entity or inactive';
  end if;

  if upper(coalesce(v_bank_account.account_category, '')) not like 'ASSET%' then
    raise exception 'Target bank Finance account must be an asset account';
  end if;

  if nullif(upper(coalesce(v_bank_account.currency_code, '')), '') is not null
     and upper(v_bank_account.currency_code) <> upper(v_deposit.currency_code) then
    raise exception 'Target bank Finance account currency mismatch';
  end if;

  select *
    into v_transit
  from public.operations_cash_locations l
  where l.id = v_deposit.transit_location_id
    and l.organization_id = p_organization_id
    and l.entity_id = p_entity_id
    and l.is_active = true
  for update;

  if not found then
    raise exception 'Deposit-in-transit location is unavailable';
  end if;

  if upper(coalesce(v_transit.location_type, '')) <> 'BANK_DEPOSIT' then
    raise exception 'Deposit transit evidence is invalid';
  end if;

  if round(coalesce(v_transit.current_balance, 0)::numeric, 2) + 0.005 < v_deposit.amount then
    raise exception 'Deposit-in-transit balance is insufficient for accounting confirmation';
  end if;

  if v_transit.finance_account_id = v_bank.finance_account_id then
    raise exception 'Deposit-in-transit and bank Finance accounts must differ';
  end if;

  v_lines := jsonb_build_array(
    jsonb_build_object(
      'account_id', v_bank.finance_account_id,
      'debit', v_deposit.amount,
      'credit', 0,
      'description', 'Bank deposit ' || v_deposit.deposit_reference
    ),
    jsonb_build_object(
      'account_id', v_transit.finance_account_id,
      'debit', 0,
      'credit', v_deposit.amount,
      'description', 'Bank deposit ' || v_deposit.deposit_reference
    )
  );

  select public.finance_post_journal_atomic(
    p_organization_id => p_organization_id,
    p_entity_id => p_entity_id,
    p_posting_date => v_deposit.deposit_date,
    p_document_date => v_deposit.deposit_date,
    p_journal_type => 'SYSTEM',
    p_reference => 'operations-bank-deposit:' || v_deposit.id::text,
    p_source_module => 'operations',
    p_source_document => 'OPERATIONS_BANK_DEPOSIT',
    p_source_document_id => v_deposit.id,
    p_description => 'Bank deposit confirmed: ' || v_deposit.deposit_reference,
    p_currency_code => v_deposit.currency_code,
    p_exchange_rate => 1,
    p_lines => v_lines,
    p_created_by => p_actor_id,
    p_idempotency_key => 'operations-bank-deposit-confirm:' || v_deposit.id::text
  )
  into v_posting;

  v_journal_id := nullif(v_posting -> 'journal' ->> 'id', '')::uuid;

  if v_journal_id is null then
    raise exception 'Bank deposit Finance posting did not return a journal entry';
  end if;

  insert into public.bank_ledger (
    transaction_type,
    reference_id,
    amount,
    direction,
    created_at,
    organization_id,
    entity_id,
    bank_account_id,
    currency_code,
    exchange_rate,
    reference_number,
    source_document,
    source_document_id,
    journal_entry_id,
    updated_at
  )
  values (
    'CASH_DEPOSIT',
    v_deposit.id,
    v_deposit.amount,
    'IN',
    now(),
    p_organization_id,
    p_entity_id,
    v_deposit.bank_account_id,
    v_deposit.currency_code,
    1,
    v_deposit.deposit_reference,
    'OPERATIONS_BANK_DEPOSIT',
    v_deposit.id,
    v_journal_id,
    now()
  )
  returning id into v_ledger_id;

  update public.operations_cash_locations
  set current_balance = round((current_balance - v_deposit.amount)::numeric, 2),
      updated_at = now()
  where id = v_deposit.transit_location_id;

  update public.operations_bank_deposits
  set status = 'CONFIRMED',
      bank_journal_entry_id = v_journal_id,
      bank_ledger_id = v_ledger_id,
      accounting_confirmed_by = p_actor_id,
      accounting_confirmed_at = now(),
      confirmation_reference = v_reference,
      confirmation_idempotency_key = v_key,
      updated_at = now()
  where id = v_deposit.id
  returning * into v_deposit;

  v_event := public.record_system_event_atomic(
    p_organization_id,
    'OPERATIONS_BANK_DEPOSIT_CONFIRMED',
    jsonb_build_object(
      'organization_id', p_organization_id,
      'entity_id', p_entity_id,
      'deposit_id', v_deposit.id,
      'bank_account_id', v_deposit.bank_account_id,
      'bank_journal_entry_id', v_journal_id,
      'bank_ledger_id', v_ledger_id,
      'amount', v_deposit.amount,
      'currency_code', v_deposit.currency_code,
      'deposit_reference', v_deposit.deposit_reference,
      'confirmation_reference', v_reference,
      'actor_id', p_actor_id
    ),
    'operations-bank-deposit-confirmed:' || v_deposit.id::text
  );

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'deposit', to_jsonb(v_deposit),
    'journal_entry_id', v_journal_id,
    'bank_ledger_id', v_ledger_id,
    'event_id', v_event -> 'event' ->> 'id'
  );
end;
$$;

revoke all on function public.operations_confirm_bank_deposit_atomic(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.operations_confirm_bank_deposit_atomic(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text
) to service_role;
