export function buildEndOfDayReport({
  payments = [],
  refunds = [],
  voids = [],
}) {

  const revenue =
    payments.reduce(
      (
        sum,
        payment
      ) =>
        sum +
        Number(
          payment.total || 0
        ),
      0
    )

  const refundTotal =
    refunds.reduce(
      (
        sum,
        refund
      ) =>
        sum +
        Number(
          refund.amount || 0
        ),
      0
    )

  const voidCount =
    voids.length

  const netRevenue =
    revenue -
    refundTotal

  return {
    revenue,
    refundTotal,
    voidCount,
    netRevenue,
    paymentsCount:
      payments.length,
    refundsCount:
      refunds.length,
  }
}
