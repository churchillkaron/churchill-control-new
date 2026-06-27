import { createServerSupabase } from "@/lib/shared/supabase/server";
import { emitAccountingEvent } from "../accounting/emitAccountingEvent";

export async function emitInventoryWasteEvent({
  organizationId,
  wasteId,
  amount,
  department,
  reason,
  entryDate,
}) {
  return await emitAccountingEvent({
    organizationId,
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
