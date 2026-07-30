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
  auto_topup_threshold