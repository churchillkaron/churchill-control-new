export async function applyRules({
  payload = {},
}) {
  const quantity =
    Number(payload.quantity);

  if (quantity <= 0) {
    throw new Error("quantity must be greater than zero");
  }

  return {
    orderId:
      payload.orderId ||
      payload.order_id,

    itemId:
      payload.itemId ||
      payload.item_id,

    quantity,
  };
}
