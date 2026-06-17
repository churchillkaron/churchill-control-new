import { supabase } from "@/lib/shared/supabase/client";

export async function cancelOrder(
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
        "CANCELLED",

      cancelled_at:
        new Date().toISOString(),
    })
    .eq(
      "id",
      orderId
    );

  if (orderError) {

    console.error(
      "CANCEL ORDER ERROR",
      orderError
    );

    throw orderError;
  }

  // ===== CANCEL KITCHEN =====
  await supabase
    .from(
      "order_items"
    )
    .update({

      status:
        "CANCELLED",
    })
    .eq(
      "order_id",
      orderId
    );

  // ===== REALTIME =====
  await supabase
    .from("pos_realtime_events")
    .insert({

      event_type:
        "ORDER_CANCELLED",

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
