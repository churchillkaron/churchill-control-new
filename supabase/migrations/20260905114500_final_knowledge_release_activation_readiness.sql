begin;

create or replace function public.avantiqo_final_knowledge_release_activation_readiness()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_atomic regprocedure := to_regprocedure(
    'public.avantiqo_commit_final_knowledge_release(uuid,uuid,text,timestamptz,uuid,timestamptz,uuid,timestamptz,jsonb,jsonb,jsonb,jsonb,jsonb,uuid,timestamptz)'
  );
  v_guard regprocedure := to_regprocedure('public.avantiqo_block_final_knowledge_release_receipt_mutation()');
  v_atomic_security_invoker boolean := false;
  v_guard_security_invoker boolean := false;
  v_service_role_execute boolean := false;
  v_anon_execute boolean := false;
  v_authenticated_execute boolean := false;
  v_receipt_trigger boolean := false;
  v_rls boolean := false;
begin
  if v_atomic is not null then
    select not p.prosecdef into v_atomic_security_invoker
    from pg_proc p
    where p.oid = v_atomic::oid;

    v_service_role_execute := has_function_privilege('service_role', v_atomic, 'EXECUTE');
    v_anon_execute := has_function_privilege('anon', v_atomic, 'EXECUTE');
    v_authenticated_execute := has_function_privilege('authenticated', v_atomic, 'EXECUTE');
  end if;

  if v_guard is not null then
    select not p.prosecdef into v_guard_security_invoker
    from pg_proc p
    where p.oid = v_guard::oid;
  end if;

  select exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'intelligence_memories'
      and t.tgname = 'trg_avantiqo_final_knowledge_release_receipt_immutable'
      and not t.tgisinternal
  ) into v_receipt_trigger;

  select coalesce(c.relrowsecurity, false)
  into v_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'intelligence_memories';

  return jsonb_build_object(
    'success', true,
    'contract', 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_DATABASE_READINESS_V1',
    'ready',
      v_atomic is not null
      and v_atomic_security_invoker
      and v_service_role_execute
      and not v_anon_execute
      and not v_authenticated_execute
      and v_guard is not null
      and v_guard_security_invoker
      and v_receipt_trigger
      and v_rls,
    'atomic_release_rpc_present', v_atomic is not null,
    'atomic_release_security_invoker', v_atomic_security_invoker,
    'service_role_execute', v_service_role_execute,
    'anon_execute', v_anon_execute,
    'authenticated_execute', v_authenticated_execute,
    'receipt_mutation_guard_present', v_guard is not null,
    'receipt_guard_security_invoker', v_guard_security_invoker,
    'receipt_immutable_trigger_present', v_receipt_trigger,
    'intelligence_memories_rls', v_rls,
    'secret_material_returned', false
  );
end;
$$;

revoke all on function public.avantiqo_final_knowledge_release_activation_readiness() from public, anon, authenticated;
grant execute on function public.avantiqo_final_knowledge_release_activation_readiness() to service_role;

comment on function public.avantiqo_final_knowledge_release_activation_readiness()
is 'Read-only service-role preflight for the final knowledge release database boundary. Verifies the atomic RPC, SECURITY INVOKER posture, execute grants, immutable receipt trigger, and RLS without exposing secret material.';

commit;
