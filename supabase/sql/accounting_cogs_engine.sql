create table if not exists cogs_postings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  sale_event_id text not null,
  item_id text not null,
  quantity numeric(14,4) default 0,
  revenue_amount numeric(14,2) default 0,
  cogs_amount numeric(14,2) default 0,
  gross_profit numeric(14,2) default 0,
  gross_margin numeric(14,4) default 0,
  created_at timestamptz default now()
);
