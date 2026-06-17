import { createServerSupabase } from "@/lib/shared/supabase/server";
import { emitAccountingEvent } from "./emitAccountingEvent";

export async function emitInventoryWasteEvent({
  tenantId,
  wasteId,
  amount,
  department,
  reason,
  entryDate,
}) {
  return await emitAccountingEvent({
    tenantId,
    eventType: "INVENTORY_WASTE",
    sourceModule: "inventory",
    sourceId: wasteId,
    payload: {
      amount,
      department,
      reason,
      entryDate,
      description:
        "Inventory waste posting",
    },
  });
}
