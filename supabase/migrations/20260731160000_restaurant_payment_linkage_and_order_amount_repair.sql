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

create index if not exists payments_organization_order_idx
  on public.payments (organization_id, order_id)
  where order_id is not null;

create index if not exists payments_organization_session_idx
  on public.payments (organization_id, session_id)
  where session_id is not null;

create unique index if not exists payments_organization_reference_uidx
  on public.payments (organization_id, payment_reference)
  where payment_reference is not null;

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
    min(order_id) as order_id
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
          + coalesce(orders.vat_amount, orders.tax_amount, 0)
          - coalesce(orders.discount_amount, 0)
      )::numeric,
      2
    ) as total_amount
  from public.orders orders
  join item_totals on item_totals.order_id = orders.id
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
    when coalesce(orders.remaining_balance, 0) <= 0
      and coalesce(orders.payment_status, '') <> 'PAID'
    then greatest(
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
