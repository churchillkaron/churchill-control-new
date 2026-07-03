export function calculateOrderItemTotal({
  basePrice = 0,
  quantity = 1,
  configurationSelections = [],
}) {

  const modifierTotal =
    configurationSelections.reduce(
      (sum, modifier) =>
        sum +
        Number(
          modifier.price || 0
        ),
      0
    )

  return (
    (
      Number(basePrice) +
      modifierTotal
    ) * Number(quantity)
  )
}
