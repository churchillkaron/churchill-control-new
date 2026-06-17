import { executeTransaction } from "@/lib/shared/ubte/executeTransaction";
import { POS_EVENTS } from "@/lib/shared/realtime/posEventBus";

/**
 * VOID / REFUND TRANSACTION (UBTE SAFE REVERSAL)
 */

export function voidTransaction({
  supabase,
  tenant_id,
  order_id,
  reason = "no_reason"
}) {
  return executeTransaction({
    tenant_id,
    order_id,
    event: POS_EVENTS.ORDER_UPDATED,
    action: "void",

    db: async () => {
      // 1. mark order as voided (NO deletion allowed)
      const { data, error } = await supabase
        .from("pos_orders")
        .update({
          status: "voided",
          void_reason: reason,
          voided_at: new Date().toISOString()
        })
        .eq("id", order_id)
        .select()
        .single();

      if (error) throw error;

      // 2. reverse payments (soft reversal, not delete)
      await supabase
        .from("pos_payments")
        .update({
          status: "reversed",
          reversed_at: new Date().toISOString(),
          reason
        })
        .eq("order_id", order_id);

      return data;
    },

    payload: {
      reason
    }
  });
}
