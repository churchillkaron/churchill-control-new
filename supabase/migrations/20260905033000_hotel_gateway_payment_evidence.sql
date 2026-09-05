alter table public.hotel_payment_transactions
  add column if not exists provider text,
  add column if not exists provider_session_id text,
  add column if not exists provider_payment_id text,
  add column if not exists provider_refund_id text,
  add column if not exists provider_event_id text,
  add column if not exists description text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.hotel_payment_transactions
set provider = 'STRIPE'
where processor_mode = 'AVANTIQO_GATEWAY' and provider is null;

create unique index if not exists hotel_payment_transactions_provider_session_uidx
  on public.hotel_payment_transactions (provider, provider_session_id)
  where provider is not null and provider_session_id is not null;

create index if not exists hotel_payment_transactions_provider_payment_idx
  on public.hotel_payment_transactions (provider, provider_payment_id)
  where provider is not null and provider_payment_id is not null;

create index if not exists hotel_payment_transactions_provider_refund_idx
  on public.hotel_payment_transactions (provider, provider_refund_id)
  where provider is not null and provider_refund_id is not null;

create unique index if not exists hotel_payment_transactions_provider_event_uidx
  on public.hotel_payment_transactions (provider, provider_event_id)
  where provider is not null and provider_event_id is not null;

comment on column public.hotel_payment_transactions.provider_payment_id is
  'Provider payment object identifier only; never raw card or bank credentials.';
comment on column public.hotel_payment_transactions.metadata is
  'Non-sensitive gateway and reconciliation evidence. Raw payment credentials are prohibited.';
