import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function createAuditLog({
  tenantId,
  moduleName,
  entityType,
  entityId,
  actionType,
  previousData,
  newData,
  changedBy,
}) {
  const { data, error } =
    await supabase
      .from("finance_audit_logs")
      .insert({
        tenant_id: tenantId,
        module_name: moduleName,
        entity_type: entityType,
        entity_id: entityId,
        action_type: actionType,
        previous_data: previousData,
        new_data: newData,
        changed_by: changedBy,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
