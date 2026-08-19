-- P0 security convergence: execute_operations_command is invoked only through
-- the server Operations API using the shared service-role/admin client.

begin;

revoke all on function public.execute_operations_command(uuid, uuid, uuid, text, text, text, text, jsonb)
  from public, anon, authenticated;

grant execute on function public.execute_operations_command(uuid, uuid, uuid, text, text, text, text, jsonb)
  to service_role;

commit;
