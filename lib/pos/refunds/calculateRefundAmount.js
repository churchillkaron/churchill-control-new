export function calculateRefundAmount({
  orderTotal = 0,
  refundedItems = [],
}) {

  const refundAmount =
    refundedItems.reduce(
      (
        sum,
        item
      ) =>
        sum +
        (
          Number(
            item.price || 0
          ) *
          Number(
            item.quantity || 1
          )
        ),
      0
    )

  return {
    refundAmount,
    remainingBalance:
      Number(orderTotal) -
      refundAmount,
  }
}
