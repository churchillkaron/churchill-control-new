begin;

revoke all on function public.record_system_event_atomic(uuid, text, jsonb, text)
  from public, anon, authenticated;

grant execute on function public.record_system_event_atomic(uuid, text, jsonb, text)
  to service_role;

commit;
