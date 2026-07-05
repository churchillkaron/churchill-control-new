import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { createInventoryMovement } from "@/lib/inventory/movements/createInventoryMovement";

export async function finalizeStockCount({
  organization_id,
  organizationId,
  entity_id = null,
  entityId = null,
  sessionId,
  finalizedBy = "SYSTEM",
}) {
  const resolvedOrganizationId =
    organization_id || organizationId;

  const resolvedEntityId =
    entity_id || entityId || null;

  if (!resolvedOrganizationId) {
    throw new Error("organization_id required");
  }

  if (!sessionId) {
    throw new Error("sessionId required");
  }

  const { data: items, error: itemsError } =
    await supabaseAdmin
      .from("stock_count_items")
      .select("*")
      .eq("session_id", sessionId);

  if (itemsError) {
    throw itemsError;
  }

  const movements = [];

  for (const item of items || []) {
    const varianceQuantity =
      Number(item.variance_quantity || 0);

    if (varianceQuantity === 0) {
      continue;
    }

    const movementType =
      varianceQuantity > 0
        ? "ADJUSTMENT_IN"
        : "ADJUSTMENT_OUT";

    const { data: valuation } =
      await supabaseAdmin
        .from("inventory_valuation_snapshots")
        .select("*")
        .eq("organization_id", resolvedOrganizationId)
        .eq("ingredient_id", item.ingredient_id)
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .maybeSingle();

    const unitCost =
      Number(
        valuation?.average_unit_cost ||
        item.unit_cost ||
        0
      );

    const movement =
      await createInventoryMovement({
        organizationId: resolvedOrganizationId,
        entityId: resolvedEntityId,
        ingredientId: item.ingredient_id,
        movementType,
        quantity: Math.abs(varianceQuantity),
        unitCost,
        referenceType: "STOCK_COUNT",
        referenceId: sessionId,
        sourceModule: "inventory",
        sourceDocument: "stock_count_sessions",
        sourceDocumentId: sessionId,
        notes: "Stock count finalization",
        createdBy: finalizedBy,
        postToFinance: Boolean(resolvedEntityId),
      });

    movements.push(movement);
  }

  const { error: updateError } =
    await supabaseAdmin
      .from("stock_count_sessions")
      .update({
        finalized: true,
        count_status: "finalized",
      })
      .eq("id", sessionId);

  if (updateError) {
    throw updateError;
  }

  return {
    success: true,
    movements,
  };
}
