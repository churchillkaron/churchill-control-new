begin;

create index if not exists commercial_quotations_entity_idx
  on public.commercial_quotations (entity_id);

create index if not exists commercial_quotations_sales_order_idx
  on public.commercial_quotations (sales_order_id)
  where sales_order_id is not null;

revoke execute on function public.finance_settle_sales_order_cash_idempotent(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  numeric,
  uuid,
  text,
  numeric,
  date,
  text,
  text,
  text,
  jsonb,
  text
) from public, anon, authenticated;

grant execute on function public.finance_settle_sales_order_cash_idempotent(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  numeric,
  uuid,
  text,
  numeric,
  date,
  text,
  text,
  text,
  jsonb,
  text
) to service_role;

comment on function public.finance_settle_sales_order_cash_idempotent(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  numeric,
  uuid,
  text,
  numeric,
  date,
  text,
  text,
  text,
  jsonb,
  text
) is
  'Server-only atomic cash settlement for one organization- and entity-scoped sales order.';

notify pgrst, 'reload schema';

commit;
