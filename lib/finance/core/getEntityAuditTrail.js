import { supabase } from "@/lib/supabase";

export async function getEntityAuditTrail({
  tenantId,
  entityType,
  entityId,
}) {
  const { data, error } =
    await supabase
      .from("immutable_audit_chain")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", {
        ascending: false,
      });

  if (error) {
    throw error;
  }

  return data;
}
