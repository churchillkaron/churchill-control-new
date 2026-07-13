import { supabase } from "@/lib/supabase";

export async function runTheoreticalVsActual({
  organizationId,
  organization_id,
  entityId = null,
  entity_id = null,
  sessionId,
  itemId,
  actualQuantity,
}) {
  const resolvedOrganizationId =
    organizationId || organization_id;

  const resolvedEntityId =
    entityId || entity_id || null;

  if (!resolvedOrganizationId) {
    throw new Error("organizationId required");
  }

  if (!resolvedEntityId) {
    throw new Error("entityId required");
  }

  const ledger =
    await supabase
      .from(
        "inventory_ledger"
      )
      .select("*")
      .eq("organization_id", resolvedOrganizationId)
      .eq("entity_id", resolvedEntityId)
      .eq("item_id", itemId)
      .single();

  if (!ledger.data) {
    throw new Error(
      "Inventory ledger missing"
    );
  }

  const theoretical =
    Number(
      ledger.data
        .quantity_on_hand || 0
    );

  const averageCost =
    Number(
      ledger.data
        .weighted_average_cost ||
        0
    );

  const variance =
    Number(actualQuantity || 0) -
    theoretical;

  const varianceValue =
    variance * averageCost;

  const { data, error } =
    await supabase
      .from("stock_count_items")
      .insert({
        organization_id: resolvedOrganizationId,
        entity_id: resolvedEntityId,
        session_id: sessionId,
        item_id: itemId,
        theoretical_quantity:
          theoretical,
        actual_quantity:
          actualQuantity,
        variance_quantity:
          variance,
        variance_value:
          varianceValue,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
