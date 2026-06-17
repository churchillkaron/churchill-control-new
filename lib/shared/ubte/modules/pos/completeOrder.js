import { executeTransaction } from "@/lib/shared/ubte/executeTransaction";
import { POS_EVENTS } from "@/lib/shared/realtime/posEventBus";

/**
 * COMPLETE ORDER (UBTE STANDARDIZED)
 */

export function completeOrderTransaction({
  supabase,
  tenant_id,
  order_id,
  total
}) {
  return executeTransaction({
    tenant_id,
    order_id,
    event: POS_EVENTS.ORDER_COMPLETED,
    action: "complete-order",

    db: async () => {
      return await supabase
        .from("pos_orders")
        .update({
          status: "completed",
          total,
          completed_at: new Date().toISOString()
        })
        .eq("id", order_id)
        .select()
        .single();
    },

    payload: {
      total
    }
  });
}
