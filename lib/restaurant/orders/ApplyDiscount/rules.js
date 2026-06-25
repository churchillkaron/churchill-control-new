export async function applyRules({
  payload = {},
}) {
  const discountAmount =
    Number(
      payload.discountAmount ??
      payload.discount_amount ??
      0
    );

  if (discountAmount < 0) {
    throw new Error("discountAmount cannot be negative");
  }

  return {
    orderId:
      payload.orderId ||
      payload.order_id,

    discountAmount,

    reason:
      payload.reason || null,
  };
}
