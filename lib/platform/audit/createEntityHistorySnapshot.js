import { supabase } from "@/lib/supabase";

export async function createEntityHistorySnapshot({
  organizationId,
  organization_id,
  entityType,
  entityId,
  historySnapshot,
  snapshotType = "version",
}) {
  const resolvedOrganizationId =
    organizationId || organization_id;

  if (!resolvedOrganizationId) {
    throw new Error("organizationId required");
  }

  const { data, error } =
    await supabase
      .from("finance_entity_history")
      .insert({
        organization_id: resolvedOrganizationId,
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
