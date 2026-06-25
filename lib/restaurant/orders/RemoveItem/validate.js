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

  if (!payload.itemId && !payload.item_id) {
    throw new Error("itemId required");
  }

  return true;
}
