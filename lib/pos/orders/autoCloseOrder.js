import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export default async function autoCloseOrder(
  orderId
) {

  // =========================
  // ORDER
  // =========================

  const {
    data: order,
    error: orderError,
  } = await supabaseAdmin

    .from("orders")

    .select("*")

    .eq(
      "id",
      orderId
    )

    .single();

  if (orderError) {
    throw orderError;
  }

  // =========================
  // ITEMS
  // =========================

  const {
    data: items,
    error: itemError,
  } = await supabaseAdmin

    .from("order_items")

    .select("*")

    .eq(
      "order_id",
      orderId
    );

  if (itemError) {
    throw itemError;
  }

  const activeItems =
    (items || []).filter(
      item =>

        ![
          "VOIDED",
          "CLOSED",
        ].includes(
          item.status
        )
    );

  // =========================
  // CLOSE CONDITIONS
  // =========================

  const fullyPaid =
    order.payment_status ===
    "PAID";

  const noActiveItems =
    activeItems.length === 0;

  if (
    !fullyPaid ||
    !noActiveItems
  ) {

    return {

      success: false,

      reason:
        "Order still active",

    };

  }

  // =========================
  // CLOSE ORDER
  // =========================

  const {
    error: closeError,
  } = await supabaseAdmin

    .from("orders")

    .update({

      status:
        "CLOSED",

      completed_at:
        new Date().toISOString(),

    })

    .eq(
      "id",
      orderId
    );

  if (closeError) {
    throw closeError;
  }

  // =========================
  // FREE TABLE
  // =========================

  await supabaseAdmin

    .from("restaurant_tables")

    .update({

      status:
        "AVAILABLE",

    })

    .eq(
      "table_name",
      order.table_number
    );

  await closeTableSession({

    tenantId:
      order.tenant_id,

    tableNumber:
      order.table_number,

  });

  return {

    success: true,

  };

}
