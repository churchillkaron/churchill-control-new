-- AVANTIQO SERVICE WALLET ATOMIC SETTLEMENT
-- Serialises wallet mutations, enforces one wallet per organisation, and makes
-- balance mutation plus transaction evidence one database transaction.

begin;

do $$
begin
  if exists (
    select 1
    from public.organization_wallets
    group by organization_id
    having count(*) > 1
  ) then
    raise exception 'DUPLICATE_ORGANIZATION_WALLETS_REQUIRE_RECONCILIATION';
  end if;
end;
$$;

create unique index if not exists organization_wallets_organization_uidx
  on public.organization_wallets (organization_id);

alter table public.wallet_transactions
  add column if not exists idempotency_key text;

update public.wallet_transactions
set idempotency_key = type || ':LEGACY:' || id::text
where idempotency_key is null or btrim(idempotency_key) = '';

alter table public.wallet_transactions
  alter column idempotency_key set not null;

create unique index if not exists wallet_transactions_org_idempotency_uidx
  on public.wallet_transactions (organization_id, idempotency_key);

create or replace function public.apply_wallet_transaction(
  p_organization_id uuid,
  p_operation text,
  p_amount numeric default 0,
  p_currency text default null,
  p_provider text default null,
  p_usage_id uuid default null,
  p_invoice_id uuid default null,
  p_reference text default null,
  p_idempotency_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operation text := upper(btrim(coalesce(p_operation, '')));
  v_currency text := upper(nullif(btrim(coalesce(p_currency, '')), ''));
  v_provider text := nullif(btrim(coalesce(p_provider, '')), '');
  v_reference text := nullif(btrim(coalesce(p_reference, '')), '');
  v_idempotency_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_amount numeric := coalesce(p_amount, 0);
  v_wallet public.organization_wallets%rowtype;
  v_transaction public.wallet_transactions%rowtype;
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;

  if v_operation not in ('ENSURE', 'RESERVE', 'CHARGE', 'RELEASE', 'TOPUP', 'REFUND') then
    raise exception 'UNSUPPORTED_WALLET_OPERATION:%', v_operation;
  end if;

  if v_operation <> 'ENSURE' and v_amount <= 0 then
    raise exception 'WALLET_AMOUNT_MUST_BE_POSITIVE';
  end if;

  if v_operation <> 'ENSURE' and v_idempotency_key is null then
    raise exception 'WALLET_IDEMPOTENCY_KEY_REQUIRED';
  end if;

  if v_idempotency_key is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(p_organization_id::text || ':' || v_idempotency_key, 0)
    );

    select *
    into v_transaction
    from public.wallet_transactions
    where organization_id = p_organization_id
      and idempotency_key = v_idempotency_key
    limit 1;

    if found then
      if v_transaction.type is distinct from v_operation
        or v_transaction.amount is distinct from v_amount
        or (v_currency is not null and upper(v_transaction.currency) is distinct from v_currency)
        or (v_provider is not null and v_transaction.provider is distinct from v_provider)
        or (p_usage_id is not null and v_transaction.usage_id is distinct from p_usage_id)
        or (p_invoice_id is not null and v_transaction.invoice_id is distinct from p_invoice_id)
        or (v_reference is not null and v_transaction.reference is distinct from v_reference)
      then
        raise exception 'WALLET_IDEMPOTENCY_CONFLICT:%', v_idempotency_key;
      end if;

      select *
      into v_wallet
      from public.organization_wallets
      where id = v_transaction.wallet_id;

      if v_wallet.id is null then
        raise exception 'WALLET_TRANSACTION_WALLET_MISSING';
      end if;

      return jsonb_build_object(
        'wallet', to_jsonb(v_wallet),
        'transaction', to_jsonb(v_transaction),
        'reused', true
      );
    end if;
  end if;

  select *
  into v_wallet
  from public.organization_wallets
  where organization_id = p_organization_id
  for update;

  if not found then
    if v_currency is null then
      raise exception 'WALLET_CURRENCY_REQUIRED';
    end if;

    insert into public.organization_wallets (
      id,
      organization_id,
      currency,
      available_balance,
      reserved_balance,
      billing_policy,
      auto_topup,
      auto_topup_threshold,
      auto_topup_amount,
      status,
      created_at,
      updated_at
    ) values (
      gen_random_uuid(),
      p_organization_id,
      v_currency,
      0,
      0,
      'PREPAID',
      false,
      0,
      0,
      'ACTIVE',
      now(),
      now()
    )
    on conflict (organization_id) do nothing;

    select *
    into v_wallet
    from public.organization_wallets
    where organization_id = p_organization_id
    for update;
  end if;

  if v_wallet.id is null then
    raise exception 'ORGANIZATION_WALLET_UNAVAILABLE';
  end if;

  if v_currency is not null and upper(v_wallet.currency) <> v_currency then
    raise exception 'WALLET_CURRENCY_MISMATCH:%:%', v_wallet.currency, v_currency;
  end if;

  if v_operation = 'ENSURE' then
    return jsonb_build_object(
      'wallet', to_jsonb(v_wallet),
      'transaction', null,
      'reused', false
    );
  end if;

  if v_operation = 'RESERVE' then
    if coalesce(v_wallet.available_balance, 0) < v_amount then
      raise exception 'INSUFFICIENT_WALLET_BALANCE';
    end if;

    update public.organization_wallets
    set available_balance = coalesce(available_balance, 0) - v_amount,
        reserved_balance = coalesce(reserved_balance, 0) + v_amount,
        updated_at = now()
    where id = v_wallet.id
    returning * into v_wallet;

  elsif v_operation = 'CHARGE' then
    if coalesce(v_wallet.reserved_balance, 0) < v_amount then
      raise exception 'INSUFFICIENT_RESERVED_WALLET_BALANCE';
    end if;

    update public.organization_wallets
    set reserved_balance = reserved_balance - v_amount,
        updated_at = now()
    where id = v_wallet.id
    returning * into v_wallet;

  elsif v_operation = 'RELEASE' then
    if coalesce(v_wallet.reserved_balance, 0) < v_amount then
      raise exception 'INSUFFICIENT_RESERVED_WALLET_BALANCE';
    end if;

    update public.organization_wallets
    set available_balance = coalesce(available_balance, 0) + v_amount,
        reserved_balance = reserved_balance - v_amount,
        updated_at = now()
    where id = v_wallet.id
    returning * into v_wallet;

  elsif v_operation in ('TOPUP', 'REFUND') then
    update public.organization_wallets
    set available_balance = coalesce(available_balance, 0) + v_amount,
        updated_at = now()
    where id = v_wallet.id
    returning * into v_wallet;
  end if;

  insert into public.wallet_transactions (
    id,
    organization_id,
    wallet_id,
    type,
    amount,
    currency,
    provider,
    usage_id,
    invoice_id,
    reference,
    metadata,
    idempotency_key,
    created_at
  ) values (
    gen_random_uuid(),
    p_organization_id,
    v_wallet.id,
    v_operation,
    v_amount,
    v_wallet.currency,
    v_provider,
    p_usage_id,
    p_invoice_id,
    v_reference,
    coalesce(p_metadata, '{}'::jsonb),
    v_idempotency_key,
    now()
  )
  returning * into v_transaction;

  return jsonb_build_object(
    'wallet', to_jsonb(v_wallet),
    'transaction', to_jsonb(v_transaction),
    'reused', false
  );
end;
$$;

comment on function public.apply_wallet_transaction(
  uuid, text, numeric, text, text, uuid, uuid, text, text, jsonb
) is 'Atomically ensures a wallet, applies one idempotent balance mutation, and records its transaction evidence.';

revoke all on function public.apply_wallet_transaction(
  uuid, text, numeric, text, text, uuid, uuid, text, text, jsonb
) from public, anon, authenticated;

grant execute on function public.apply_wallet_transaction(
  uuid, text, numeric, text, text, uuid, uuid, text, text, jsonb
) to service_role;

commit;
