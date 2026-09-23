create table if not exists public.supplier_purchase_order_responses (
  id uuid primary key default gen_random_uuid(),
  supplier_account_id uuid not null references public.supplier_portal_accounts(id) on delete cascade,
  supplier_portal_access_id uuid not null references public.supplier_portal_access(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  supplier_party_id uuid not null references public.parties(id) on delete cascade,
  response_status text not null default 'PENDING'
    check (response_status in ('PENDING','ACKNOWLEDGED','DECLINED','IN_FULFILLMENT','DISPATCHED')),
  supplier_note text,
  promised_delivery_date date,
  dispatched_at timestamptz,
  dispatch_reference text,
  created_by_auth_user_id uuid references auth.users(id) on delete set null,
  updated_by_auth_user_id uuid references auth.users(id) on delete set null,
  acknowledged_at timestamptz,
  declined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (supplier_account_id, purchase_order_id)
);

create index if not exists supplier_po_responses_customer_idx
  on public.supplier_purchase_order_responses(organization_id, purchase_order_id);
create index if not exists supplier_po_responses_supplier_idx
  on public.supplier_purchase_order_responses(supplier_account_id, response_status, updated_at desc);

alter table public.supplier_purchase_order_responses enable row level security;
revoke all on table public.supplier_purchase_order_responses from anon, authenticated;
grant select, insert, update, delete on table public.supplier_purchase_order_responses to service_role;

comment on table public.supplier_purchase_order_responses is
  'Supplier-side acknowledgement and fulfillment projection for customer purchase orders. Buyer purchase_order status and customer receiving remain customer-controlled.';
