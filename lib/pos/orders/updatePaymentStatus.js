import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export default async function updatePaymentStatus(
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
  // PAYMENTS
  // =========================

  const {
    data: payments,
    error: paymentError,
  } = await supabaseAdmin

    .from("pos_payments")

    .select("*")

    .eq(
      "order_id",
      orderId
    );

  if (paymentError) {
    throw paymentError;
  }

  const paidTotal =
    (payments || [])

      .filter(
        payment =>

          payment.payment_status !==
          "VOIDED"
      )

      .reduce(
        (
          sum,
          payment
        ) =>

          sum +

          Number(
            payment.amount_paid || 0
          ),

        0
      );

  const orderTotal =
    Number(
      order.total_amount || 0
    );

  let paymentStatus =
    "UNPAID";

  if (
    paidTotal > 0 &&
    paidTotal < orderTotal
  ) {

    paymentStatus =
      "PARTIALLY_PAID";

  }

  if (
    paidTotal >= orderTotal &&
    orderTotal > 0
  ) {

    paymentStatus =
      "PAID";

  }

  // =========================
  // UPDATE ORDER
  // =========================

  const {
    error: updateError,
  } = await supabaseAdmin

    .from("orders")

    .update({

      amount_paid:
        paidTotal,

      payment_status:
        paymentStatus,

    })

    .eq(
      "id",
      orderId
    );

  if (updateError) {
    throw updateError;
  }

  return {

    paidTotal,
    orderTotal,
    paymentStatus,

  };

}
