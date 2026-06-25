export function validate({
  context,
  payload = {},
}) {
  if (!context?.organizationId) {
    throw new Error("organizationId required");
  }

  if (!payload.orderId && !payload.order_id) {
    throw new Error("orderId required");
  }

  if (
    payload.discountAmount === undefined &&
    payload.discount_amount === undefined
  ) {
    throw new Error("discountAmount required");
  }

  return true;
}
