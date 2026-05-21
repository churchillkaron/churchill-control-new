export function buildLivePOSMetrics({
  orders = [],
  payments = [],
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

  const activeOrders =
    orders.filter(
      order =>
        ![
          'COMPLETED',
          'CANCELLED',
        ].includes(
          order.status
        )
    ).length

  const completedOrders =
    orders.filter(
      order =>
        order.status ===
        'COMPLETED'
    ).length

  const voidCount =
    voids.filter(
      voidItem =>
        voidItem.status ===
        'APPROVED'
    ).length

  const averageOrderValue =
    completedOrders > 0
      ? revenue /
        completedOrders
      : 0

  return {
    revenue:
      Number(
        revenue.toFixed(2)
      ),

    activeOrders,

    completedOrders,

    voidCount,

    averageOrderValue:
      Number(
        averageOrderValue.toFixed(2)
      ),
  }
}
