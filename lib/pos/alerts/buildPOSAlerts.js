export function buildPOSAlerts({
  orders = [],
  voids = [],
  refunds = [],
}) {

  const alerts = []

  const delayedOrders =
    orders.filter(
      order => {

        if (
          order.status ===
          'COMPLETED'
        ) {
          return false
        }

        const created =
          new Date(
            order.created_at
          ).getTime()

        const now =
          Date.now()

        const minutes =
          (
            now - created
          ) / 1000 / 60

        return minutes > 30
      }
    )

  if (
    delayedOrders.length > 0
  ) {

    alerts.push({
      type:
        'DELAYED_ORDERS',
      severity:
        'HIGH',
      count:
        delayedOrders.length,
    })
  }

  const pendingVoids =
    voids.filter(
      item =>
        item.status ===
        'PENDING'
    )

  if (
    pendingVoids.length > 0
  ) {

    alerts.push({
      type:
        'PENDING_VOIDS',
      severity:
        'MEDIUM',
      count:
        pendingVoids.length,
    })
  }

  const pendingRefunds =
    refunds.filter(
      item =>
        item.status ===
        'PENDING'
    )

  if (
    pendingRefunds.length > 0
  ) {

    alerts.push({
      type:
        'PENDING_REFUNDS',
      severity:
        'MEDIUM',
      count:
        pendingRefunds.length,
    })
  }

  return alerts
}
