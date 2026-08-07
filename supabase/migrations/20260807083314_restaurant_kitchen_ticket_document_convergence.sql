create table if not exists public.kitchen_tickets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  order_id uuid not null references public.orders(id),
  session_id uuid null references public.table_sessions(id),
  table_id uuid null references public.restaurant_tables(id),
  table_number text null,
  work_center_id uuid not null references public.work_centers(id),
  station text null,
  status text not null default 'NEW',
  items jsonb not null default '[]'::jsonb,
  started_at timestamptz null,
  ready_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kitchen_tickets_items_array check (jsonb_typeof(items) = 'array'),
  constraint kitchen_tickets_status_check check (
    status in ('NEW','IN_PROGRESS','PREPARING','READY','SERVED','COMPLETED','CANCELLED','VOID')
  )
);

create index if not exists ix_kitchen_tickets_org_created
  on public.kitchen_tickets (organization_id, created_at desc);

create index if not exists ix_kitchen_tickets_org_order
  on public.kitchen_tickets (organization_id, order_id);

create index if not exists ix_kitchen_tickets_org_work_center
  on public.kitchen_tickets (organization_id, work_center_id, status, created_at);

create unique index if not exists ux_kitchen_tickets_active_order_work_center
  on public.kitchen_tickets (organization_id, order_id, work_center_id)
  where status not in ('COMPLETED','SERVED','CANCELLED','VOID');

alter table public.kitchen_tickets enable row level security;

revoke all on table public.kitchen_tickets from anon, authenticated;
grant select, insert, update, delete on table public.kitchen_tickets to service_role;

comment on table public.kitchen_tickets is
  'Canonical Restaurant Kitchen ticket document store. Operations consumes these documents through neutral fulfillment adapters; legacy work_center_tickets remain historical pre-convergence data only.';

comment on column public.kitchen_tickets.items is
  'Ordered JSON array of Restaurant Kitchen work items. New items retain order_item_id for idempotent dispatch and lifecycle correlation.';
