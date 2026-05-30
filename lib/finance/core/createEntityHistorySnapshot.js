import { supabase } from "@/lib/supabase";

export async function createEntityHistorySnapshot({
  tenantId,
  entityType,
  entityId,
  historySnapshot,
  snapshotType = "version",
}) {
  const { data, error } =
    await supabase
      .from("finance_entity_history")
      .insert({
        tenant_id: tenantId,
        entity_type: entityType,
        entity_id: entityId,
        history_snapshot: historySnapshot,
        snapshot_type: snapshotType,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
