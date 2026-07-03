import { supabaseAdmin } from "@/lib/shared/supabase/admin";

/**
 * ERP AUDIT (NO TENANT)
 */

export async function logEvent({
  organizationId,
  eventType,
  entityId,
  payload,
  status = "OK",
}) {
  try {
    await supabaseAdmin
      .from("erp_audit_logs")
      .insert({
        organization_id: organizationId,
        event_type: eventType,
        entity_id: entityId,
        payload,
        status,
      });
  } catch (err) {
    console.error("AUDIT LOG FAILED:", err);
  }
}
