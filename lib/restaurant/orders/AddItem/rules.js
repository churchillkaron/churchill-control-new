export async function applyRules({
  payload = {},
}) {
  const quantity =
    Number(payload.quantity || 1);

  if (quantity <= 0) {
    throw new Error("quantity must be greater than zero");
  }

  const price =
    Number(payload.price || 0);

  if (price < 0) {
    throw new Error("price cannot be negative");
  }

  return {
    orderId:
      payload.orderId ||
      payload.order_id,

    dishId:
      payload.dishId ||
      payload.dish_id,

    name:
      payload.name ||
      payload.itemName ||
      payload.item_name,

    quantity,
    price,

    notes:
      payload.notes || null,

    modifiers:
      payload.modifiers || {},

    seatPosition:
      payload.seatPosition ||
      payload.seat_position ||
      null,
  };
}
