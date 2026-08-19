revoke execute on function public.get_operations_event_delivery_health(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.publish_operations_event_batch(uuid, integer) from public, anon, authenticated;
revoke execute on function public.retry_operations_dead_letter(uuid, uuid, uuid, uuid) from public, anon, authenticated;

grant execute on function public.get_operations_event_delivery_health(uuid, uuid, uuid, integer) to service_role;
grant execute on function public.publish_operations_event_batch(uuid, integer) to service_role;
grant execute on function public.retry_operations_dead_letter(uuid, uuid, uuid, uuid) to service_role;
