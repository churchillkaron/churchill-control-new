export async function applyRules({
  payload = {},
}) {
  return {
    orderId:
      payload.orderId ||
      payload.order_id,

    paymentMethod:
      payload.paymentMethod ||
      payload.payment_method ||
      "CASH",

    paidAmount:
      payload.paidAmount === undefined
        ? null
        : Number(payload.paidAmount || 0),

    changeAmount:
      Number(
        payload.changeAmount ||
        payload.change_amount ||
        0
      ),

    paidAt:
      payload.paidAt ||
      payload.paid_at ||
      new Date().toISOString(),

    partial:
      Boolean(payload.partial),
  };
}
