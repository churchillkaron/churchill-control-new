import { supabase } from "@/lib/supabase";

export async function runInventoryReconciliation({
  organizationId,
  organization_id,
  entityId = null,
  entity_id = null,
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

  const { data: ledger } =
    await supabase
      .from(
        "inventory_ledger"
      )
      .select("*")
      .eq("organization_id", resolvedOrganizationId)
      .eq("entity_id", resolvedEntityId)
      .eq("item_id", itemId)
      .single();

  if (!ledger) {
    throw new Error(
      "Stock ledger not found"
    );
  }

  const theoretical =
    Number(
      ledger.quantity_on_hand ||
        0
    );

  const variance =
    Number(actualQuantity || 0) -
    theoretical;

  const varianceValue =
    variance *
    Number(
      ledger.weighted_average_cost ||
        0
    );

  const { data, error } =
    await supabase
      .from(
        "inventory_reconciliation_variances"
      )
      .insert({
        organization_id: resolvedOrganizationId,
        entity_id: resolvedEntityId,
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
