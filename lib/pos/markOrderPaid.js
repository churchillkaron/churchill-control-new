import { supabase } from "@/lib/shared/supabase/client";

export async function markOrderPaid(
  orderId
) {

  if (!orderId) {
    return;
  }

  // ===== UPDATE ORDER =====
  const {
    error: orderError,
  } = await supabase
    .from("orders")
    .update({

      status:
        "PAID",

      paid_at:
        new Date().toISOString(),
    })
    .eq(
      "id",
      orderId
    );

  if (orderError) {

    console.error(
      "ORDER PAYMENT ERROR",
      orderError
    );

    throw orderError;
  }

  // ===== REALTIME EVENT =====
  await supabase
    .from("pos_realtime_events")
    .insert({

      event_type:
        "ORDER_PAID",

      entity_type:
        "ORDER",

      entity_id:
        orderId,

      status:
        "PUBLISHED",

      created_at:
        new Date().toISOString(),
    });

  return true;
}
