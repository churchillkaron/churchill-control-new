import { createServerSupabase } from "@/lib/shared/supabase/server";
import { emitAccountingEvent } from "./emitAccountingEvent";

export async function emitInventoryConsumptionEvent({
  tenantId,
  productionId,
  amount,
  department,
  costCenter,
  entryDate,
}) {
  return await emitAccountingEvent({
    tenantId,
    eventType: "INVENTORY_CONSUMPTION",
    sourceModule: "production",
    sourceId: productionId,
    payload: {
      amount,
      department,
      costCenter,
      entryDate,
      description:
        "Inventory consumption posting",
    },
  });
}
