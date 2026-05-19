export function calculateComboPrice({
  base_price = 0,
  items = [],
  combo_discount = 0,
}) {

  const itemsTotal =
    items.reduce(
      (
        sum,
        item
      ) =>
        sum +
        Number(
          item.price || 0
        ),
      0
    )

  const subtotal =
    Number(base_price) +
    itemsTotal

  const discount =
    subtotal *
    (
      Number(
        combo_discount
      ) / 100
    )

  return {
    subtotal,
    discount,
    total:
      subtotal -
      discount,
  }
}
