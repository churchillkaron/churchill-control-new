import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export default async function createVoidReversal({
  orderItem,
}) {

  const amount =
    (
      Number(
        orderItem.price || 0
      ) *

      Number(
        orderItem.quantity || 0
      )
    ) * -1;

  const {
    error,
  } = await supabaseAdmin

    .from("payment_transactions")

    .insert({

      tenant_id:
        orderItem.tenant_id,

      order_id:
        orderItem.order_id,

      payment_type:
        "ITEM_VOID_REVERSAL",

      amount_paid:
        amount,

      total_amount:
        amount,

      change_amount:
        0,

      payment_status:
        "VOIDED",

      approved_by:
        "MANAGER",

      approved_at:
        new Date().toISOString(),

      notes:
        `Void reversal for item ${orderItem.item_name}`,

    });

  if (error) {
    throw error;
  }

}
