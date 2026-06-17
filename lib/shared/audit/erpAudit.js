import { supabaseAdmin } from "@/lib/shared/supabase/admin";

/**
 * GLOBAL ERP AUDIT LOGGER
 * Tracks ALL critical system events
 */

export async function logEvent({
  tenantId,
  eventType,
  entityId,
  payload,
  status = "OK"
}) {

  try {

    await supabaseAdmin
      .from("erp_audit_logs")
      .insert({
        tenant_id: tenantId,
        event_type: eventType,
        entity_id: entityId,
        payload,
        status
      });

  } catch (err) {
    console.error("AUDIT LOG FAILED:", err);
  }
}
