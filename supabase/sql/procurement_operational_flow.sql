create table if not exists purchase_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  requested_by text,
  department text,
  request_status text default 'pending',
  request_total numeric(14,2) default 0,
  created_at timestamptz default now()
);

create table if not exists purchase_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  purchase_request_id uuid,
  vendor_id text,
  po_status text default 'open',
  po_total numeric(14,2) default 0,
  created_at timestamptz default now()
);

create table if not exists goods_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  purchase_order_id uuid,
  receipt_status text default 'received',
  receipt_total numeric(14,2) default 0,
  created_at timestamptz default now()
);

create table if not exists procurement_three_way_match (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  purchase_order_id uuid,
  goods_receipt_id uuid,
  invoice_reference text,
  po_total numeric(14,2) default 0,
  receipt_total numeric(14,2) default 0,
  invoice_total numeric(14,2) default 0,
  variance_amount numeric(14,2) default 0,
  match_status text default 'matched',
  created_at timestamptz default now()
);
