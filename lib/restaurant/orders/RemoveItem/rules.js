export async function applyRules({
  payload = {},
}) {
  return {
    orderId:
      payload.orderId ||
      payload.order_id,

    itemId:
      payload.itemId ||
      payload.item_id,
  };
}
