export function addItemToCart({
  orderItems,
  item,
}) {

  const existing =
    orderItems.find(
      i =>
        i.dish_id ===
        item.id
    )

  if (existing) {

    return orderItems.map(
      i => {

        if (
          i.dish_id ===
          item.id
        ) {

          return {
            ...i,
            quantity:
              Number(
                i.quantity || 0
              ) + 1,
          }
        }

        return i
      }
    )
  }

  return [
    ...orderItems,
    {
      dish_id:
        item.id,

      item_name:
        item.name,

      quantity: 1,

      price:
        Number(
          item.price || 0
        ),
    },
  ]
}

export function removeItemFromCart({
  orderItems,
  dishId,
}) {

  const existing =
    orderItems.find(
      i =>
        i.dish_id ===
        dishId
    )

  if (!existing) {
    return orderItems
  }

  if (
    existing.quantity <= 1
  ) {

    return orderItems.filter(
      i =>
        i.dish_id !==
        dishId
    )
  }

  return orderItems.map(
    i => {

      if (
        i.dish_id ===
        dishId
      ) {

        return {
          ...i,
          quantity:
            Number(
              i.quantity || 0
            ) - 1,
        }
      }

      return i
    }
  )
}

export function getSelectedQuantity({
  orderItems,
  dishId,
}) {

  const existing =
    orderItems.find(
      i =>
        i.dish_id ===
        dishId
    )

  return existing
    ? existing.quantity
    : 0
}
