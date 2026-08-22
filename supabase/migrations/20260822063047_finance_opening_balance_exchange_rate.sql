alter table public.finance_opening_balance_batches
  add column if not exists exchange_rate numeric(20,10) not null default 1;

alter table public.finance_opening_balance_batches
  drop constraint if exists finance_opening_balance_batches_exchange_rate_chk;

alter table public.finance_opening_balance_batches
  add constraint finance_opening_balance_batches_exchange_rate_chk
  check (exchange_rate > 0);
