export function getSelectedQuantity(
  orderItems,
  dishId
) {
  const existingItem =
    orderItems.find(
      (item) =>
        item.dish_id === dishId
    );

  return Number(
    existingItem?.quantity || 0
  );
}

export function addItemToCart({
  orderItems,
  item,
}) {

  const stock =
    Number(item.stock || 0);

  const alreadySelected =
    getSelectedQuantity(
      orderItems,
      item.id
    );

  if (stock <= 0) {
    throw new Error(
      "This dish is out of stock"
    );
  }

  if (
    alreadySelected >= stock
  ) {
    throw new Error(
      `Only ${stock} available`
    );
  }

  const existingItem =
    orderItems.find(
      (orderItem) =>
        orderItem.dish_id ===
        item.id
    );

  if (existingItem) {
    return orderItems.map(
      (orderItem) =>
        orderItem.dish_id ===
        item.id
          ? {
              ...orderItem,
              quantity:
                Number(
                  orderItem.quantity || 1
                ) + 1,
            }
          : orderItem
    );
  }

  return [
    ...orderItems,
    {
      dish_id: item.id,
      item_name: item.name,
      price: Number(
        item.price || 0
      ),
      quantity: 1,
    },
  ];
}

export function removeItemFromCart({
  orderItems,
  dishId,
}) {

  return orderItems
    .map((item) =>
      item.dish_id === dishId
        ? {
            ...item,
            quantity:
              Number(
                item.quantity || 1
              ) - 1,
          }
        : item
    )
    .filter(
      (item) =>
        Number(
          item.quantity || 0
        ) > 0
    );
}
