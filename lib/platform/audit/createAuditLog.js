import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

export async function createAuditLog({
  organizationId = null,
  organization_id = null,
  entityType,
  entityId = null,
  actionType,
  performedBy = null,
  performedByName = "SYSTEM",
  oldData = null,
  newData = null,
  metadata = {},
}) {
  if (!entityType) {
    throw new Error("entityType required");
  }

  if (!actionType) {
    throw new Error("actionType required");
  }

  const resolvedOrganizationId =
    organizationId || organization_id || null;

  const { data, error } =
    await supabaseAdmin
      .from("audit_logs")
      .insert({
        organization_id: resolvedOrganizationId,
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

  if (error) {
    throw error;
  }

  return data;
}
