import { createServerSupabase } from "@/lib/shared/supabase/server";
import { emitAccountingEvent } from "./emitAccountingEvent";

export async function emitInventoryReceiptEvent({
  tenantId,
  receiptId,
  supplierId,
  amount,
  taxAmount,
  inventoryLocation,
  entryDate,
}) {
  return await emitAccountingEvent({
    tenantId,
    eventType: "INVENTORY_RECEIPT",
    sourceModule: "inventory",
    sourceId: receiptId,
    payload: {
      supplierId,
      amount,
      taxAmount,
      inventoryLocation,
      entryDate,
      description:
        "Inventory receipt posting",
    },
  });
}
