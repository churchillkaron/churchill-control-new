import { supabase } from "@/lib/supabase";

import { createInventoryMovement } from "./createInventoryMovement";
import { updateStockLedger } from "./updateStockLedger";

export async function finalizeStockCount({
  tenantId,
  sessionId,
}) {
  const items =
    await supabase
      .from("stock_count_items")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("session_id", sessionId);

  for (const item of items.data || []) {
    if (
      Number(
        item.variance_quantity || 0
      ) === 0
    ) {
      continue;
    }

    const movementType =
      item.variance_quantity > 0
        ? "ADJUSTMENT_IN"
        : "ADJUSTMENT_OUT";

    const ledger =
      await supabase
        .from(
          "inventory_stock_ledger"
        )
        .select("*")
        .eq(
          "tenant_id",
          tenantId
        )
        .eq(
          "item_id",
          item.item_id
        )
        .single();

    const averageCost =
      Number(
        ledger.data
          ?.weighted_average_cost ||
          0
      );

    await createInventoryMovement({
      tenantId,
      itemId: item.item_id,
      movementType,
      quantity: Math.abs(
        Number(
          item.variance_quantity
        )
      ),
      unitCost: averageCost,
      referenceType:
        "STOCK_COUNT",
      referenceId: sessionId,
    });

    await updateStockLedger({
      tenantId,
      itemId: item.item_id,
    });
  }

  await supabase
    .from("stock_count_sessions")
    .update({
      finalized: true,
      count_status:
        "finalized",
    })
    .eq("id", sessionId);

  return {
    success: true,
  };
}
