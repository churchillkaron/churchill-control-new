-- P0 security convergence: later function replacement drifted claim_system_events
-- back to browser-executable privileges. Restore the server-worker contract.

begin;

revoke all on function public.record_system_event_atomic(uuid, text, jsonb, text)
  from public, anon, authenticated;
revoke all on function public.claim_system_events(integer, uuid, text, integer)
  from public, anon, authenticated;

grant execute on function public.record_system_event_atomic(uuid, text, jsonb, text)
  to service_role;
grant execute on function public.claim_system_events(integer, uuid, text, integer)
  to service_role;

commit;
