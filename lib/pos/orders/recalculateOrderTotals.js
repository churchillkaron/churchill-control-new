import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export default async function recalculateOrderTotals(
  orderId
) {

  // =========================
  // LOAD ACTIVE ITEMS
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
    )

    .not(
      "status",
      "eq",
      "VOIDED"
    );

  if (itemError) {
    throw itemError;
  }

  // =========================
  // SUBTOTAL
  // =========================

  const subtotal =
    (items || []).reduce(
      (
        sum,
        item
      ) =>

        sum +

        (
          Number(
            item.price || 0
          ) *

          Number(
            item.quantity || 0
          )
        ),

      0
    );

  // =========================
  // TAX
  // =========================

  const tax =
    subtotal * 0.07;

  // =========================
  // SERVICE
  // =========================

  const service =
    subtotal * 0.1;

  // =========================
  // TOTAL
  // =========================

  const total =
    subtotal +
    tax +
    service;

  // =========================
  // UPDATE ORDER
  // =========================

  const {
    error: updateError,
  } = await supabaseAdmin

    .from("orders")

    .update({

      total:
        total,

      total_amount:
        total,

    })

    .eq(
      "id",
      orderId
    );

  if (updateError) {
    throw updateError;
  }

  return {

    subtotal,
    tax,
    service,
    total,

  };

}
