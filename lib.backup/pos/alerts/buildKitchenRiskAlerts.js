export function buildKitchenRiskAlerts(
  items = []
) {

  const alerts = []

  const highRisk =
    items.filter(
      item =>
        item.status ===
        'DELAYED'
    )

  if (
    highRisk.length > 5
  ) {

    alerts.push({
      type:
        'KITCHEN_RISK',
      severity:
        'HIGH',
      count:
        highRisk.length,
    })
  }

  return alerts
}
