begin;

alter table public.market_paper_orders
  add column if not exists time_in_force text not null default 'DAY',
  add column if not exists expires_at timestamptz,
  add column if not exists expired_at timestamptz,
  add column if not exists lifecycle_reason text;

alter table public.market_paper_orders
  drop constraint if exists market_paper_order_status_check;
alter table public.market_paper_orders
  add constraint market_paper_order_status_check
  check (status in ('QUEUED','FILLED','REJECTED','CANCELLED','EXPIRED'));

alter table public.market_paper_orders
  drop constraint if exists market_paper_order_time_in_force_check;
alter table public.market_paper_orders
  add constraint market_paper_order_time_in_force_check
  check (time_in_force in ('DAY','GTC'));

alter table public.market_paper_orders
  drop constraint if exists market_paper_order_expiry_state_check;
alter table public.market_paper_orders
  add constraint market_paper_order_expiry_state_check
  check (
    (status = 'EXPIRED' and expired_at is not null)
    or
    (status <> 'EXPIRED')
  );

create index if not exists market_paper_orders_expiry_idx
  on public.market_paper_orders (
    organization_id,
    portfolio_id,
    status,
    expires_at
  )
  where status = 'QUEUED';

comment on column public.market_paper_orders.time_in_force is
  'PAPER order lifetime. DAY expires at the authoritative Alpaca next market close. GTC may persist, but never beyond its governed decision expiry.';
comment on column public.market_paper_orders.expires_at is
  'Deterministic PAPER order expiry timestamp. Even GTC orders are bounded by the authorizing decision expiry.';
comment on column public.market_paper_orders.lifecycle_reason is
  'Durable reason for lifecycle termination such as ORDER_TIF_EXPIRED or GOVERNED_DECISION_EXPIRED.';

commit;
