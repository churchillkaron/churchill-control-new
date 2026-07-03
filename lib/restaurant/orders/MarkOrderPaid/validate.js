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

  if (!payload.paymentMethod && !payload.payment_method) {
    throw new Error("paymentMethod required");
  }

  return true;
}
