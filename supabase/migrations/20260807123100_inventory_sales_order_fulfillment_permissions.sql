revoke all on function public.inventory_signed_quantity(text, numeric) from public, anon, authenticated;
grant execute on function public.inventory_signed_quantity(text, numeric) to service_role;

revoke all on function public.inventory_fulfill_sales_order_atomic(uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.inventory_fulfill_sales_order_atomic(uuid, uuid, uuid, uuid, text) to service_role;
