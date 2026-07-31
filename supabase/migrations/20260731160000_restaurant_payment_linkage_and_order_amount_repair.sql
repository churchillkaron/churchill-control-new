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
  where order_id is not