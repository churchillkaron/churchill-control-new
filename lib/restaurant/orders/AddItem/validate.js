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

  if (!payload.dishId && !payload.dish_id) {
    throw new Error("dishId required");
  }

  if (!payload.name && !payload.itemName && !payload.item_name) {
    throw new Error("item name required");
  }

  return true;
}
