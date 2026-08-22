-- P0 production-security convergence.
-- Trigger functions execute through their owning database triggers and must not
-- remain directly callable through the exposed API roles.

REVOKE ALL ON FUNCTION public.audit_trigger_function() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_trigger_function() FROM anon;
REVOKE ALL ON FUNCTION public.audit_trigger_function() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.audit_trigger_function() TO service_role;

REVOKE ALL ON FUNCTION public.auto_create_kitchen_ticket() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auto_create_kitchen_ticket() FROM anon;
REVOKE ALL ON FUNCTION public.auto_create_kitchen_ticket() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.auto_create_kitchen_ticket() TO service_role;

REVOKE ALL ON FUNCTION public.auto_process_order_production() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auto_process_order_production() FROM anon;
REVOKE ALL ON FUNCTION public.auto_process_order_production() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.auto_process_order_production() TO service_role;

REVOKE ALL ON FUNCTION public.enterprise_document_audit_trigger() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enterprise_document_audit_trigger() FROM anon;
REVOKE ALL ON FUNCTION public.enterprise_document_audit_trigger() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enterprise_document_audit_trigger() TO service_role;

REVOKE ALL ON FUNCTION public.feature_flag_audit_trigger() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.feature_flag_audit_trigger() FROM anon;
REVOKE ALL ON FUNCTION public.feature_flag_audit_trigger() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.feature_flag_audit_trigger() TO service_role;

REVOKE ALL ON FUNCTION public.inventory_realtime_event_trigger() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inventory_realtime_event_trigger() FROM anon;
REVOKE ALL ON FUNCTION public.inventory_realtime_event_trigger() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_realtime_event_trigger() TO service_role;

REVOKE ALL ON FUNCTION public.notification_realtime_event_trigger() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notification_realtime_event_trigger() FROM anon;
REVOKE ALL ON FUNCTION public.notification_realtime_event_trigger() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.notification_realtime_event_trigger() TO service_role;

REVOKE ALL ON FUNCTION public.queue_realtime_event_delivery() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.queue_realtime_event_delivery() FROM anon;
REVOKE ALL ON FUNCTION public.queue_realtime_event_delivery() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.queue_realtime_event_delivery() TO service_role;

REVOKE ALL ON FUNCTION public.queue_webhook_deliveries_for_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.queue_webhook_deliveries_for_event() FROM anon;
REVOKE ALL ON FUNCTION public.queue_webhook_deliveries_for_event() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.queue_webhook_deliveries_for_event() TO service_role;

REVOKE ALL ON FUNCTION public.realtime_workflow_event_trigger() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.realtime_workflow_event_trigger() FROM anon;
REVOKE ALL ON FUNCTION public.realtime_workflow_event_trigger() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.realtime_workflow_event_trigger() TO service_role;

REVOKE ALL ON FUNCTION public.sync_creative_direction_approval_terminal_state() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_creative_direction_approval_terminal_state() FROM anon;
REVOKE ALL ON FUNCTION public.sync_creative_direction_approval_terminal_state() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sync_creative_direction_approval_terminal_state() TO service_role;
