begin;

alter table public.orders
  add column if not exists amount_paid numeric(18,2) not null default 0,
  add column if not exists remaining_balance numeric(18,2),
  add column if not exists payment_method text,
  add column if not exists paid_at timestamptz,
  add column if not exists completed_at timestamptz;

alter table public.table_sessions
  add column if not exists closed_at timestamptz;

create table if not exists public.restaurant_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  payment_id uuid not null references public.payments(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete cascade,
  allocation_type text not null default 'ORDER',
  amount numeric(18,2) not null check (amount >= 0),
  created_at timestamptz not null default now()
);

create index if not exists restaurant_payment_allocations_org_payment_idx
  on public.restaurant_payment_allocations (organization_id, payment_id);

create index if not exists restaurant_payment_allocations_org_order_idx
  on public.restaurant_payment_allocations (organization_id, order_id);

commit;
