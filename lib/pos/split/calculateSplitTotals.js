export function calculateSplitTotals(
  splitItems = []
) {

  return splitItems.reduce(
    (
      total,
      item
    ) => {

      const configurationSelections =
        (
          item.transaction_configuration_selections ||
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
