import { supabaseAdmin } from "@/lib/shared/supabase/admin";

/**
 * GLOBAL ERP AUDIT LOGGER
 * NO TENANT LAYER — ORGANIZATION ONLY
 */

export async function createAuditLog({
  organizationId,
  entityType,
  entityId,
  actionType,
  performedBy,
  performedByName = "SYSTEM",
  oldData = null,
  newData = null,
  metadata = {},
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  const { data, error } = await supabaseAdmin
    .from("erp_audit_logs")
    .insert({
      organization_id: organizationId,
      entity_type: entityType,
      entity_id: entityId,
      action_type: actionType,
      performed_by: performedBy,
      performed_by_name: performedByName,
      old_data: oldData,
      new_data: newData,
      metadata,
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}
