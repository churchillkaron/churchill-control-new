export function calculateSplitTotals(
  splitItems = []
) {

  return splitItems.reduce(
    (
      total,
      item
    ) => {

      const modifiers =
        (
          item.order_item_modifiers ||
          []
        ).reduce(
          (
            modifierTotal,
            modifier
          ) =>
            modifierTotal +
            Number(
              modifier.modifier_price || 0
            ),
          0
        )

      const lineTotal =
        (
          Number(item.price || 0) +
          modifiers
        ) * Number(item.quantity || 1)

      return (
        total +
        lineTotal
      )

    },
    0
  )
}
