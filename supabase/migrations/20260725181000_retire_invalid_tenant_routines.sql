begin;

-- Avantiqo is organization-scoped and has no tenant runtime. Retire only
-- routines whose stored source still contains tenant-era identifiers or known
-- removed legacy relations. Tables and business data are not changed.

do $$
declare
  routine record;
  retired_count integer := 0;
begin
  for routine in
    select
      namespace.nspname as schema_name,
      procedure.proname as routine_name,
      pg_get_function_identity_arguments(procedure.oid) as identity_arguments
    from pg_proc procedure
    join pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prokind = 'f'
      and (
        procedure.prosrc ilike '%tenant_id%'
        or procedure.prosrc ilike '%get_my_tenant_id%'
        or procedure.prosrc ilike '%ingredient_stock%'
        or procedure.prosrc ilike '%kitchen_station_performance%'
        or procedure.prosrc ilike '%expenses%'
      )
      and procedure.proname in (
        'disconnect_websocket_session',
        'decrement_dish_stock',
        'decrement_ingredient_stock',
        'log_security_event',
        'request_approval',
        'calculate_kitchen_station_performance',
        'create_backup_job',
        'mark_websocket_event_delivered',
        'apply_dynamic_pricing',
        'process_approval',
        'run_enterprise_health_checks',
        'retry_failed_websocket_events',
        'generate_labor_shift_forecasts',
        'mark_announcement_as_read',
        'run_production_atomic',
        'is_period_open',
        'generate_enterprise_audit_summary',
        'close_financial_period',
        'generate_ai_business_insights',
        'assign_customer_segments',
        'get_ai_agent_memory',
        'execute_enterprise_workflow_steps',
        'publish_realtime_event',
        'update_realtime_presence',
        'generate_ai_recommendations',
        'cleanup_stale_presence',
        'process_pending_ai_agent_tasks',
        'consume_inventory_fifo',
        'generate_executive_dashboard_snapshot',
        'generate_cross_location_consolidation',
        'cleanup_expired_ai_agent_memory',
        'process_scheduled_integrations',
        'process_production_run',
        'generate_ai_forecasts',
        'execute_approval',
        'generate_inventory_snapshot',
        'create_enterprise_notification',
        'cleanup_expired_rate_limit_logs',
        'check_inventory_alerts',
        'approve_enterprise_document',
        'revoke_enterprise_api_key',
        'process_warehouse_transfer',
        'generate_automated_notifications',
        'decrement_stock',
        'log_api_access',
        'register_websocket_session',
        'trigger_event_workflows',
        'launch_marketing_campaign',
        'generate_marketing_campaign_analytics',
        'generate_ai_campaign_recommendations',
        'create_ai_agent_task',
        'process_ai_agent_task',
        'upsert_ai_agent_memory',
        'create_enterprise_document',
        'create_enterprise_document_version',
        'log_enterprise_document_access',
        'run_system_job',
        'execute_enterprise_workflow',
        'sync_enterprise_integration',
        'register_enterprise_api_key',
        'process_pending_webhook_deliveries',
        'queue_notification_from_template',
        'process_notification_queue',
        'create_enterprise_audit_event',
        'create_security_incident',
        'generate_system_health_snapshot',
        'detect_suspicious_api_key_activity',
        'is_feature_enabled',
        'set_feature_flag',
        'check_rate_limit'
      )
  loop
    execute format(
      'drop function if exists %I.%I(%s)',
      routine.schema_name,
      routine.routine_name,
      routine.identity_arguments
    );

    retired_count := retired_count + 1;
  end loop;

  raise notice 'Retired % invalid tenant-era routine(s)', retired_count;
end;
$$;

notify pgrst, 'reload schema';

commit;
