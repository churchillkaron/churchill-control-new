-- AUDIT-ONLY DEPLOYED CONTRACT SNAPSHOT
--
-- This SQL records the Operations deployment assertion already installed in
-- production. It intentionally lives outside supabase/migrations so it cannot
-- become a new pending migration.

create or replace function public.get_operations_deployment_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_checks jsonb := '[]'::jsonb;
  v_missing jsonb := '[]'::jsonb;
  v_ok boolean;
  v_owner_admin_count integer := 0;
  v_contract_version text := '20260728234500';

  procedure add_check(p_key text, p_ok boolean, p_detail jsonb default '{}'::jsonb)
  language plpgsql
  as $procedure$
  begin
    v_checks := v_checks || jsonb_build_array(
      jsonb_build_object(
        'key', p_key,
        'ok', p_ok,
        'detail', coalesce(p_detail, '{}'::jsonb)
      )
    );

    if not p_ok then
      v_missing := v_missing || jsonb_build_array(p_key);
    end if;
  end;
  $procedure$;
begin
  call add_check('operations_records', to_regclass('public.operations_records') is not null);
  call add_check('operations_command_ledger', to_regclass('public.operations_command_ledger') is not null);
  call add_check('operations_event_outbox', to_regclass('public.operations_event_outbox') is not null);
  call add_check('operations_events', to_regclass('public.operations_events') is not null);
  call add_check('operations_roles', to_regclass('public.operations_roles') is not null);
  call add_check('operations_role_permissions', to_regclass('public.operations_role_permissions') is not null);
  call add_check('user_operations_roles', to_regclass('public.user_operations_roles') is not null);

  call add_check(
    'execute_operations_command',
    to_regprocedure('public.execute_operations_command(uuid,uuid,uuid,text,text,text,text,jsonb)') is not null
  );
  call add_check(
    'publish_operations_event_batch',
    to_regprocedure('public.publish_operations_event_batch(uuid,integer)') is not null
  );
  call add_check(
    'get_operations_event_delivery_health',
    to_regprocedure('public.get_operations_event_delivery_health(uuid,uuid,uuid,integer)') is not null
  );
  call add_check(
    'retry_operations_dead_letter',
    to_regprocedure('public.retry_operations_dead_letter(uuid,uuid,uuid,uuid)') is not null
  );
  call add_check(
    'operations_lifecycle_target_status',
    to_regprocedure('public.operations_lifecycle_target_status(text,text,text)') is not null
  );

  call add_check(
    'operations_records_lifecycle_guard',
    exists (
      select 1
      from pg_trigger trigger_row
      join pg_class relation_row on relation_row.oid = trigger_row.tgrelid
      join pg_namespace namespace_row on namespace_row.oid = relation_row.relnamespace
      where namespace_row.nspname = 'public'
        and relation_row.relname = 'operations_records'
        and trigger_row.tgname = 'operations_records_lifecycle_guard'
        and not trigger_row.tgisinternal
        and trigger_row.tgenabled <> 'D'
    )
  );
  call add_check(
    'operations_events_immutable_guard',
    exists (
      select 1
      from pg_trigger trigger_row
      join pg_class relation_row on relation_row.oid = trigger_row.tgrelid
      join pg_namespace namespace_row on namespace_row.oid = relation_row.relnamespace
      where namespace_row.nspname = 'public'
        and relation_row.relname = 'operations_events'
        and trigger_row.tgname = 'operations_events_immutable_guard'
        and not trigger_row.tgisinternal
        and trigger_row.tgenabled <> 'D'
    )
  );
  call add_check(
    'operations_command_ledger_audit_projection',
    exists (
      select 1
      from pg_trigger trigger_row
      join pg_class relation_row on relation_row.oid = trigger_row.tgrelid
      join pg_namespace namespace_row on namespace_row.oid = relation_row.relnamespace
      where namespace_row.nspname = 'public'
        and relation_row.relname = 'operations_command_ledger'
        and trigger_row.tgname = 'operations_command_ledger_audit_projection'
        and not trigger_row.tgisinternal
        and trigger_row.tgenabled <> 'D'
    )
  );

  call add_check(
    'operations_command_ledger.record_id',
    exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'operations_command_ledger'
        and column_name = 'record_id'
        and data_type = 'uuid'
    )
  );
  call add_check(
    'operations_command_ledger.actor_id',
    exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'operations_command_ledger'
        and column_name = 'actor_id'
        and data_type = 'uuid'
    )
  );

  if to_regclass('public.operations_roles') is not null
     and to_regclass('public.operations_role_permissions') is not null then
    call add_check(
      'operations_admin_role',
      exists (
        select 1
        from public.operations_roles role_row
        join public.operations_role_permissions permission_row
          on permission_row.organization_id = role_row.organization_id
         and permission_row.role_id = role_row.id
        where role_row.role_code = 'OPERATIONS_ADMIN'
          and role_row.is_active = true
          and permission_row.permission_key = 'operations.*'
      )
    );
  else
    call add_check('operations_admin_role', false);
  end if;

  if to_regclass('public.user_operations_roles') is not null
     and to_regclass('public.operations_roles') is not null then
    select count(*)
      into v_owner_admin_count
      from public.user_operations_roles assignment_row
      join public.operations_roles role_row
        on role_row.id = assignment_row.role_id
       and role_row.organization_id = assignment_row.organization_id
      where role_row.role_code = 'OPERATIONS_ADMIN'
        and role_row.is_active = true
        and assignment_row.revoked_at is null;
  end if;

  call add_check(
    'operations_admin_assignment',
    v_owner_admin_count > 0,
    jsonb_build_object('active_assignments', v_owner_admin_count)
  );

  v_ok := jsonb_array_length(v_missing) = 0;

  return jsonb_build_object(
    'ok', v_ok,
    'status', case when v_ok then 'healthy' else 'unavailable' end,
    'contract_version', v_contract_version,
    'checked_at', now(),
    'checks', v_checks,
    'missing', v_missing,
    'active_operations_admin_assignments', v_owner_admin_count
  );
end;
$$;

revoke all on function public.get_operations_deployment_status() from public;
grant execute on function public.get_operations_deployment_status() to service_role;

comment on function public.get_operations_deployment_status() is
  'Read-only database deployment assertion for the canonical Operations runtime, lifecycle, event, audit and security contracts.';

do $$
declare
  v_status jsonb;
begin
  select public.get_operations_deployment_status() into v_status;

  if coalesce((v_status ->> 'ok')::boolean, false) is not true then
    raise exception 'Operations deployment contract failed: %', v_status;
  end if;
end;
$$;
