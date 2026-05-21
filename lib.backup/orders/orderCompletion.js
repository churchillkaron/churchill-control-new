export function isOrderCompleted(
  order
) {

  const items =
    order.order_items || [];

  if (!items.length)
    return false;

  return items.every(
    item =>

      [
        "SERVED",
        "CLOSED",
        "CANCELLED",
      ].includes(
        item.status
      )
  );

}

export function canMoveToBilling(
  order
) {

  return isOrderCompleted(
    order
  );

}

export function canArchiveOrder(
  order
) {

  return (
    order.status ===
      "CLOSED" &&

    isOrderCompleted(
      order
    )
  );

}
