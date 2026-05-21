export function calculateOrderTotal(
  items = []
) {

  return items.reduce(
    (
      orderSum,
      item
    ) => {

      const modifierTotal =
        (
          item.order_item_modifiers ||
          []
        ).reduce(
          (
            modifierSum,
            modifier
          ) =>
            modifierSum +
            Number(
              modifier.modifier_price || 0
            ),
          0
        )

      const lineTotal =
        (
          Number(item.price || 0) +
          modifierTotal
        ) * Number(item.quantity || 1)

      return (
        orderSum +
        lineTotal
      )

    },
    0
  )
}
