alter table public.purchase_orders
  add column if not exists approved_at timestamptz;

comment on column public.purchase_orders.approved_at is
  'Timestamp of customer-side purchase order approval. Supplier acknowledgement and fulfillment remain in supplier_purchase_order_responses.';
