begin;

alter table public.payments
  add column if not exists order_id uuid,
  add column if not exists session_id uuid,
  add column if not exists payment_reference text,
  add column if not exists payment_method text,
  add column if not exists status text default 'PENDING',
  add column if not exists paid_at timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.orders
  add column if not exists session_id uuid,
  add column if not exists payment_status text default 'UNPAID',
  add column if not exists production_status text default 'PENDING',
  add column if not exists subtotal numeric(18,2) not null default 0,
  add column if not exists service_charge_amount numeric(18,2) not null default 0,
  add column if not exists vat_amount numeric(18,2) not null default 0,
  add column if not exists discount_amount numeric(18,2) not null default 0,
  add column if not exists total numeric(18,2) not null default 0,
  add column if not exists total_amount numeric(18,2) not null default 0,
  add column if not exists amount_paid numeric(18,2) not null default 0,
  add column if not exists remaining_balance numeric(18,2),
  add column if not exists payment_method text,
  add column if not exists paid_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists updated_at timestamptz default now();

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

create index if not exists payments_organization_order_idx
  on public.payments (organization_id, order_id)
  where order_id is not null;

create index if not exists payments_organization_session_idx
  on public.payments (organization_id, session_id)
  where session_id is not null;

create index if not exists payments_organization_reference_idx
  on public.payments (organization_id, payment_reference)
  where payment_reference is not null;

create index if not exists restaurant_payment_allocations_org_payment_idx
  on public.restaurant_payment_allocations (organization_id, payment_id);

create index if not exists restaurant_payment_allocations_org_order_idx
  on public.restaurant_payment_allocations (organization_id, order_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payments_order_id_fkey'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments
      add constraint payments_order_id_fkey
      foreign key (order_id)
      references public.orders(id)
      on delete set null
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'payments_session_id_fkey'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments
      add constraint payments_session_id_fkey
      foreign key (session_id)
      references public.table_sessions(id)
      on delete set null
      not valid;
  end if;
end;
$$;

with single_order_allocations as (
  select
    payment_id,
    ((array_agg(order_id::text order by order_id::text))[1])::uuid as order_id
  from public.restaurant_payment_allocations
  where order_id is not null
  group by payment_id
  having count(distinct order_id) = 1
)
update public.payments payment
set order_id = allocation.order_id
from single_order_allocations allocation
where payment.id = allocation.payment_id
  and payment.order_id is null;

update public.payments payment
set session_id = orders.session_id
from public.orders orders
where payment.order_id = orders.id
  and payment.organization_id = orders.organization_id
  and payment.session_id is null
  and orders.session_id is not null;

with item_totals as (
  select
    order_id,
    round(
      coalesce(
        sum(coalesce(price, 0) * greatest(coalesce(quantity, 1), 0)),
        0
      )::numeric,
      2
    ) as subtotal
  from public.order_items
  group by order_id
),
calculated as (
  select
    orders.id,
    item_totals.subtotal,
    round(
      greatest(
        0,
        item_totals.subtotal
          + coalesce(orders.service_charge_amount, 0)
          + coalesce(orders.vat_amount, 0)
          - coalesce(orders.discount_amount, 0)
      )::numeric,
      2
    ) as total_amount
  from public.orders orders
  join item_totals
    on item_totals.order_id = orders.id
  where item_totals.subtotal > 0
)
update public.orders orders
set
  subtotal = case
    when coalesce(orders.subtotal, 0) <= 0 then calculated.subtotal
    else orders.subtotal
  end,
  total_amount = case
    when coalesce(orders.total_amount, 0) <= 0 then calculated.total_amount
    else orders.total_amount
  end,
  total = case
    when coalesce(orders.total, 0) <= 0 then calculated.total_amount
    else orders.total
  end,
  remaining_balance = case
    when upper(coalesce(orders.payment_status, '')) = 'PAID' then 0
    when coalesce(orders.remaining_balance, 0) <= 0 then greatest(
      0,
      calculated.total_amount - coalesce(orders.amount_paid, 0)
    )
    else orders.remaining_balance
  end,
  updated_at = now()
from calculated
where orders.id = calculated.id;

alter table public.payments validate constraint payments_order_id_fkey;
alter table public.payments validate constraint payments_session_id_fkey;

commit;
