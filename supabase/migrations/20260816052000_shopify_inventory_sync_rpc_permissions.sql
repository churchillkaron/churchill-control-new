begin;

revoke all on function public.claim_shopify_inventory_sync_events(integer, integer)
  from public, anon, authenticated;

grant execute on function public.claim_shopify_inventory_sync_events(integer, integer)
  to service_role;

commit;
