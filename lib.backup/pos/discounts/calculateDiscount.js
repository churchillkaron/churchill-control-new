export function calculateDiscount({
  subtotal = 0,
  discount_type = 'PERCENTAGE',
  discount_value = 0,
}) {

  let discountAmount = 0

  if (
    discount_type ===
    'PERCENTAGE'
  ) {

    discountAmount =
      Number(subtotal) *
      (
        Number(
          discount_value
        ) / 100
      )

  } else {

    discountAmount =
      Number(discount_value)
  }

  return {
    discountAmount,
    finalTotal:
      Number(subtotal) -
      discountAmount,
  }
}
