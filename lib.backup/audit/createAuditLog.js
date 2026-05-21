import { supabase } from "@/lib/shared/supabase/client";

export async function createAuditLog({

  tenantId,

  entityType,

  entityId = null,

  actionType,

  performedBy = null,

  performedByName = "SYSTEM",

  oldData = null,

  newData = null,

  metadata = {},

}) {

  const {
    data,
    error,
  } = await supabase
    .from("audit_logs")
    .insert({

      tenant_id:
        tenantId,

      entity_type:
        entityType,

      entity_id:
        entityId,

      action_type:
        actionType,

      performed_by:
        performedBy,

      performed_by_name:
        performedByName,

      old_data:
        oldData,

      new_data:
        newData,

      metadata,
    })
    .select()
    .single();

  if (error) {

    console.error(
      "AUDIT LOG ERROR",
      error
    );

    throw error;
  }

  return data;
}
