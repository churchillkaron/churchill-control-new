begin;

-- Canonical prepaid service-wallet foundation used by WalletRepository,
-- WalletRuntime and the atomic settlement RPC introduced in the next
-- migration. Currency is always supplied from organization configuration;
-- no jurisdiction-specific default is embedded here.

create table if not exists public.organization_wallets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  currency text not null,
  available_balance numeric(20,4) not null default 0,
  reserved_balance numeric(20,4) not null default 0,
  billing_policy text not null default 'PREPAID',
  auto_topup boolean not null default false,
  auto_topup_threshold numeric(20,4) not null default 0,
  auto_topup_amount numeric(20,4) not null default 0,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_wallets_currency_required
    check (nullif(btrim(currency), '') is not null),
  constraint organization_wallets_available_nonnegative
    check (available_balance >= 0),
  constraint organization_wallets_reserved_nonnegative
    check (reserved_balance >= 0),
  constraint organization_wallets_auto_topup_threshold_nonnegative
    check (auto_topup_threshold >= 0),
  constraint organization_wallets_auto_topup_amount_nonnegative
    check (auto_topup_amount >= 0)
);

create index if not exists organization_wallets_organization_idx
  on public.organization_wallets (organization_id);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  party_id uuid,
  entity_id uuid,
  wallet_id uuid not null,
  type text not null,
  amount numeric(20,4) not null,
  currency text not null,
  provider text,
  usage_id uuid,
  invoice_id uuid,
  reference text,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint wallet_transactions_wallet_id_fkey
    foreign key (wallet_id)
    references public.organization_wallets(id)
    on delete restrict,
  constraint wallet_transactions_amount_nonnegative
    check (amount >= 0),
  constraint wallet_transactions_currency_required
    check (nullif(btrim(currency), '') is not null),
  constraint wallet_transactions_type_required
    check (nullif(btrim(type), '') is not null)
);

create index if not exists wallet_transactions_organization_created_idx
  on public.wallet_transactions (
    organization_id,
    created_at desc
  );

create index if not exists wallet_transactions_wallet_created_idx
  on public.wallet_transactions (
    wallet_id,
    created_at desc
  );

create index if not exists wallet_transactions_usage_idx
  on public.wallet_transactions (organization_id, usage_id)
  where usage_id is not null;

create index if not exists wallet_transactions_invoice_idx
  on public.wallet_transactions (organization_id, invoice_id)
  where invoice_id is not null;

create index if not exists wallet_transactions_reference_idx
  on public.wallet_transactions (organization_id, reference)
  where nullif(btrim(reference), '') is not null;

create or replace function public.organization_wallet_normalize()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.currency := upper(btrim(new.currency));
  new.billing_policy := upper(coalesce(nullif(btrim(new.billing_policy), ''), 'PREPAID'));
  new.status := upper(coalesce(nullif(btrim(new.status), ''), 'ACTIVE'));
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists organization_wallets_normalize_guard
  on public.organization_wallets;

create trigger organization_wallets_normalize_guard
before insert or update
on public.organization_wallets
for each row
execute function public.organization_wallet_normalize();

create or replace function public.wallet_transaction_normalize()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_wallet public.organization_wallets%rowtype;
begin
  select *
  into v_wallet
  from public.organization_wallets
  where id = new.wallet_id;

  if not found then
    raise exception 'WALLET_TRANSACTION_WALLET_MISSING';
  end if;

  if v_wallet.organization_id <> new.organization_id then
    raise exception 'WALLET_TRANSACTION_ORGANIZATION_MISMATCH';
  end if;

  new.type := upper(btrim(new.type));
  new.currency := upper(btrim(new.currency));
  new.metadata := coalesce(new.metadata, '{}'::jsonb);

  if new.currency <> v_wallet.currency then
    raise exception 'WALLET_TRANSACTION_CURRENCY_MISMATCH:%:%', v_wallet.currency, new.currency;
  end if;

  return new;
end;
$$;

drop trigger if exists wallet_transactions_normalize_guard
  on public.wallet_transactions;

create trigger wallet_transactions_normalize_guard
before insert or update of organization_id, wallet_id, type, currency, metadata
on public.wallet_transactions
for each row
execute function public.wallet_transaction_normalize();

alter table public.organization_wallets enable row level security;
alter table public.wallet_transactions enable row level security;

grant select, insert, update, delete
  on table public.organization_wallets
  to service_role;

grant select, insert, update, delete
  on table public.wallet_transactions
  to service_role;

grant execute
  on function public.organization_wallet_normalize()
  to service_role;

grant execute
  on function public.wallet_transaction_normalize()
  to service_role;

comment on table public.organization_wallets is
  'One organization-scoped prepaid service wallet; uniqueness is enforced by the following atomic settlement migration.';

comment on table public.wallet_transactions is
  'Immutable evidence for wallet reserve, charge, release, top-up and refund operations.';

notify pgrst, 'reload schema';

commit;
