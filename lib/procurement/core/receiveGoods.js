import { supabase } from "@/lib/supabase";

import { createInventoryMovement } from "@/lib/inventory/core/createInventoryMovement";
import { updateStockLedger } from "@/lib/inventory/core/updateStockLedger";

export async function receiveGoods({
  tenantId,
  purchaseOrderId,
  itemId,
  quantity,
  unitCost,
}) {
  const total =
    Number(quantity || 0) *
    Number(unitCost || 0);

  const { data, error } =
    await supabase
      .from("goods_receipts")
      .insert({
        tenant_id: tenantId,
        purchase_order_id:
          purchaseOrderId,
        receipt_total: total,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  await createInventoryMovement({
    tenantId,
    itemId,
    movementType:
      "PURCHASE",
    quantity,
    unitCost,
    referenceType:
      "GOODS_RECEIPT",
    referenceId: data.id,
  });

  await updateStockLedger({
    tenantId,
    itemId,
  });

  return data;
}
