import { supabase } from "@/lib/supabase";

export async function getStateHistory({
  tenantId,
  entityType,
  entityId,
}) {
  const { data, error } =
    await supabase
      .from(
        "orchestration_state_transitions"
      )
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", {
        ascending: true,
      });

  if (error) {
    throw error;
  }

  return data;
}
