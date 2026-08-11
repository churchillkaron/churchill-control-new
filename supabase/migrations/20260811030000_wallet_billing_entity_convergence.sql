-- AVANTIQO WALLET + BILLING ENTITY CONVERGENCE
-- Canonical scope: Party (optional transaction/counterparty context) -> Organization -> Entity.
-- Preserves all balances, reservations, transaction amounts, and invoice amounts.
-- Enforces prepaid-only organization wallets and derives currency from configured business data.

begin;

create or replace function public.resolve_organization_billing_context(
  p_organization_id uuid
)
returns table (
  entity_id uuid,
  currency text
)
language sql
stable
security definer
set search_path = public
as $$
  with default_entity as (
    select
      le.id,
      nullif(upper(btrim(coalesce(le.currency, ''))), '') as currency
    from public.legal_entities le
    where le.organization_id = p_organization_id
      and coalesce(le.is_active, true) = true
      and coalesce(le.is_default_accounting_entity, false) = true
    order by le.updated_at desc nulls last, le.created_at asc nulls last, le.id
    limit 1
  ),
  accounting as (
    select
      fas.entity_id,
      nullif(upper(btrim(coalesce(fas.base_currency, ''))), '') as currency
    from public.finance_accounting_settings fas
    where fas.organization_id = p_organization_id
      and upper(btrim(coalesce(fas.status, 'ACTIVE'))) = 'ACTIVE'
      and nullif(btrim(coalesce(fas.base_currency, '')), '') is not null
    order by
      case
        when fas.entity_id = (select id from default_entity) then 0
        when fas.entity_id is null then 1
        else 2
      end,
      fas.effective_from desc nulls last,
      fas.updated_at desc nulls last,
      fas.created_at desc nulls last,
      fas.id
    limit 1
  )
  select
    coalesce((select id from default_entity), (select entity_id from accounting)) as entity_id,
    coalesce((select currency from default_entity), (select currency from accounting)) as currency;
$$;

comment on function public.resolve_organization_billing_context(uuid)
is 'Resolves the configured default legal entity and billing currency for an organization without jurisdiction hardcoding.';

revoke all on function public.resolve_organization_billing_context(uuid) from public, anon, authenticated;
grant execute on function public.resolve_organization_billing_context(uuid) to service_role;

update public.organization_wallets
set
  billing_policy = 'PREPAID',
  wallet_type = 'PREPAID',
  credit_limit = 0,
  allow_negative = false,
  default_currency = upper(currency),
  entity_id = coalesce(
    entity_id,
    (select ctx.entity_id from public.resolve_organization_billing_context(organization_id) ctx)
  ),
  updated_at = now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.organization_wallets'::regclass
      and conname = 'organization_wallets_prepaid_policy_ck'
  ) then
    alter table public.organization_wallets
      add constraint organization_wallets_prepaid_policy_ck
      check (upper(btrim(coalesce(billing_policy, ''))) = 'PREPAID');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.organization_wallets'::regclass
      and conname = 'organization_wallets_prepaid_type_ck'
  ) then
    alter table public.organization_wallets
      add constraint organization_wallets_prepaid_type_ck
      check (upper(btrim(coalesce(wallet_type, ''))) = 'PREPAID');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.organization_wallets'::regclass
      and conname = 'organization_wallets_no_credit_ck'
  ) then
    alter table public.organization_wallets
      add constraint organization_wallets_no_credit_ck
      check (coalesce(credit_limit, 0) = 0 and coalesce(allow_negative, false) = false);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.organization_wallets'::regclass
      and conname = 'organization_wallets_currency_alignment_ck'
  ) then
    alter table public.organization_wallets
      add constraint organization_wallets_currency_alignment_ck
      check (
        nullif(btrim(coalesce(currency, '')), '') is not null
        and upper(btrim(coalesce(default_currency, currency))) = upper(btrim(currency))
      );
  end if;
end;
$$;

create or replace function public.bind_organization_wallet_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity_id uuid;
  v_currency text;
begin
  select ctx.entity_id, ctx.currency
    into v_entity_id, v_currency
  from public.resolve_organization_billing_context(new.organization_id) ctx;

  if new.entity_id is null then
    new.entity_id := v_entity_id;
  elsif not exists (
    select 1
    from public.legal_entities le
    where le.id = new.entity_id
      and le.organization_id = new.organization_id
      and coalesce(le.is_active, true) = true
  ) then
    raise exception 'WALLET_ENTITY_SCOPE_MISMATCH';
  end if;

  if nullif(btrim(coalesce(new.currency, '')), '') is null then
    new.currency := v_currency;
  end if;

  if nullif(btrim(coalesce(new.currency, '')), '') is null then
    raise exception 'WALLET_CURRENCY_REQUIRED';
  end if;

  if v_currency is not null and upper(btrim(new.currency)) <> v_currency then
    raise exception 'WALLET_CURRENCY_CONFIGURATION_MISMATCH:%:%', new.currency, v_currency;
  end if;

  new.currency := upper(btrim(new.currency));
  new.default_currency := new.currency;
  new.billing_policy := 'PREPAID';
  new.wallet_type := 'PREPAID';
  new.credit_limit := 0;
  new.allow_negative := false;
  return new;
end;
$$;

revoke all on function public.bind_organization_wallet_context() from public, anon, authenticated;

drop trigger if exists organization_wallets_bind_context on public.organization_wallets;
create trigger organization_wallets_bind_context
before insert or update of organization_id, entity_id, currency, default_currency, billing_policy, wallet_type, credit_limit, allow_negative
on public.organization_wallets
for each row
execute function public.bind_organization_wallet_context();

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
  v_context_currency text;
  v_context_entity_id uuid;
  v_provider text := nullif(btrim(coalesce(p_provider, '')), '');
  v_reference text := nullif(btrim(coalesce(p_reference, '')), '');
  v_idempotency_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_amount numeric := coalesce(p_amount, 0);
  v_wallet public.organization_wallets%rowtype;
  v_transaction public.wallet_transactions%rowtype;
begin
  if p_organization_id is null then raise exception 'organization_id required'; end if;
  if v_operation not in ('ENSURE', 'RESERVE', 'CHARGE', 'RELEASE', 'TOPUP', 'REFUND') then raise exception 'UNSUPPORTED_WALLET_OPERATION:%', v_operation; end if;
  if v_operation <> 'ENSURE' and v_amount <= 0 then raise exception 'WALLET_AMOUNT_MUST_BE_POSITIVE'; end if;
  if v_operation <> 'ENSURE' and v_idempotency_key is null then raise exception 'WALLET_IDEMPOTENCY_KEY_REQUIRED'; end if;

  select ctx.entity_id, ctx.currency
    into v_context_entity_id, v_context_currency
  from public.resolve_organization_billing_context(p_organization_id) ctx;

  if v_currency is null then
    v_currency := v_context_currency;
  elsif v_context_currency is not null and v_currency <> v_context_currency then
    raise exception 'WALLET_CURRENCY_CONFIGURATION_MISMATCH:%:%', v_currency, v_context_currency;
  end if;

  if v_idempotency_key is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' || v_idempotency_key, 0));
    select * into v_transaction
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

      select * into v_wallet
      from public.organization_wallets
      where id = v_transaction.wallet_id;

      if v_wallet.id is null then raise exception 'WALLET_TRANSACTION_WALLET_MISSING'; end if;
      return jsonb_build_object('wallet', to_jsonb(v_wallet), 'transaction', to_jsonb(v_transaction), 'reused', true);
    end if;
  end if;

  select * into v_wallet
  from public.organization_wallets
  where organization_id = p_organization_id
  for update;

  if not found then
    if v_currency is null then raise exception 'WALLET_CURRENCY_REQUIRED'; end if;

    insert into public.organization_wallets (
      id,
      organization_id,
      entity_id,
      currency,
      default_currency,
      available_balance,
      reserved_balance,
      billing_policy,
      wallet_type,
      credit_limit,
      allow_negative,
      auto_topup,
      auto_topup_threshold,
      auto_topup_amount,
      status,
      created_at,
      updated_at
    ) values (
      gen_random_uuid(),
      p_organization_id,
      v_context_entity_id,
      v_currency,
      v_currency,
      0,
      0,
      'PREPAID',
      'PREPAID',
      0,
      false,
      false,
      0,
      0,
      'ACTIVE',
      now(),
      now()
    )
    on conflict (organization_id) do nothing;

    select * into v_wallet
    from public.organization_wallets
    where organization_id = p_organization_id
    for update;
  elsif v_wallet.entity_id is null and v_context_entity_id is not null then
    update public.organization_wallets
    set entity_id = v_context_entity_id,
        updated_at = now()
    where id = v_wallet.id
    returning * into v_wallet;
  end if;

  if v_wallet.id is null then raise exception 'ORGANIZATION_WALLET_UNAVAILABLE'; end if;
  if upper(btrim(coalesce(v_wallet.status, ''))) <> 'ACTIVE' then raise exception 'ACTIVE_PREPAID_WALLET_REQUIRED'; end if;
  if upper(btrim(coalesce(v_wallet.billing_policy, ''))) <> 'PREPAID' then raise exception 'PREPAID_WALLET_REQUIRED'; end if;
  if upper(btrim(coalesce(v_wallet.wallet_type, ''))) <> 'PREPAID' then raise exception 'PREPAID_WALLET_REQUIRED'; end if;
  if coalesce(v_wallet.allow_negative, false) = true or coalesce(v_wallet.credit_limit, 0) <> 0 then raise exception 'WALLET_CREDIT_FORBIDDEN'; end if;
  if v_currency is not null and upper(v_wallet.currency) <> v_currency then raise exception 'WALLET_CURRENCY_MISMATCH:%:%', v_wallet.currency, v_currency; end if;
  if v_operation = 'ENSURE' then return jsonb_build_object('wallet', to_jsonb(v_wallet), 'transaction', null, 'reused', false); end if;

  if v_operation = 'RESERVE' then
    if coalesce(v_wallet.available_balance, 0) < v_amount then raise exception 'INSUFFICIENT_WALLET_BALANCE'; end if;
    update public.organization_wallets
    set available_balance = coalesce(available_balance, 0) - v_amount,
        reserved_balance = coalesce(reserved_balance, 0) + v_amount,
        updated_at = now()
    where id = v_wallet.id
    returning * into v_wallet;
  elsif v_operation = 'CHARGE' then
    if coalesce(v_wallet.reserved_balance, 0) < v_amount then raise exception 'INSUFFICIENT_RESERVED_WALLET_BALANCE'; end if;
    update public.organization_wallets
    set reserved_balance = reserved_balance - v_amount,
        updated_at = now()
    where id = v_wallet.id
    returning * into v_wallet;
  elsif v_operation = 'RELEASE' then
    if coalesce(v_wallet.reserved_balance, 0) < v_amount then raise exception 'INSUFFICIENT_RESERVED_WALLET_BALANCE'; end if;
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
    entity_id,
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
    v_wallet.entity_id,
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

  return jsonb_build_object('wallet', to_jsonb(v_wallet), 'transaction', to_jsonb(v_transaction), 'reused', false);
end;
$$;

comment on function public.apply_wallet_transaction(uuid, text, numeric, text, text, uuid, uuid, text, text, jsonb)
is 'Atomically ensures a prepaid organization wallet, resolves configured Entity/currency, applies one idempotent balance mutation, and records Entity-scoped transaction evidence.';

revoke all on function public.apply_wallet_transaction(uuid, text, numeric, text, text, uuid, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_wallet_transaction(uuid, text, numeric, text, text, uuid, uuid, text, text, jsonb) to service_role;

create or replace function public.bind_organization_service_entity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity_id uuid;
begin
  if new.entity_id is null then
    select ctx.entity_id into v_entity_id
    from public.resolve_organization_billing_context(new.organization_id) ctx;
    new.entity_id := v_entity_id;
  elsif not exists (
    select 1
    from public.legal_entities le
    where le.id = new.entity_id
      and le.organization_id = new.organization_id
      and coalesce(le.is_active, true) = true
  ) then
    raise exception 'ORGANIZATION_SERVICE_ENTITY_SCOPE_MISMATCH';
  end if;

  return new;
end;
$$;

revoke all on function public.bind_organization_service_entity() from public, anon, authenticated;

drop trigger if exists organization_services_bind_entity on public.organization_services;
create trigger organization_services_bind_entity
before insert or update of organization_id, entity_id
on public.organization_services
for each row
execute function public.bind_organization_service_entity();

create or replace function public.bind_platform_service_usage_entity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity_id uuid;
begin
  if new.entity_id is null and new.organization_service_id is not null then
    select os.entity_id into v_entity_id
    from public.organization_services os
    where os.id = new.organization_service_id
      and os.organization_id = new.organization_id;
  end if;

  if new.entity_id is null then
    if v_entity_id is null then
      select ctx.entity_id into v_entity_id
      from public.resolve_organization_billing_context(new.organization_id) ctx;
    end if;
    new.entity_id := v_entity_id;
  elsif not exists (
    select 1
    from public.legal_entities le
    where le.id = new.entity_id
      and le.organization_id = new.organization_id
      and coalesce(le.is_active, true) = true
  ) then
    raise exception 'SERVICE_USAGE_ENTITY_SCOPE_MISMATCH';
  end if;

  return new;
end;
$$;

revoke all on function public.bind_platform_service_usage_entity() from public, anon, authenticated;

drop trigger if exists platform_service_usage_bind_entity on public.platform_service_usage;
create trigger platform_service_usage_bind_entity
before insert or update of organization_id, organization_service_id, entity_id
on public.platform_service_usage
for each row
execute function public.bind_platform_service_usage_entity();

update public.organization_services os
set
  entity_id = ctx.entity_id,
  default_currency = coalesce(os.default_currency, ctx.currency),
  updated_at = now()
from lateral public.resolve_organization_billing_context(os.organization_id) ctx
where os.entity_id is null
  and ctx.entity_id is not null;

update public.platform_service_usage u
set
  entity_id = coalesce(os.entity_id, ctx.entity_id),
  updated_at = now()
from public.resolve_organization_billing_context(u.organization_id) ctx
left join public.organization_services os
  on os.id = u.organization_service_id
 and os.organization_id = u.organization_id
where u.entity_id is null
  and coalesce(os.entity_id, ctx.entity_id) is not null;

update public.wallet_transactions wt
set entity_id = w.entity_id
from public.organization_wallets w
where wt.wallet_id = w.id
  and wt.organization_id = w.organization_id
  and wt.entity_id is null
  and w.entity_id is not null;

update public.billing_invoice_lines bil
set
  entity_id = coalesce(u.entity_id, ctx.entity_id),
  updated_at = now()
from public.resolve_organization_billing_context(bil.organization_id) ctx
left join public.platform_service_usage u
  on u.id = bil.usage_id
 and u.organization_id = bil.organization_id
where bil.entity_id is null
  and coalesce(u.entity_id, ctx.entity_id) is not null;

update public.billing_invoices bi
set
  entity_id = ctx.entity_id,
  updated_at = now()
from public.resolve_organization_billing_context(bi.organization_id) ctx
where bi.entity_id is null
  and upper(btrim(coalesce(bi.source, ''))) = 'SERVICE_USAGE'
  and ctx.entity_id is not null;

do $$
declare
  r record;
begin
  for r in
    select o.id
    from public.organizations o
    where upper(btrim(coalesce(o.organization_status, 'ACTIVE'))) = 'ACTIVE'
      and lower(btrim(coalesce(o.status, 'active'))) = 'active'
    order by o.id
  loop
    perform public.apply_wallet_transaction(
      r.id,
      'ENSURE',
      0,
      null,
      null,
      null,
      null,
      null,
      null,
      '{}'::jsonb
    );
  end loop;
end;
$$;

commit;
