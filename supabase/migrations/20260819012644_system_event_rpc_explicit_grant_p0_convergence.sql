-- P0 production-security convergence.
-- Keep system-event lifecycle RPCs callable only by trusted server workers.

REVOKE ALL ON FUNCTION public.claim_system_events(integer, uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_system_events(integer, uuid, text, integer) FROM anon;
REVOKE ALL ON FUNCTION public.claim_system_events(integer, uuid, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_system_events(integer, uuid, text, integer) TO service_role;

REVOKE ALL ON FUNCTION public.record_system_event_atomic(uuid, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_system_event_atomic(uuid, text, jsonb, text) FROM anon;
REVOKE ALL ON FUNCTION public.record_system_event_atomic(uuid, text, jsonb, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_system_event_atomic(uuid, text, jsonb, text) TO service_role;
