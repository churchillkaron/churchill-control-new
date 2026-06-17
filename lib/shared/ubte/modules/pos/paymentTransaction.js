import { executeTransaction } from "@/lib/shared/ubte/executeTransaction";
import { POS_EVENTS } from "@/lib/shared/realtime/posEventBus";

/**
 * PAYMENT TRANSACTION (UBTE STANDARDIZED)
 * Financially critical operation
 */

export function paymentTransaction({
  supabase,
  tenant_id,
  order_id,
  payment
}) {
  return executeTransaction({
    tenant_id,
    order_id,
    event: POS_EVENTS.ORDER_UPDATED,
    action: "payment",

    db: async () => {
      // 1. create payment record
      const { data, error } = await supabase
        .from("pos_payments")
        .insert({
          order_id,
          amount: payment.amount,
          method: payment.method,
          status: "completed",
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      // 2. update order financial state
      await supabase
        .from("pos_orders")
        .update({
          paid: true,
          payment_status: "paid",
          paid_at: new Date().toISOString()
        })
        .eq("id", order_id);

      return data;
    },

    payload: {
      payment
    }
  });
}
